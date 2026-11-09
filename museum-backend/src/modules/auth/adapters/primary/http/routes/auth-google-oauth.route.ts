import { type Request, type Response, Router } from 'express';

import {
  setAuthCookies,
  type CookieSessionInput,
} from '@modules/auth/adapters/primary/http/helpers/auth-cookies';
import { socialLoginLimiter } from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import { auditOwnAccount } from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
  type GoogleOAuthPlatform,
} from '@modules/auth/adapters/secondary/social/google-oauth-state';
import { exchangeGoogleAuthCode } from '@modules/auth/adapters/secondary/social/google-token-exchange';
import { nonceStore, socialLoginUseCase, socialOtcStore } from '@modules/auth/useCase';
import { AUDIT_AUTH_SOCIAL_LOGIN } from '@shared/audit/audit.types';
import { env } from '@src/config/env';

import type { AuthSessionResponse } from '@modules/auth/useCase/session/authSession.service';

const DEFAULT_RETURN_TO = '/fr/admin';
const ADMIN_AUTHZ_COOKIE = 'admin-authz';
const ADMIN_AUTHZ_TTL_SECONDS = 8 * 60 * 60;

const MOBILE_DEEPLINK_SUCCESS = 'musaium://auth/google/callback';
const MOBILE_DEEPLINK_ERROR = 'musaium://auth/google/error';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_SCOPE = 'openid email profile';

const authGoogleOauthRouter: Router = Router();

function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 256) {
    return DEFAULT_RETURN_TO;
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return DEFAULT_RETURN_TO;
  }
  return raw;
}

function resolveWebBaseUrl(): string | null {
  if (env.frontendUrl) return env.frontendUrl.replace(/\/$/, '');
  if (env.corsOrigins.length > 0) return env.corsOrigins[0].replace(/\/$/, '');
  return null;
}

function respondNotConfigured(res: Response): void {
  res.status(503).json({
    error: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    message: 'Google web OAuth is not configured on this backend.',
  });
}

function loginErrorRedirect(reason: string): string {
  const webBase = resolveWebBaseUrl();
  const returnTarget = `${DEFAULT_RETURN_TO}/login?oauth_error=${encodeURIComponent(reason)}`;
  return webBase ? `${webBase}${returnTarget}` : returnTarget;
}

function mobileErrorRedirect(reason: string): string {
  return `${MOBILE_DEEPLINK_ERROR}?reason=${encodeURIComponent(reason)}`;
}

function parsePlatformQuery(raw: unknown): GoogleOAuthPlatform {
  return raw === 'mobile' ? 'mobile' : 'web';
}

class OAuthCallbackError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

async function runStep<T>(reason: string, step: () => Promise<T> | T): Promise<T> {
  try {
    return await step();
  } catch {
    throw new OAuthCallbackError(reason);
  }
}

interface CallbackContext {
  code: string;
  stateRaw: string;
  oauthConfig: { clientId: string; clientSecret: string; redirectUri: string };
}

type CallbackPrelude =
  | { kind: 'redirect'; reason: string }
  | { kind: 'not_configured' }
  | { kind: 'ok'; ctx: CallbackContext };

function parseCallback(req: Request): CallbackPrelude {
  const oauthConfig = env.auth.googleWebOauth;
  const clientId = oauthConfig?.clientId;
  const clientSecret = oauthConfig?.clientSecret;
  const redirectUri = oauthConfig?.redirectUri;
  if (!clientId || !clientSecret || !redirectUri) {
    return { kind: 'not_configured' };
  }

  if (typeof req.query.error === 'string' && req.query.error.length > 0) {
    return { kind: 'redirect', reason: 'cancelled' };
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const stateRaw = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !stateRaw) {
    return { kind: 'redirect', reason: 'invalid_response' };
  }

  return {
    kind: 'ok',
    ctx: { code, stateRaw, oauthConfig: { clientId, clientSecret, redirectUri } },
  };
}

interface VerifiedState {
  nonce: string;
  returnTo: string;
  platform: GoogleOAuthPlatform;
}

