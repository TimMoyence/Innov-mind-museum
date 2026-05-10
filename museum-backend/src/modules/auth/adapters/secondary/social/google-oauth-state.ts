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

/**
 *
 */
export interface GoogleOAuthStatePayload {
  nonce: string;
  returnTo: string;
}

/** Sign a state JWT bound to the given nonce + returnTo. Expires after 5 minutes. */
export function signGoogleOAuthState(payload: GoogleOAuthStatePayload): string {
  return jwt.sign(payload, env.auth.jwtSecret, {
    issuer: STATE_ISSUER,
    expiresIn: STATE_TTL_SECONDS,
  });
}

/**
 * Verify the state JWT and return the embedded payload. Throws on invalid
 * signature, wrong issuer, expired token, or malformed payload.
 */
export function verifyGoogleOAuthState(token: string): GoogleOAuthStatePayload {
  const decoded = jwt.verify(token, env.auth.jwtSecret, {
    issuer: STATE_ISSUER,
  });
  if (typeof decoded !== 'object') {
    throw new Error('Invalid state payload shape');
  }
  const { nonce, returnTo } = decoded as Record<string, unknown>;
  if (typeof nonce !== 'string' || typeof returnTo !== 'string') {
    throw new Error('Invalid state payload fields');
  }
  return { nonce, returnTo };
}
