/**
 * In-memory per-email login rate limiter (SEC-05).
 * Blocks brute-force password guessing by tracking failed attempts per email address.
 * @module auth/core/useCase/login-rate-limiter
 */

import { tooManyRequests } from '@shared/errors/app.error';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_MAP_SIZE = 100_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface LoginAttempt {
  count: number;
  firstAttemptAt: number;
}

const attempts = new Map<string, LoginAttempt>();

/** Periodic sweep to evict expired entries and prevent unbounded memory growth. */
let sweepTimer: ReturnType<typeof setInterval> | null = null;
const ensureSweep = (): void => {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (now - entry.firstAttemptAt > WINDOW_MS) {
        attempts.delete(key);
      }
    }
    if (attempts.size === 0 && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, SWEEP_INTERVAL_MS);
  if (typeof sweepTimer === 'object' && 'unref' in sweepTimer) {
    sweepTimer.unref(); // Don't keep the process alive for cleanup
  }
};

/**
 * Checks whether the given email has exceeded the maximum number of login attempts.
 * @param email - The email address to check.
 * @throws {AppError} 429 if the rate limit has been exceeded.
 */
export const checkLoginRateLimit = (email: string): void => {
  const key = email.toLowerCase().trim();
  const entry = attempts.get(key);
  if (!entry) return;

  if (Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
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
  const entry = attempts.get(key);

  if (!entry || Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    // Evict oldest entry if map is at capacity
    if (attempts.size >= MAX_MAP_SIZE) {
      const oldest = attempts.keys().next().value;
      if (oldest) attempts.delete(oldest);
    }
    attempts.set(key, { count: 1, firstAttemptAt: Date.now() });
    ensureSweep();
    return;
  }

  entry.count += 1;
};

/**
 * Clears all recorded failed attempts for the given email (called on successful login).
 * @param email - The email address to clear.
 */
export const clearLoginAttempts = (email: string): void => {
  attempts.delete(email.toLowerCase().trim());
};

/** Exposed for testing only. */
export const _resetAllAttempts = (): void => {
  attempts.clear();
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
};
