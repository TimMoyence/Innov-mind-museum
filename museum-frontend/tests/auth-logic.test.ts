import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractUserIdFromToken,
  getTokenExpiryMs,
  isAccessTokenExpired,
  isAuthInvalidError,
} from '../features/auth/domain/authLogic.pure';

/** Helper: builds a fake JWT with the given payload (no real signature). */
const fakeJwt = (payload: Record<string, unknown>): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
};

describe('extractUserIdFromToken', () => {
  it('extracts user id from "id" field', () => {
    const token = fakeJwt({ id: 'user-42', email: 'a@b.com' });
    assert.equal(extractUserIdFromToken(token), 'user-42');
  });

  it('extracts user id from "sub" field when "id" is missing', () => {
    const token = fakeJwt({ sub: 'user-99' });
    assert.equal(extractUserIdFromToken(token), 'user-99');
  });

  it('prefers "id" over "sub" when both are present', () => {
    const token = fakeJwt({ id: 'from-id', sub: 'from-sub' });
    assert.equal(extractUserIdFromToken(token), 'from-id');
  });

  it('converts numeric id to string', () => {
    const token = fakeJwt({ id: 123 });
    assert.equal(extractUserIdFromToken(token), '123');
  });

  it('returns null when payload has no id or sub', () => {
    const token = fakeJwt({ email: 'a@b.com' });
    assert.equal(extractUserIdFromToken(token), null);
  });

  it('returns null for malformed JWT (not three parts)', () => {
    assert.equal(extractUserIdFromToken('not-a-jwt'), null);
  });

  it('returns null for invalid base64 in payload', () => {
    assert.equal(extractUserIdFromToken('header.!!!invalid!!!.sig'), null);
  });

  it('returns null for empty string', () => {
    assert.equal(extractUserIdFromToken(''), null);
  });
});

describe('getTokenExpiryMs', () => {
  it('returns the exp claim in milliseconds', () => {
    const expSec = Math.floor(Date.now() / 1000) + 900;
    const token = fakeJwt({ sub: '1', exp: expSec });
    assert.equal(getTokenExpiryMs(token), expSec * 1000);
  });

  it('returns null when exp claim is missing', () => {
    const token = fakeJwt({ sub: '1' });
    assert.equal(getTokenExpiryMs(token), null);
  });

  it('returns null when exp claim is not a number', () => {
    const token = fakeJwt({ sub: '1', exp: 'soon' });
    assert.equal(getTokenExpiryMs(token), null);
  });

  it('returns null for a malformed token', () => {
    assert.equal(getTokenExpiryMs('malformed'), null);
  });
});

describe('isAccessTokenExpired', () => {
  it('returns true for null or empty token', () => {
    assert.equal(isAccessTokenExpired(null), true);
    assert.equal(isAccessTokenExpired(''), true);
  });

  it('returns true for a token without exp claim', () => {
    const token = fakeJwt({ sub: '1' });
    assert.equal(isAccessTokenExpired(token), true);
  });

  it('returns true for a token that already expired', () => {
    const expSec = Math.floor(Date.now() / 1000) - 10;
    const token = fakeJwt({ sub: '1', exp: expSec });
    assert.equal(isAccessTokenExpired(token), true);
  });

  it('returns true for a token expiring within the default skew window (60s)', () => {
    const expSec = Math.floor(Date.now() / 1000) + 10;
    const token = fakeJwt({ sub: '1', exp: expSec });
    assert.equal(isAccessTokenExpired(token), true);
  });

  it('returns false for a token with ample remaining validity', () => {
    const expSec = Math.floor(Date.now() / 1000) + 900;
    const token = fakeJwt({ sub: '1', exp: expSec });
    assert.equal(isAccessTokenExpired(token), false);
  });

  it('respects a custom skew window', () => {
    const expSec = Math.floor(Date.now() / 1000) + 10;
    const token = fakeJwt({ sub: '1', exp: expSec });
    assert.equal(isAccessTokenExpired(token, 0), false);
  });
});

describe('isAuthInvalidError', () => {
  it('returns true for Unauthorized', () => {
    assert.equal(isAuthInvalidError({ kind: 'Unauthorized' }), true);
  });

  it('returns true for Forbidden', () => {
    assert.equal(isAuthInvalidError({ kind: 'Forbidden' }), true);
  });

  it('returns false for Network', () => {
    assert.equal(isAuthInvalidError({ kind: 'Network' }), false);
  });

  it('returns false for Timeout', () => {
    assert.equal(isAuthInvalidError({ kind: 'Timeout' }), false);
  });

  it('returns false for Unknown (5xx)', () => {
    assert.equal(isAuthInvalidError({ kind: 'Unknown' }), false);
  });

  it('returns false for a plain Error', () => {
    assert.equal(isAuthInvalidError(new Error('boom')), false);
  });

  it('returns false for null / undefined / string', () => {
    assert.equal(isAuthInvalidError(null), false);
    assert.equal(isAuthInvalidError(undefined), false);
    assert.equal(isAuthInvalidError('nope'), false);
  });
});
