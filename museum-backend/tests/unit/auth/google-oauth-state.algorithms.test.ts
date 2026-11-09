jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      jwtSecret: 'unit-test-state-secret-that-is-long-enough-32c',
    },
  },
}));

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

import { verifyGoogleOAuthState } from '@modules/auth/adapters/secondary/social/google-oauth-state';

const TEST_SECRET = 'unit-test-state-secret-that-is-long-enough-32c';
const STATE_ISSUER = 'oauth-google-state';

describe('R1 — verifyGoogleOAuthState must pass algorithms: ["HS256"] to jwt.verify', () => {
  let verifySpy: jest.SpyInstance;

  beforeEach(() => {
    verifySpy = jest.spyOn(jwt, 'verify');
  });

  afterEach(() => {
    verifySpy.mockRestore();
  });

  it('R1.1 — jwt.verify third argument deep-equals { issuer, algorithms: ["HS256"] }', () => {
    const token = jwt.sign(
      { nonce: 'test-nonce', returnTo: '/fr/admin', platform: 'web' },
      TEST_SECRET,
      { issuer: STATE_ISSUER, expiresIn: 60 },
    );

    verifyGoogleOAuthState(token);

    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(verifySpy.mock.calls[0][2]).toEqual({
      issuer: STATE_ISSUER,
      algorithms: ['HS256'],
    });
  });

  it('R1.2 — token forged with algorithm "none" is rejected', () => {
    const unsignedToken = jwt.sign({ nonce: 'n', returnTo: '/x', platform: 'web' }, '', {
      issuer: STATE_ISSUER,
      expiresIn: 60,
      algorithm: 'none',
    });

    expect(() => verifyGoogleOAuthState(unsignedToken)).toThrow();
  });

  it('R1.3 — token signed with RS256 is rejected (algorithm confusion guard)', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const rs256Token = jwt.sign({ nonce: 'n', returnTo: '/x', platform: 'web' }, privateKey, {
      algorithm: 'RS256',
      issuer: STATE_ISSUER,
      expiresIn: 60,
    });

    expect(() => verifyGoogleOAuthState(rs256Token)).toThrow();
  });
});
