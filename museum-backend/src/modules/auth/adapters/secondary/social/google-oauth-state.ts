import jwt from 'jsonwebtoken';

import { env } from '@src/config/env';

const STATE_ISSUER = 'oauth-google-state';
const STATE_TTL_SECONDS = 5 * 60;

export type GoogleOAuthPlatform = 'web' | 'mobile';

export interface GoogleOAuthStatePayload {
  nonce: string;
  returnTo: string;
  platform: GoogleOAuthPlatform;
}

interface SignGoogleOAuthStateInput {
  nonce: string;
  returnTo: string;
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

export function verifyGoogleOAuthState(token: string): GoogleOAuthStatePayload {
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
