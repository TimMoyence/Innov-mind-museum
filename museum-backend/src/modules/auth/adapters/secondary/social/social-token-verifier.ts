import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { decodeJwtHeader, jwtHeaderSchema } from '@shared/auth/jwt-decode';
import { AppError } from '@shared/errors/app.error';
import { sameSecret } from '@shared/security/same-secret';
import { env } from '@src/config/env';

export interface SocialTokenPayload {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  firstname?: string;
  lastname?: string;
}

const JwksKeySchema = z.object({
  kty: z.string(),
  kid: z.string(),
  use: z.string(),
  alg: z.string(),
  n: z.string(),
  e: z.string(),
});

const JwksResponseSchema = z.object({
  keys: z.array(JwksKeySchema),
});

type JwksKey = z.infer<typeof JwksKeySchema>;

interface JwksCache {
  keys: JwksKey[];
  fetchedAt: number;
}

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

const jwksCaches = new Map<string, JwksCache>();

const fetchJwks = async (url: string): Promise<JwksKey[]> => {
  const cached = jwksCaches.get(url);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${url}: ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = JwksResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError({
      message: 'JWKS response failed shape validation (malformed keys payload)',
      statusCode: 401,
      code: 'JWKS_MALFORMED',
      details: { issues: parsed.error.issues, url },
    });
  }
  jwksCaches.set(url, { keys: parsed.data.keys, fetchedAt: Date.now() });
  return parsed.data.keys;
};

const jwkToPem = (jwk: JwksKey): string => {
  const key = crypto.createPublicKey({
    key: {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
    },
    format: 'jwk',
  });

  const exported = key.export({ type: 'spki', format: 'pem' });
  if (typeof exported !== 'string') {
    throw new Error('jwkToPem: expected PEM string from KeyObject.export({format:"pem"})');
  }
  return exported;
};

const getSigningKey = async (jwksUrl: string, kid: string): Promise<string> => {
  const keys = await fetchJwks(jwksUrl);
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    jwksCaches.delete(jwksUrl);
    const freshKeys = await fetchJwks(jwksUrl);
    const freshKey = freshKeys.find((k) => k.kid === kid);
    if (!freshKey) {
      throw new Error(`No matching key found for kid: ${kid}`);
    }
    return jwkToPem(freshKey);
  }
  return jwkToPem(key);
};

const decodeHeader = (token: string): { kid?: string; alg?: string } => {
  const header = decodeJwtHeader(token, jwtHeaderSchema);
  if (!header) {
    throw new Error('Invalid JWT format');
  }
  return header;
};

const invalidNonce = (): AppError =>
  new AppError({
    message: 'Invalid or replayed nonce',
    statusCode: 401,
    code: 'INVALID_NONCE',
  });

const invalidToken = (code: string, reason: string): AppError =>
  new AppError({
    message: `Invalid social ID token: ${reason}`,
    statusCode: 401,
    code,
  });

export type SafeJwtVerifyOptions = jwt.VerifyOptions & {
  algorithms: NonNullable<jwt.VerifyOptions['algorithms']>;
};

export const safeJwtVerify = (
  idToken: string,
  publicKey: string,
  options: SafeJwtVerifyOptions,
): jwt.JwtPayload => {
  const algs = (options as unknown as { algorithms?: jwt.Algorithm[] }).algorithms;
  if (!algs || algs.length === 0) {
    throw new Error('safeJwtVerify requires options.algorithms (defense-in-depth, TD-JWT-01)');
  }
  try {
    return jwt.verify(idToken, publicKey, options) as jwt.JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw invalidToken('TOKEN_EXPIRED', 'expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw invalidToken('TOKEN_INVALID', err.message);
    }
    throw err;
  }
};

const assertNonce = (
  provider: 'apple' | 'google',
  decodedNonce: unknown,
  expectedNonce: string | undefined,
): void => {
  if (expectedNonce === undefined) {
    if (env.auth.oidcNonceEnforce) {
      throw invalidNonce();
    }
    return;
  }
  if (typeof decodedNonce !== 'string' || decodedNonce.length === 0) {
    throw invalidNonce();
  }
  const expected =
    provider === 'apple'
      ? crypto.createHash('sha256').update(expectedNonce).digest('hex')
      : expectedNonce;
  if (!sameSecret(decodedNonce, expected)) {
    throw invalidNonce();
  }
};

export const verifyAppleIdToken = async (
  idToken: string,
  expectedNonce?: string,
): Promise<SocialTokenPayload> => {
  const header = decodeHeader(idToken);
  if (!header.kid) {
    throw new Error('Apple ID token missing kid in header');
  }

  const publicKey = await getSigningKey(env.auth.appleJwksUrl, header.kid);

  const decoded = safeJwtVerify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    audience: env.auth.appleClientId,
  });

  assertNonce('apple', decoded.nonce, expectedNonce);

  return {
    providerUserId: decoded.sub ?? '',
    email: typeof decoded.email === 'string' ? decoded.email : null,
    emailVerified: decoded.email_verified === 'true' || decoded.email_verified === true,
  };
};

export const verifyGoogleIdToken = async (
  idToken: string,
  expectedNonce?: string,
): Promise<SocialTokenPayload> => {
  const header = decodeHeader(idToken);
  if (!header.kid) {
    throw new Error('Google ID token missing kid in header');
  }

  const publicKey = await getSigningKey(env.auth.googleJwksUrl, header.kid);

  const decoded = safeJwtVerify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
    audience: env.auth.googleClientIds as [string, ...string[]],
  });

  assertNonce('google', decoded.nonce, expectedNonce);

  return {
    providerUserId: decoded.sub ?? '',
    email: typeof decoded.email === 'string' ? decoded.email : null,
    emailVerified: decoded.email_verified === true,
    firstname: typeof decoded.given_name === 'string' ? decoded.given_name : undefined,
    lastname: typeof decoded.family_name === 'string' ? decoded.family_name : undefined,
  };
};

export type SocialProvider = 'apple' | 'google';

export const verifySocialIdToken = async (
  provider: SocialProvider,
  idToken: string,
  expectedNonce?: string,
): Promise<SocialTokenPayload> => {
  switch (provider) {
    case 'apple':
      return await verifyAppleIdToken(idToken, expectedNonce);
    case 'google':
      return await verifyGoogleIdToken(idToken, expectedNonce);
    default:
      throw new Error(`Unsupported social provider: ${provider}`);
  }
};
