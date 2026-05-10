/**
 * F11 (2026-05) — Server-driven Google OAuth flow for the museum-web admin.
 *
 * Two routes:
 *   GET /google/initiate?returnTo=/fr/admin
 *     Issues an OIDC nonce + signed state JWT and 302s to Google's auth screen.
 *   GET /google/callback?code=...&state=...
 *     Verifies state, exchanges the code for an id_token, hands it to the
 *     existing SocialLoginUseCase (which consumes the nonce, links/loads the
 *     user, and issues the session), sets the auth cookies + the readable
 *     `admin-authz` middleware hint cookie, then 302s to `${frontendUrl}${returnTo}`.
 *
 * The mobile path (POST /social-login with idToken) is untouched — both
 * flows funnel through the same SocialLoginUseCase.
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
} from '@modules/auth/adapters/secondary/social/google-oauth-state';
import { exchangeGoogleAuthCode } from '@modules/auth/adapters/secondary/social/google-token-exchange';
import { nonceStore, socialLoginUseCase } from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import { AUDIT_AUTH_SOCIAL_LOGIN } from '@shared/audit/audit.types';
import { env } from '@src/config/env';

const DEFAULT_RETURN_TO = '/fr/admin';
const ADMIN_AUTHZ_COOKIE = 'admin-authz';
const ADMIN_AUTHZ_TTL_SECONDS = 8 * 60 * 60;

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_SCOPE = 'openid email profile';

const authGoogleOauthRouter: Router = Router();

/**
 * Validate the `returnTo` query param. Must be a same-origin relative path
 * (`/...`) — protocol-relative URLs (`//evil.com`) and absolute URLs are
 * rejected so the callback redirect cannot be coerced into an open-redirect.
 */
function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 256) {
    return DEFAULT_RETURN_TO;
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return DEFAULT_RETURN_TO;
  }
  return raw;
}

/**
 * Web base URL the callback redirects to after a successful login. Falls back
 * to the first configured CORS origin so dev environments without an explicit
 * FRONTEND_URL keep working.
 */
function resolveWebBaseUrl(): string | null {
  if (env.frontendUrl) return env.frontendUrl.replace(/\/$/, '');
  if (env.corsOrigins.length > 0) return env.corsOrigins[0].replace(/\/$/, '');
  return null;
}

/**
 * 503 helper used when GOOGLE_OAUTH_WEB_CLIENT_ID / SECRET / REDIRECT_URI are
 * not all set. Returning JSON keeps the failure mode debuggable; the web
 * frontend will treat this like every other 503.
 */
function respondNotConfigured(res: Response): void {
  res.status(503).json({
    error: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    message: 'Google web OAuth is not configured on this backend.',
  });
}

/** Builds the post-callback redirect URL back to the museum-web login page. */
function loginErrorRedirect(reason: string): string {
  const webBase = resolveWebBaseUrl();
  const returnTarget = `${DEFAULT_RETURN_TO}/login?oauth_error=${encodeURIComponent(reason)}`;
  return webBase ? `${webBase}${returnTarget}` : returnTarget;
}

/**
 * Wraps a step of the callback pipeline so any thrown error is converted into
 * a stable {@link OAuthCallbackError} carrying the redirect reason. Keeps the
 * route handler flat (no nested try/catch chain) and well under the
 * complexity ceiling.
 */
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

/**
 * Validates the inbound /callback request: env config presence, Google's own
 * `?error=` indicator, and the {code, state} query pair. Returns either a
 * redirect reason for the route to short-circuit on, or the parsed context.
 */
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

interface CallbackOutcome {
  session: CookieSessionInput & { user: { id: number } };
  returnTo: string;
}

/** End-to-end callback pipeline: state verify -> code exchange -> social login. */
async function executeCallback(ctx: CallbackContext): Promise<CallbackOutcome> {
  const { nonce, returnTo: rawReturnTo } = await runStep('session_expired', () =>
    verifyGoogleOAuthState(ctx.stateRaw),
  );
  const idToken = await runStep('exchange_failed', () =>
    exchangeGoogleAuthCode({
      code: ctx.code,
      clientId: ctx.oauthConfig.clientId,
      clientSecret: ctx.oauthConfig.clientSecret,
      redirectUri: ctx.oauthConfig.redirectUri,
    }),
  );
  const session = await runStep('login_failed', () =>
    socialLoginUseCase.execute('google', idToken, nonce),
  );
  return { session, returnTo: sanitizeReturnTo(rawReturnTo) };
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

    const returnTo = sanitizeReturnTo(req.query.returnTo);
    const nonce = await nonceStore.issue();
    const state = signGoogleOAuthState({ nonce, returnTo });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPE,
      state,
      nonce,
      // `select_account` lets the user pick a Google account explicitly even if
      // they only have one already signed in, which avoids the "I'm logged in
      // as the wrong account" confusion on shared workstations.
      prompt: 'select_account',
      access_type: 'online',
      include_granted_scopes: 'true',
    });

    res.redirect(302, `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
  },
);

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
      res.redirect(302, loginErrorRedirect(prelude.reason));
      return;
    }

    let outcome: CallbackOutcome;
    try {
      outcome = await executeCallback(prelude.ctx);
    } catch (err) {
      const reason = err instanceof OAuthCallbackError ? err.reason : 'login_failed';
      res.redirect(302, loginErrorRedirect(reason));
      return;
    }

    setAuthCookies(res, outcome.session);
    // F11 — middleware hint cookie. Non-HttpOnly so the LoginForm/middleware
    // can read it without a network round-trip; the real session lives in the
    // HttpOnly access_token cookie. SameSite=Lax matches the auth.tsx client
    // helper so behaviour is symmetric whether the user logs in via password
    // or via Google.
    res.cookie(ADMIN_AUTHZ_COOKIE, '1', {
      path: '/',
      maxAge: ADMIN_AUTHZ_TTL_SECONDS * 1000,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
    });

    await auditService.log({
      action: AUDIT_AUTH_SOCIAL_LOGIN,
      actorType: 'user',
      actorId: outcome.session.user.id,
      targetType: 'user',
      targetId: String(outcome.session.user.id),
      metadata: { provider: 'google', flow: 'web-redirect' },
      ip: req.ip,
      requestId: req.requestId,
    });

    const webBase = resolveWebBaseUrl();
    const target = webBase ? `${webBase}${outcome.returnTo}` : outcome.returnTo;
    res.redirect(302, target);
  },
);

export default authGoogleOauthRouter;
