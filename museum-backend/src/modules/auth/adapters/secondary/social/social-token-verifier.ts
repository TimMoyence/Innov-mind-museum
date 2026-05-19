import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { decodeJwtHeader, jwtHeaderSchema } from '@shared/auth/jwt-decode';
import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

/** Decoded identity claims extracted from a social provider's ID token. */
export interface SocialTokenPayload {
  /** Provider-specific unique user identifier (`sub` claim). */
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  /** May be absent, e.g. Apple only sends name on first auth. */
  firstname?: string;
  lastname?: string;
}

/**
 * Runtime shape contract for a single JWKS key entry (P0-8).
 *
 * All six fields are required. Apple's and Google's JWKS endpoints both
 * publish complete RSA public keys; a key missing any of these would be
 * unusable for `crypto.createPublicKey({ format: 'jwk' })` anyway, so we
 * surface the malformation as a typed AppError BEFORE `crypto` throws a
 * generic TypeError deep in the signature-verification path.
 */
const JwksKeySchema = z.object({
  kty: z.string(),
  kid: z.string(),
  use: z.string(),
  alg: z.string(),
  n: z.string(),
  e: z.string(),
});

/**
 * Runtime shape contract for a JWKS endpoint response (P0-8).
 *
 * Closes the silent-cast gap audited in
 * `docs/audit-2026-05-12/details/01-typing.md §P1-1` — a rate-limit JSON
 * envelope ({error, retry_after}) or version-drifted key entries no longer
 * propagate as `undefined.find()` or `crypto.createPublicKey` TypeErrors.
 */
const JwksResponseSchema = z.object({
  keys: z.array(JwksKeySchema),
});

type JwksKey = z.infer<typeof JwksKeySchema>;

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

  const raw: unknown = await response.json();
  const parsed = JwksResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // P0-8: typed AppError at the auth boundary instead of a 500-class
    // TypeError surfacing from `keys.find(...)` / `crypto.createPublicKey`.
    // 401 matches the existing `invalidToken` style — the upstream JWKS
    // is part of the auth contract; if it returns garbage we cannot
    // authenticate the caller, which is a 401 from the client's POV.
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

/**
 * VerifyOptions with `algorithms` made required (non-optional).
 * Exported so tests can import for shape assertion (design D3, T2.2).
 * per lib-docs/jsonwebtoken/PATTERNS.md §3 L164-167 (algorithm pinning, CVE-2022-23540)
 */
export type SafeJwtVerifyOptions = jwt.VerifyOptions & {
  algorithms: NonNullable<jwt.VerifyOptions['algorithms']>; // required (not optional)
};

/**
 * Wraps `jsonwebtoken` verification so library errors (TokenExpiredError,
 * JsonWebTokenError including "jwt audience invalid", signature failures,
 * malformed tokens, etc.) surface as AppError 401 instead of bubbling up as
 * an opaque 500. Any non-jsonwebtoken error is re-thrown unchanged.
 *
 * `algorithms` is REQUIRED in options (must be a non-empty array).
 * per lib-docs/jsonwebtoken/PATTERNS.md §3 L164-167 (algorithm pinning, CVE-2022-23540)
 */
// @internal — exported for test contract verification only (R3 wrapper-contract test)
export const safeJwtVerify = (
  idToken: string,
  publicKey: string,
  options: SafeJwtVerifyOptions,
): jwt.JwtPayload => {
  // Runtime guard: algorithms must be present and non-empty (belt-and-braces, D3).
  // Cast to unknown first so TS does not optimize away the check on the required field
  // (third-party callers may bypass the type via `as VerifyOptions` — runtime catches them).
  // per lib-docs/jsonwebtoken/PATTERNS.md §4 'DON'T: Call verify without algorithms'
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

/**
 * F3 — assert the `nonce` claim against the server-issued expected nonce.
 *
 * Resolution rules:
 *   - `expectedNonce` provided: claim must match (`google` direct, `apple`
 *     via SHA-256 lowercase hex).
 *   - `expectedNonce` undefined + `env.auth.oidcNonceEnforce` true: throw
 *     (post-rollout, every login MUST carry a nonce).
 *   - `expectedNonce` undefined + enforce false: skip (migration window).
 */
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
  // Constant-time comparison so timing cannot leak hashed-nonce bytes.
  const a = Buffer.from(decodedNonce);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw invalidNonce();
  }
};

/**
 * F3 — when `expectedNonce` is provided, must match `sha256(expectedNonce)`
 * lowercase hex against the token's `nonce` claim (Apple hashes server-side).
 *
 * @throws {Error} If the token is invalid, expired, or the signing key cannot be found.
 */
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
    // Apple only sends name on first auth — caller must handle storage
  };
};

/**
 * F3 — when `expectedNonce` is provided, must match the token's `nonce` claim
 * verbatim (Google does NOT hash, unlike Apple).
 *
 * @throws {Error} If the token is invalid, expired, or the signing key cannot be found.
 */
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

/** Supported social OAuth providers. */
export type SocialProvider = 'apple' | 'google';

/**
 * F3 — `expectedNonce` is bound against the ID token's `nonce` claim
 * (see {@link verifyAppleIdToken} / {@link verifyGoogleIdToken}).
 *
 * @throws {Error} For unsupported providers or invalid tokens.
 */
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
