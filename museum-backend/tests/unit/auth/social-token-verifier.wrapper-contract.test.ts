jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      appleClientId: 'com.example.app',
      googleClientIds: ['google-client-id-1'],
      appleJwksUrl: 'https://appleid.apple.com/auth/keys',
      googleJwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      oidcNonceEnforce: false,
    },
  },
}));

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const { publicKey: rsaPublicKey, privateKey: rsaPrivateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('R3 — safeJwtVerify wrapper contract: algorithms is required', () => {
  it('R3.A — safeJwtVerify throws when algorithms key is absent from options', async () => {
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    type ModWithWrapper = typeof mod & {
      safeJwtVerify?: (token: string, key: string, opts: Record<string, unknown>) => jwt.JwtPayload;
    };
    const { safeJwtVerify } = mod as ModWithWrapper;

    if (safeJwtVerify === undefined) {
      expect('safeJwtVerify not exported yet — green phase must export it').toBe(
        'safeJwtVerify exported',
      );
      return;
    }

    expect(() =>
      safeJwtVerify('tok', 'key', {
        issuer: 'foo',
      }),
    ).toThrow(/algorithms/i);
  });

  it('R3.B — safeJwtVerify throws when algorithms is an empty array', async () => {
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    type ModWithWrapper = typeof mod & {
      safeJwtVerify?: (token: string, key: string, opts: Record<string, unknown>) => jwt.JwtPayload;
    };
    const { safeJwtVerify } = mod as ModWithWrapper;

    if (safeJwtVerify === undefined) {
      expect('safeJwtVerify not exported yet — green phase must export it').toBe(
        'safeJwtVerify exported',
      );
      return;
    }

    expect(() =>
      safeJwtVerify('tok', 'key', {
        algorithms: [] as unknown,
      }),
    ).toThrow(/algorithms/i);
  });

  it('R3.B2 — safeJwtVerify throws when algorithms is undefined', async () => {
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    type ModWithWrapper = typeof mod & {
      safeJwtVerify?: (token: string, key: string, opts: Record<string, unknown>) => jwt.JwtPayload;
    };
    const { safeJwtVerify } = mod as ModWithWrapper;

    if (safeJwtVerify === undefined) {
      expect('safeJwtVerify not exported yet — green phase must export it').toBe(
        'safeJwtVerify exported',
      );
      return;
    }

    expect(() => safeJwtVerify('tok', 'key', { algorithms: undefined })).toThrow(/algorithms/i);
  });

  it('R3.C — safeJwtVerify succeeds for valid RS256 token with algorithms: ["RS256"]', async () => {
    jest.resetModules();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    type ModWithWrapper = typeof mod & {
      safeJwtVerify?: (token: string, key: string, opts: Record<string, unknown>) => jwt.JwtPayload;
    };
    const { safeJwtVerify } = mod as ModWithWrapper;

    if (safeJwtVerify === undefined) {
      expect(true).toBe(true);
      return;
    }

    const idToken = jwt.sign(
      {
        sub: 'google-user-123',
        email: 'user@example.com',
        email_verified: true,
        iss: 'https://accounts.google.com',
        aud: 'test-aud',
      },
      rsaPrivateKey,
      { algorithm: 'RS256', expiresIn: '1h' },
    );

    const decoded = safeJwtVerify(idToken, rsaPublicKey, {
      algorithms: ['RS256'],
      issuer: 'https://accounts.google.com',
      audience: 'test-aud',
    });

    expect(decoded).toMatchObject({ sub: 'google-user-123' });
  });
});
