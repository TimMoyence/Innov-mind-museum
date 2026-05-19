/**
 * F11 (2026-05) — Server-driven Google OAuth flow for the web admin.
 *
 * State is a short-lived signed JWT carrying the OIDC nonce and the
 * post-callback `returnTo` path. Verifying the JWT on /callback gives us
 * CSRF protection (an attacker cannot forge a state without the secret)
 * AND lets us recover the nonce + returnTo without server-side storage.
 *
 * Replay protection is delegated to the existing nonce-store: the nonce
 * embedded in the state is single-use (consumed atomically by
 * SocialLoginUseCase). Even if an attacker replays a leaked state, the
 * matching Google authorization code is also single-use on Google's side,
 * and the nonce was already consumed.
 *
 * `iss` is pinned so a leaked access JWT cannot be cross-cast as a state
 * token (and vice-versa).
 */
import jwt from 'jsonwebtoken';

import { env } from '@src/config/env';

const STATE_ISSUER = 'oauth-google-state';
const STATE_TTL_SECONDS = 5 * 60;

/** OAuth callback target — `web` (cookies + frontend redirect) or `mobile` (deeplink + OTC redeem). */
export type GoogleOAuthPlatform = 'web' | 'mobile';

export interface GoogleOAuthStatePayload {
  nonce: string;
  returnTo: string;
  platform: GoogleOAuthPlatform;
}

interface SignGoogleOAuthStateInput {
  nonce: string;
  returnTo: string;
  /** Optional — defaults to `'web'` so existing admin callers don't have to opt in. */
  platform?: GoogleOAuthPlatform;
}

export function signGoogleOAuthState(payload: SignGoogleOAuthStateInput): string {
  const platform: GoogleOAuthPlatform = payload.platform ?? 'web';
  return jwt.sign(
    { nonce: payload.nonce, returnTo: payload.returnTo, platform },
    env.auth.jwtSecret,
    {
      issuer: STATE_ISSUER,
      expiresIn: STATE_TTL_SECONDS,
    },
  );
}

/**
 * Throws on invalid signature, wrong issuer, expired token, or malformed payload.
 * States minted before the `platform` field existed re-verify as `platform: 'web'`
 * (backward compat with admin redirects already in flight at deploy time).
 */
export function verifyGoogleOAuthState(token: string): GoogleOAuthStatePayload {
  // per lib-docs/jsonwebtoken/PATTERNS.md §3 L164-167 (algorithm pinning, CVE-2022-23540)
  const decoded = jwt.verify(token, env.auth.jwtSecret, {
    issuer: STATE_ISSUER,
    algorithms: ['HS256'],
  });
  if (typeof decoded !== 'object') {
    throw new Error('Invalid state payload shape');
  }
  const { nonce, returnTo, platform } = decoded as Record<string, unknown>;
  if (typeof nonce !== 'string' || typeof returnTo !== 'string') {
    throw new Error('Invalid state payload fields');
  }
  const resolvedPlatform: GoogleOAuthPlatform = platform === 'mobile' ? 'mobile' : 'web';
  return { nonce, returnTo, platform: resolvedPlatform };
}
