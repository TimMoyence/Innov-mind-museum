/**
 * In-memory per-email login rate limiter (SEC-05).
 * Blocks brute-force password guessing by tracking failed attempts per email address.
 * @module auth/core/useCase/login-rate-limiter
 */

import { tooManyRequests } from '@shared/errors/app.error';
import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

interface LoginAttempt {
  count: number;
  firstAttemptAt: number;
}

const store = new InMemoryBucketStore<LoginAttempt>({
  isExpired: (entry, now) => now - entry.firstAttemptAt > WINDOW_MS,
});

/**
 * Checks whether the given email has exceeded the maximum number of login attempts.
 * @param email - The email address to check.
 * @throws {AppError} 429 if the rate limit has been exceeded.
 */
export const checkLoginRateLimit = (email: string): void => {
  const key = email.toLowerCase().trim();
  const entry = store.get(key);
  if (!entry) return;

  if (Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    store.delete(key);
    return;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    throw tooManyRequests('Too many login attempts. Please try again later.');
  }
};

/**
 * Records a failed login attempt for the given email.
 * @param email - The email address that failed to authenticate.
 */
export const recordFailedLogin = (email: string): void => {
  const key = email.toLowerCase().trim();
  const entry = store.get(key);

  if (!entry || Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    store.set(key, { count: 1, firstAttemptAt: Date.now() });
    return;
  }

  entry.count += 1;
};

/**
 * Clears all recorded failed attempts for the given email (called on successful login).
 * @param email - The email address to clear.
 */
export const clearLoginAttempts = (email: string): void => {
  store.delete(email.toLowerCase().trim());
};

/** Exposed for testing only. */
export const _resetAllAttempts = (): void => {
  store.clear();
};
