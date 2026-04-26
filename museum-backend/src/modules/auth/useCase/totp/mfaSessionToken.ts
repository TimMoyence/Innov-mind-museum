import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

/**
 * Short-lived bearer token issued between the password step and the TOTP
 * challenge (R16). Carries enough state to identify the user without
 * granting any access until the `/auth/mfa/challenge` step succeeds.
 *
 * Signed with `MFA_SESSION_TOKEN_SECRET` — distinct from the access/refresh
 * secrets so a leak of one cannot replay the others.
 */

interface MfaSessionClaims extends JwtPayload {
  sub: string;
  type: 'mfa_session';
  mfaPending: true;
}

/** Issue a fresh MFA session token for the given user id. */
export function issueMfaSessionToken(userId: number): string {
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
    },
  );
}

const unauthorized = (message: string, code = 'INVALID_MFA_SESSION'): AppError =>
  new AppError({ message, statusCode: 401, code });

/**
 * Verify and decode a token issued by {@link issueMfaSessionToken}. Throws
 * `401` on any inconsistency so callers can `next(error)` straight into the
 * Express error pipeline.
 */
export function verifyMfaSessionToken(token: string): { userId: number } {
  try {
    const decoded = jwt.verify(token, env.auth.mfaSessionTokenSecret, {
      algorithms: ['HS256'],
    }) as MfaSessionClaims;

    /* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive: jwt payload runtime shape */
    if (
      decoded.type !== 'mfa_session' ||
      !decoded.mfaPending ||
      typeof decoded.sub !== 'string'
    ) {
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
