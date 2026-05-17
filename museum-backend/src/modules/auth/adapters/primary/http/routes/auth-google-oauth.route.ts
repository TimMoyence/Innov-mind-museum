/**
 * F11 (2026-05) — Server-driven Google OAuth.
 *
 *   GET /google/initiate?returnTo=&platform=web|mobile
 *     Issues OIDC nonce + signed state JWT, 302s to Google. `platform=mobile`
 *     tags state so callback completes via deeplink instead of cookies.
 *   GET /google/callback?code=&state=
 *     Verifies state, exchanges code → id_token, hands to SocialLoginUseCase
 *     (consumes nonce, links/loads user, issues session). Then:
 *       - web    → set auth cookies + admin-authz hint cookie, redirect to ${frontendUrl}${returnTo}.
 *       - mobile → store session in OTC, redirect to musaium://auth/google/callback?code=<otc>.
 *                  Mobile exchanges OTC via POST /api/auth/social-redeem.
 *
 * Legacy mobile path (POST /social-login with idToken) preserved for Apple
 * Sign-In, which binds nonce client-side via expo-apple-authentication.
 */
import { type Request, type Response, Router } from 'express';

import {
  setAuthCookies,
  type CookieSessionInput,
} from '@modules/auth/adapters/primary/http/helpers/auth-cookies';
import { socialLoginLimiter } from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
  type GoogleOAuthPlatform,
} from '@modules/auth/adapters/secondary/social/google-oauth-state';
import { exchangeGoogleAuthCode } from '@modules/auth/adapters/secondary/social/google-token-exchange';
import { nonceStore, socialLoginUseCase, socialOtcStore } from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import { AUDIT_AUTH_SOCIAL_LOGIN } from '@shared/audit/audit.types';
import { env } from '@src/config/env';

import type { AuthSessionResponse } from '@modules/auth/useCase/session/authSession.service';

const DEFAULT_RETURN_TO = '/fr/admin';
const ADMIN_AUTHZ_COOKIE = 'admin-authz';
const ADMIN_AUTHZ_TTL_SECONDS = 8 * 60 * 60;

/**
 * F11-mobile — hardcoded (not client-supplied) closes off open-redirect class:
 * attacker cannot coerce callback into delivering session OTC to hostile scheme.
 */
const MOBILE_DEEPLINK_SUCCESS = 'musaium://auth/google/callback';
const MOBILE_DEEPLINK_ERROR = 'musaium://auth/google/error';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_SCOPE = 'openid email profile';

const authGoogleOauthRouter: Router = Router();

/** Must be same-origin relative path; protocol-relative + absolute rejected (open-redirect defence). */
function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 256) {
    return DEFAULT_RETURN_TO;
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return DEFAULT_RETURN_TO;
  }
  return raw;
}

/** Falls back to first CORS origin so dev envs without FRONTEND_URL keep working. */
function resolveWebBaseUrl(): string | null {
  if (env.frontendUrl) return env.frontendUrl.replace(/\/$/, '');
  if (env.corsOrigins.length > 0) return env.corsOrigins[0].replace(/\/$/, '');
  return null;
}

/** Used when GOOGLE_OAUTH_WEB_CLIENT_ID/SECRET/REDIRECT_URI not all set. */
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

/** F11-mobile — same `reason` query as web for parity error copy. */
function mobileErrorRedirect(reason: string): string {
  return `${MOBILE_DEEPLINK_ERROR}?reason=${encodeURIComponent(reason)}`;
}

/** F11-mobile — anything other than 'mobile' defaults to 'web' (existing behaviour). */
function parsePlatformQuery(raw: unknown): GoogleOAuthPlatform {
  return raw === 'mobile' ? 'mobile' : 'web';
}

/** Stable error carrying redirect reason; keeps route flat (no nested try/catch). */
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

/** Validates env config, Google's `?error=`, and {code,state}. */
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

/**
 * Pulled out so route reads platform BEFORE later failures (mobile errors
 * redirect via deeplink, closing in-app browser cleanly). State verify failure
 * = platform unknown → caller defaults to web error path.
 */
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

/** Code exchange + social login. Throws {@link OAuthCallbackError} on either failure. */
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

/** F11-mobile — stash session under OTC, 302 to hardcoded deeplink with code. */
async function completeMobileCallback(res: Response, session: AuthSessionResponse): Promise<void> {
  const code = await socialOtcStore.issue(session);
  res.redirect(302, `${MOBILE_DEEPLINK_SUCCESS}?code=${encodeURIComponent(code)}`);
}

/** F11 (web) — set auth cookies + `admin-authz` hint cookie, 302 to `returnTo`. */
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
      // Avoid "logged in as wrong account" on shared workstations.
      prompt: 'select_account',
      access_type: 'online',
      include_granted_scopes: 'true',
    });

    res.redirect(302, `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
  },
);

/** Mobile failures → deeplink (closes in-app browser); everything else → web error page. */
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
      // Pre-state failure: platform unknown → default to web.
      res.redirect(302, errorRedirectFor(null, prelude.reason));
      return;
    }

    const state = verifyState(prelude.ctx.stateRaw);
    if (state === null) {
      // State did not verify (sig/expiry/shape): platform unknown.
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

    await auditService.log({
      action: AUDIT_AUTH_SOCIAL_LOGIN,
      actorType: 'user',
      actorId: outcome.session.user.id,
      targetType: 'user',
      targetId: String(outcome.session.user.id),
      metadata: {
        provider: 'google',
        flow: outcome.platform === 'mobile' ? 'mobile-redirect' : 'web-redirect',
      },
      ip: req.ip,
      requestId: req.requestId,
    });

    if (outcome.platform === 'mobile') {
      await completeMobileCallback(res, outcome.session);
      return;
    }
    completeWebCallback(res, outcome.session, outcome.returnTo);
  },
);

export default authGoogleOauthRouter;
