import {
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  _resetAllAttempts,
} from '@modules/auth/core/useCase/login-rate-limiter';

beforeEach(() => {
  _resetAllAttempts();
});

describe('login-rate-limiter', () => {
  it('allows first attempt', () => {
    expect(() => checkLoginRateLimit('user@test.com')).not.toThrow();
  });

  it('allows up to 9 failed attempts', () => {
    for (let i = 0; i < 9; i++) {
      recordFailedLogin('user@test.com');
    }
    expect(() => checkLoginRateLimit('user@test.com')).not.toThrow();
  });

  it('blocks after 10 failed attempts', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('user@test.com');
    }
    expect(() => checkLoginRateLimit('user@test.com')).toThrow('Too many login attempts');
  });

  it('clears attempts on successful login', () => {
    for (let i = 0; i < 9; i++) {
      recordFailedLogin('user@test.com');
    }
    clearLoginAttempts('user@test.com');
    expect(() => checkLoginRateLimit('user@test.com')).not.toThrow();
  });

  it('is case-insensitive', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('User@Test.COM');
    }
    expect(() => checkLoginRateLimit('user@test.com')).toThrow();
  });
});
