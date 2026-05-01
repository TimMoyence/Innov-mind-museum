import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      appleClientId: 'com.example.app',
      googleClientIds: ['google-client-id-1', 'google-client-id-2'],
      appleJwksUrl: 'https://appleid.apple.com/auth/keys',
      googleJwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    },
  },
}));

// Generate a real RSA key pair for JWT signing/verification
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Derive JWK components from the public key
const publicKeyObject = crypto.createPublicKey(publicKey);
const jwkExport = publicKeyObject.export({ format: 'jwk' }) as {
  n: string;
  e: string;
  kty: string;
};

const testKid = 'test-kid-123';
const mockJwksResponse = {
  keys: [
    {
      kty: jwkExport.kty,
      kid: testKid,
      use: 'sig',
      alg: 'RS256',
      n: jwkExport.n,
      e: jwkExport.e,
    },
  ],
};

/**
 * Signs a JWT with the test RSA private key. Claims like iss/aud go ONLY
 * in the payload (not duplicated in options) to avoid the jsonwebtoken library
 * "Bad options" error.
 */
const signToken = (
  payload: Record<string, unknown>,
  options: Omit<jwt.SignOptions, 'issuer' | 'audience'> = {},
): string => {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: testKid,
    expiresIn: '1h',
    ...options,
  });
};

