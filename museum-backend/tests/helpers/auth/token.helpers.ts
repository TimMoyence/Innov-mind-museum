import jwt from 'jsonwebtoken';
import { env } from '@src/config/env';

// TD-JWT-02: iss+aud must be pinned on all internal access tokens (musaium-access).
export const makeToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign(
    { sub: '1', type: 'access', jti: 'test-jti', role: 'visitor', ...overrides },
    env.auth.accessTokenSecret,
    { expiresIn: '5m', issuer: 'musaium-access', audience: 'musaium-access' },
  );

export const adminToken = () => makeToken({ role: 'admin' });
export const visitorToken = () => makeToken({ role: 'visitor' });
export const superAdminToken = () => makeToken({ role: 'super_admin' });
export const userToken = () => makeToken();