interface CallbackOutcome {
  session: AuthSessionResponse;
  returnTo: string;
  platform: GoogleOAuthPlatform;
}

function verifyState(stateRaw: string): VerifiedState | null {
  try {
    const decoded = verifyGoogleOAuthState(stateRaw);
    return {
      nonce: decoded.nonce,
      returnTo: decoded.returnTo,
      platform: decoded.platform,
    };
  } catch {
    return null;
  }
}

async function loginFromVerifiedState(
  ctx: CallbackContext,
  state: VerifiedState,
): Promise<CallbackOutcome> {
  const idToken = await runStep('exchange_failed', () =>
    exchangeGoogleAuthCode({
      code: ctx.code,
      clientId: ctx.oauthConfig.clientId,
      clientSecret: ctx.oauthConfig.clientSecret,
      redirectUri: ctx.oauthConfig.redirectUri,
    }),
  );
  const session = await runStep('login_failed', () =>
    socialLoginUseCase.execute('google', idToken, state.nonce),
  );
  return { session, returnTo: sanitizeReturnTo(state.returnTo), platform: state.platform };
}

async function completeMobileCallback(res: Response, session: AuthSessionResponse): Promise<void> {
  const code = await socialOtcStore.issue(session);
  res.redirect(302, `${MOBILE_DEEPLINK_SUCCESS}?code=${encodeURIComponent(code)}`);
}

function completeWebCallback(res: Response, session: CookieSessionInput, returnTo: string): void {
  setAuthCookies(res, session);
  res.cookie(ADMIN_AUTHZ_COOKIE, '1', {
    path: '/',
    maxAge: ADMIN_AUTHZ_TTL_SECONDS * 1000,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
  });
  const webBase = resolveWebBaseUrl();
  const target = webBase ? `${webBase}${returnTo}` : returnTo;
  res.redirect(302, target);
}

authGoogleOauthRouter.get(
  '/google/initiate',
  socialLoginLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const oauthConfig = env.auth.googleWebOauth;
    const clientId = oauthConfig?.clientId;
    const redirectUri = oauthConfig?.redirectUri;
    if (!clientId || !redirectUri) {
      respondNotConfigured(res);
      return;
    }

    const platform = parsePlatformQuery(req.query.platform);
    const returnTo = sanitizeReturnTo(req.query.returnTo);
    const nonce = await nonceStore.issue();
    const state = signGoogleOAuthState({ nonce, returnTo, platform });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPE,
      state,
      nonce,
      prompt: 'select_account',
      access_type: 'online',
      include_granted_scopes: 'true',
    });

    res.redirect(302, `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
  },
);

function errorRedirectFor(platform: GoogleOAuthPlatform | null, reason: string): string {
  return platform === 'mobile' ? mobileErrorRedirect(reason) : loginErrorRedirect(reason);
}

authGoogleOauthRouter.get(
  '/google/callback',
  socialLoginLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const prelude = parseCallback(req);
    if (prelude.kind === 'not_configured') {
      respondNotConfigured(res);
      return;
    }
    if (prelude.kind === 'redirect') {
      res.redirect(302, errorRedirectFor(null, prelude.reason));
      return;
    }

    const state = verifyState(prelude.ctx.stateRaw);
    if (state === null) {
      res.redirect(302, errorRedirectFor(null, 'session_expired'));
      return;
    }

    let outcome: CallbackOutcome;
    try {
      outcome = await loginFromVerifiedState(prelude.ctx, state);
    } catch (err) {
      const reason = err instanceof OAuthCallbackError ? err.reason : 'login_failed';
      res.redirect(302, errorRedirectFor(state.platform, reason));
      return;
    }

    await auditOwnAccount(req, outcome.session.user.id, AUDIT_AUTH_SOCIAL_LOGIN, {
      provider: 'google',
      flow: outcome.platform === 'mobile' ? 'mobile-redirect' : 'web-redirect',
    });

    if (outcome.platform === 'mobile') {
      await completeMobileCallback(res, outcome.session);
      return;
    }
    completeWebCallback(res, outcome.session, outcome.returnTo);
  },
);

export default authGoogleOauthRouter;