// Mock global fetch for JWKS endpoint
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('social-token-verifier', () => {
  let verifyAppleIdToken: typeof import('@modules/auth/adapters/secondary/social-token-verifier').verifyAppleIdToken;
  let verifyGoogleIdToken: typeof import('@modules/auth/adapters/secondary/social-token-verifier').verifyGoogleIdToken;
  let verifySocialIdToken: typeof import('@modules/auth/adapters/secondary/social-token-verifier').verifySocialIdToken;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Re-import module each time to reset JWKS cache (module-level Map)
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social-token-verifier');
    verifyAppleIdToken = mod.verifyAppleIdToken;
    verifyGoogleIdToken = mod.verifyGoogleIdToken;
    verifySocialIdToken = mod.verifySocialIdToken;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockJwksResponse,
    });
  });

  describe('verifyAppleIdToken', () => {
    it('verifies a valid Apple ID token and extracts claims', async () => {
      const token = signToken({
        sub: 'apple-user-001',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.example.app',
      });

      const result = await verifyAppleIdToken(token);

      expect(result.providerUserId).toBe('apple-user-001');
      expect(result.email).toBe('user@example.com');
      expect(result.emailVerified).toBe(true);
    });

    it('rejects a token with wrong issuer', async () => {
      const token = signToken({
        sub: 'apple-user-001',
        iss: 'https://evil.com',
        aud: 'com.example.app',
      });

      await expect(verifyAppleIdToken(token)).rejects.toThrow();
    });

    it('rejects a token with wrong audience', async () => {
      const token = signToken({
        sub: 'apple-user-001',
        iss: 'https://appleid.apple.com',
        aud: 'wrong-client-id',
      });

      await expect(verifyAppleIdToken(token)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
      // Create a token that expired 1 hour ago
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          sub: 'apple-user-001',
          iss: 'https://appleid.apple.com',
          aud: 'com.example.app',
          iat: now - 7200,
          exp: now - 3600,
        },
        privateKey,
        { algorithm: 'RS256', keyid: testKid },
      );

      await expect(verifyAppleIdToken(token)).rejects.toThrow();
    });

    it('throws when kid is missing from token header', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64url');
      const token = `${header}.${payload}.fake-sig`;

      await expect(verifyAppleIdToken(token)).rejects.toThrow('missing kid');
    });

    it('handles email_verified as boolean true', async () => {
      const token = signToken({
        sub: 'apple-user',
        email: 'test@example.com',
        email_verified: true,
        iss: 'https://appleid.apple.com',
        aud: 'com.example.app',
      });

      const result = await verifyAppleIdToken(token);
      expect(result.emailVerified).toBe(true);
    });

    it('returns null email when email claim is missing', async () => {
      const token = signToken({
        sub: 'apple-user-noemail',
        iss: 'https://appleid.apple.com',
        aud: 'com.example.app',
      });

      const result = await verifyAppleIdToken(token);
      expect(result.email).toBeNull();
    });
  });

  describe('verifyGoogleIdToken', () => {
    it('verifies a valid Google ID token and extracts claims including name', async () => {
      const token = signToken({
        sub: 'google-user-001',
        email: 'user@gmail.com',
        email_verified: true,
        given_name: 'Jane',
        family_name: 'Doe',
        iss: 'https://accounts.google.com',
        aud: 'google-client-id-1',
      });

      const result = await verifyGoogleIdToken(token);

      expect(result.providerUserId).toBe('google-user-001');
      expect(result.email).toBe('user@gmail.com');
      expect(result.emailVerified).toBe(true);
      expect(result.firstname).toBe('Jane');
      expect(result.lastname).toBe('Doe');
    });

    it('accepts the alternative Google issuer (accounts.google.com without https)', async () => {
      const token = signToken({
        sub: 'google-user-002',
        iss: 'accounts.google.com',
        aud: 'google-client-id-1',
      });

      const result = await verifyGoogleIdToken(token);
      expect(result.providerUserId).toBe('google-user-002');
    });

    it('rejects a token with wrong audience for Google', async () => {
      const token = signToken({
        sub: 'google-user',
        iss: 'https://accounts.google.com',
        aud: 'wrong-google-client',
      });

      await expect(verifyGoogleIdToken(token)).rejects.toThrow();
    });
  });

  describe('verifySocialIdToken (dispatch)', () => {
    it('dispatches to Apple verifier for provider "apple"', async () => {
      const token = signToken({
        sub: 'apple-user',
        iss: 'https://appleid.apple.com',
        aud: 'com.example.app',
      });

      const result = await verifySocialIdToken('apple', token);
      expect(result.providerUserId).toBe('apple-user');
    });

    it('dispatches to Google verifier for provider "google"', async () => {
      const token = signToken({
        sub: 'google-user',
        iss: 'https://accounts.google.com',
        aud: 'google-client-id-1',
      });

      const result = await verifySocialIdToken('google', token);
      expect(result.providerUserId).toBe('google-user');
    });

    it('throws for unsupported provider', async () => {
      await expect(verifySocialIdToken('facebook' as 'apple', 'some-token')).rejects.toThrow(
        'Unsupported social provider',
      );
    });
  });

  describe('JWKS caching', () => {
    it('caches JWKS keys and reuses them for subsequent requests', async () => {
      const token1 = signToken({
        sub: 'user1',
        iss: 'https://appleid.apple.com',
        aud: 'com.example.app',
      });
      const token2 = signToken({
        sub: 'user2',
        iss: 'https://appleid.apple.com',
        aud: 'com.example.app',
      });

      await verifyAppleIdToken(token1);
      await verifyAppleIdToken(token2);

      // JWKS should be fetched only once due to caching
      const appleCalls = mockFetch.mock.calls.filter(
        (call: [string]) => typeof call[0] === 'string' && call[0].includes('apple'),
      );
      expect(appleCalls.length).toBe(1);
    });

    it('retries with fresh JWKS when kid is not found in cache', async () => {
      const unknownKid = 'unknown-kid';
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: unknownKid })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({ sub: 'test', iss: 'https://appleid.apple.com', aud: 'com.example.app' }),
      ).toString('base64url');
      const fakeToken = `${header}.${payload}.fake`;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockJwksResponse, // does not contain unknown-kid
      });

      await expect(verifyAppleIdToken(fakeToken)).rejects.toThrow('No matching key found');
    });
  });

  describe('JWKS fetch failure', () => {
    it('throws when JWKS endpoint returns non-OK response', async () => {
      // Override mock and re-import with fresh cache
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      jest.resetModules();
      const mod = await import('@modules/auth/adapters/secondary/social-token-verifier');

      const googleToken = signToken({
        sub: 'user',
        iss: 'https://accounts.google.com',
        aud: 'google-client-id-1',
      });

      await expect(mod.verifyGoogleIdToken(googleToken)).rejects.toThrow('Failed to fetch JWKS');
    });
  });
});
