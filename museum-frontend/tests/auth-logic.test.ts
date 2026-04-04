import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractUserIdFromToken } from '../features/auth/domain/authLogic.pure';

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
