import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

/**
 * Short-lived bearer between password step and TOTP challenge (R16). Identifies
 * the user without granting access until `/auth/mfa/challenge` succeeds.
 * Signed with `MFA_SESSION_TOKEN_SECRET` (distinct from access/refresh — a leak
 * of one cannot replay the others).
 */

interface MfaSessionClaims extends JwtPayload {
  sub: string;
  type: 'mfa_session';
  mfaPending: true;
}

// lib-docs/jsonwebtoken/PATTERNS.md §3: pin iss+aud on every internal token
// to prevent token-confusion across token families (defense-in-depth).
export const MFA_SESSION_TOKEN_ISSUER = 'musaium-mfa-session';

export function issueMfaSessionToken(userId: number): string {
  // lib-docs/jsonwebtoken/PATTERNS.md §3: pin iss+aud on every internal token.
  return jwt.sign(
    {
      sub: String(userId),
      type: 'mfa_session',
      mfaPending: true,
    },
    env.auth.mfaSessionTokenSecret,
    {
      algorithm: 'HS256',
      expiresIn: env.auth.mfaSessionTokenTtlSeconds,
      issuer: MFA_SESSION_TOKEN_ISSUER,
      audience: MFA_SESSION_TOKEN_ISSUER,
    },
  );
}

const unauthorized = (message: string, code = 'INVALID_MFA_SESSION'): AppError =>
  new AppError({ message, statusCode: 401, code });

/** @throws {Error} 401 on any inconsistency. */
export function verifyMfaSessionToken(token: string): { userId: number } {
  try {
    // lib-docs/jsonwebtoken/PATTERNS.md §3: pin iss+aud to reject cross-family tokens.
    const decoded = jwt.verify(token, env.auth.mfaSessionTokenSecret, {
      algorithms: ['HS256'],
      issuer: MFA_SESSION_TOKEN_ISSUER,
      audience: MFA_SESSION_TOKEN_ISSUER,
    }) as MfaSessionClaims;

    /* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive: jwt payload runtime shape */
    if (decoded.type !== 'mfa_session' || !decoded.mfaPending || typeof decoded.sub !== 'string') {
      throw unauthorized('Invalid MFA session token');
    }
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */

    const userId = Number(decoded.sub);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw unauthorized('Invalid MFA session token');
    }
    return { userId };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unauthorized('Invalid MFA session token');
  }
}
