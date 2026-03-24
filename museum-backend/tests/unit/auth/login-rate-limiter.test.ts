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

  it('resets expired entries on check', () => {
    jest.useFakeTimers();

    // Record 10 failed attempts (would block)
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('expired@test.com');
    }
    expect(() => checkLoginRateLimit('expired@test.com')).toThrow();

    // Advance past the 10-minute window
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    // Entry should now be expired and removed on check
    expect(() => checkLoginRateLimit('expired@test.com')).not.toThrow();

    jest.useRealTimers();
  });

  it('resets expired entries on record', () => {
    jest.useFakeTimers();

    recordFailedLogin('expired-record@test.com');

    // Advance past the window
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    // Recording again should start fresh (count=1, not count=2)
    recordFailedLogin('expired-record@test.com');

    // Should not throw (only 1 attempt after reset)
    expect(() => checkLoginRateLimit('expired-record@test.com')).not.toThrow();

    jest.useRealTimers();
  });
});
