/**
 * F11 — Google OAuth state JWT round-trip.
 *
 * Asserts that the signed state token preserves nonce + returnTo across
 * sign/verify, rejects tampering, and rejects tokens minted with a
 * different issuer (so a stolen access JWT cannot be cross-cast).
 */
import jwt from 'jsonwebtoken';

jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      jwtSecret: 'unit-test-state-secret-that-is-long-enough',
    },
  },
}));

import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from '@modules/auth/adapters/secondary/social/google-oauth-state';

describe('Google OAuth state JWT', () => {
  it('round-trips nonce and returnTo', () => {
    const token = signGoogleOAuthState({ nonce: 'abc123', returnTo: '/fr/admin' });
    const payload = verifyGoogleOAuthState(token);
    expect(payload).toEqual({ nonce: 'abc123', returnTo: '/fr/admin' });
  });

  it('rejects a tampered token', () => {
    const token = signGoogleOAuthState({ nonce: 'abc', returnTo: '/x' });
    const tampered = `${token.slice(0, -2)}xx`;
    expect(() => verifyGoogleOAuthState(tampered)).toThrow();
  });

  it('rejects a token minted with a different issuer', () => {
    const foreign = jwt.sign(
      { nonce: 'n', returnTo: '/x' },
      'unit-test-state-secret-that-is-long-enough',
      { issuer: 'something-else', expiresIn: 60 },
    );
    expect(() => verifyGoogleOAuthState(foreign)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      { nonce: 'n', returnTo: '/x' },
      'unit-test-state-secret-that-is-long-enough',
      { issuer: 'oauth-google-state', expiresIn: -1 },
    );
    expect(() => verifyGoogleOAuthState(expired)).toThrow();
  });

  it('rejects a payload with the wrong shape', () => {
    const bogus = jwt.sign(
      { nonce: 'n' /* returnTo missing */ },
      'unit-test-state-secret-that-is-long-enough',
      { issuer: 'oauth-google-state', expiresIn: 60 },
    );
    expect(() => verifyGoogleOAuthState(bogus)).toThrow();
  });
});
