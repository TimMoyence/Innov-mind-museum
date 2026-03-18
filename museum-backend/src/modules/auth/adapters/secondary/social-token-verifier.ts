import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '@src/config/env';

/** Decoded identity claims extracted from a social provider's ID token. */
export interface SocialTokenPayload {
  /** Provider-specific unique user identifier (`sub` claim). */
  providerUserId: string;
  /** User email from the token, or `null` if unavailable. */
  email: string | null;
  /** Whether the provider has verified the email address. */
  emailVerified: boolean;
  /** First name (may be absent, e.g. Apple only sends name on first auth). */
  firstname?: string;
  /** Last name. */
  lastname?: string;
}

interface JwksKey {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

interface JwksCache {
  keys: JwksKey[];
  fetchedAt: number;
}

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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

  const data = (await response.json()) as JwksResponse;
  jwksCaches.set(url, { keys: data.keys, fetchedAt: Date.now() });
  return data.keys;
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

  return key.export({ type: 'spki', format: 'pem' }) as unknown as string;
};

const getSigningKey = async (jwksUrl: string, kid: string): Promise<string> => {
  const keys = await fetchJwks(jwksUrl);
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    // Invalidate cache and retry once
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
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const header = JSON.parse(
    Buffer.from(parts[0], 'base64url').toString('utf8'),
  ) as { kid?: string; alg?: string };
  return header;
};

/**
 * Verifies an Apple Sign-In ID token using Apple's public JWKS.
 * @param idToken - Raw JWT string from Apple.
 * @returns Decoded identity claims.
 * @throws Error if the token is invalid, expired, or the signing key cannot be found.
 */
export const verifyAppleIdToken = async (
  idToken: string,
): Promise<SocialTokenPayload> => {
  const header = decodeHeader(idToken);
  if (!header.kid) {
    throw new Error('Apple ID token missing kid in header');
  }

  const publicKey = await getSigningKey(
    'https://appleid.apple.com/auth/keys',
    header.kid,
  );

  const decoded = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    audience: env.auth.appleClientId,
  }) as jwt.JwtPayload;

  return {
    providerUserId: decoded.sub!,
    email: typeof decoded.email === 'string' ? decoded.email : null,
    emailVerified: decoded.email_verified === 'true' || decoded.email_verified === true,
    // Apple only sends name on first auth — caller must handle storage
  };
};

/**
 * Verifies a Google Sign-In ID token using Google's public JWKS.
 * @param idToken - Raw JWT string from Google.
 * @returns Decoded identity claims.
 * @throws Error if the token is invalid, expired, or the signing key cannot be found.
 */
export const verifyGoogleIdToken = async (
  idToken: string,
): Promise<SocialTokenPayload> => {
  const header = decodeHeader(idToken);
  if (!header.kid) {
    throw new Error('Google ID token missing kid in header');
  }

  const publicKey = await getSigningKey(
    'https://www.googleapis.com/oauth2/v3/certs',
    header.kid,
  );

  const decoded = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
    audience: env.auth.googleClientIds,
  }) as jwt.JwtPayload;

  return {
    providerUserId: decoded.sub!,
    email: typeof decoded.email === 'string' ? decoded.email : null,
    emailVerified: decoded.email_verified === true,
    firstname: typeof decoded.given_name === 'string' ? decoded.given_name : undefined,
    lastname: typeof decoded.family_name === 'string' ? decoded.family_name : undefined,
  };
};

/** Supported social OAuth providers. */
export type SocialProvider = 'apple' | 'google';

/**
 * Dispatches ID-token verification to the appropriate provider verifier.
 * @param provider - Social provider (`apple` or `google`).
 * @param idToken - Raw JWT string from the provider.
 * @returns Decoded identity claims.
 * @throws Error for unsupported providers or invalid tokens.
 */
export const verifySocialIdToken = async (
  provider: SocialProvider,
  idToken: string,
): Promise<SocialTokenPayload> => {
  switch (provider) {
    case 'apple':
      return verifyAppleIdToken(idToken);
    case 'google':
      return verifyGoogleIdToken(idToken);
    default:
      throw new Error(`Unsupported social provider: ${provider}`);
  }
};
