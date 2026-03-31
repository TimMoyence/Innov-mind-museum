import jwt from 'jsonwebtoken';
import { env } from '@src/config/env';

export const makeToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign(
    { sub: '1', type: 'access', jti: 'test-jti', role: 'visitor', ...overrides },
    env.auth.accessTokenSecret,
    { expiresIn: '5m' },
  );

export const adminToken = () => makeToken({ role: 'admin' });
export const visitorToken = () => makeToken({ role: 'visitor' });
export const userToken = () => makeToken();
