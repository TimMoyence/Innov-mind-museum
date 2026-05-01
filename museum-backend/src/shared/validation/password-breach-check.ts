/**
 * F10 (2026-04-30) — HIBP Pwned Passwords k-anonymity check.
 *
 * Sends only the first 5 hex chars of SHA-1(password) to
 * `https://api.pwnedpasswords.com/range/<prefix>`. The response is a list of
 * `<35-hex-suffix>:<count>` lines covering all passwords whose SHA-1 starts
 * with the same prefix; the local code scans the suffix list to determine the
 * count for THIS password without ever revealing the full hash to HIBP.
 *
 * Add-Padding: true header asks HIBP to pad the response to ~800–1000 entries
 * so observers can't infer which prefix was queried from response size.
 *
 * Failure mode: **fail-open** with a Sentry warning. A breach-list outage must
 * not lock users out of their own account. The fail-closed alternative was
 * rejected because the corpus is a third-party hosted service with no SLA.
 *
 * @see https://haveibeenpwned.com/API/v3 — Pwned Passwords API v3
 * @see https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf §3.1.1.2
 */
import crypto from 'node:crypto';

import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

/** Default HTTP timeout for the HIBP range API call. */
const DEFAULT_TIMEOUT_MS = 2000;

/** HIBP range API endpoint. */
const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range';

/** Result of a breach check. `breached:false` covers both "not found" and "fail-open on outage". */
export interface BreachCheckResult {
  breached: boolean;
  /** Times the password was seen in known breaches; 0 when not found or fail-open. */
  count: number;
  /** True when the third-party HIBP API was unreachable and we fell back to allow. */
  failOpen: boolean;
}

/**
 * SHA-1 hex (uppercased) of the input — HIBP returns suffixes in upper hex.
 *
 * SHA-1 is mandated by the [HIBP k-anonymity protocol](https://haveibeenpwned.com/API/v3#PwnedPasswords);
 * the hash never leaves the process — only the first 5 hex chars are sent over
 * the wire — so the deprecated-for-cryptography weakness does not apply here.
 * This is a checksum-style use, comparable to ETag or git's SHA-1 commit IDs.
 */
function sha1HexUpper(value: string): string {
  // eslint-disable-next-line sonarjs/hashing -- SHA-1 mandated by HIBP k-anonymity protocol; not a security primitive (full hash never leaves the process)
  return crypto.createHash('sha1').update(value).digest('hex').toUpperCase();
}

/**
 * Queries HIBP Pwned Passwords (k-anonymity) for the supplied password.
 *
 * @param password - Plain-text password (not stored, not logged).
 * @param options - Optional knobs (HTTP timeout).
 * @param options.timeoutMs - Hard timeout in ms (default 2000). On timeout the
 *   call is abandoned and `failOpen: true` is returned so the caller can
 *   proceed without locking users out on a third-party outage.
 * @returns Breach check result.
 */
export async function checkPasswordBreach(
  password: string,
  options: { timeoutMs?: number } = {},
): Promise<BreachCheckResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fullHash = sha1HexUpper(password);
  const prefix = fullHash.slice(0, 5);
  const suffix = fullHash.slice(5);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Musaium/1.0 (+security@musaium.app)' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      logger.warn('hibp_unexpected_status', { status: response.status });
      captureExceptionWithContext(new Error(`HIBP returned status ${String(response.status)}`), {
        component: 'password-breach-check',
        mode: 'fail-open',
      });
      return { breached: false, count: 0, failOpen: true };
    }

    const body = await response.text();
    const match = body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(suffix + ':'));

    if (!match) {
      return { breached: false, count: 0, failOpen: false };
    }

    const countStr = match.slice(suffix.length + 1);
    const count = Number.parseInt(countStr, 10);
    if (!Number.isFinite(count) || count <= 0) {
      // Padded entries from Add-Padding: true have count=0 → ignore.
      return { breached: false, count: 0, failOpen: false };
    }
    return { breached: true, count, failOpen: false };
  } catch (error) {
    clearTimeout(timer);
    logger.warn('hibp_unavailable_failopen', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureExceptionWithContext(error instanceof Error ? error : new Error(String(error)), {
      component: 'password-breach-check',
      mode: 'fail-open',
    });
    return { breached: false, count: 0, failOpen: true };
  }
}

/**
 * Asserts that `password` is not present in the HIBP breach corpus. Throws
 * `AppError(PASSWORD_BREACHED, 400)` when found, no-op otherwise.
 *
 * Used at registration and password-reset; password-CHANGE callers should use
 * `checkPasswordBreach` directly so they can surface a non-blocking warning
 * (the user is changing FROM a possibly stronger password to a breached one,
 * we only warn rather than refuse — see audit design §7 F10).
 */
export async function assertPasswordNotBreached(password: string): Promise<void> {
  const result = await checkPasswordBreach(password);
  if (result.breached) {
    throw new AppError({
      statusCode: 400,
      code: 'PASSWORD_BREACHED',
      message:
        'This password has appeared in known data breaches. Please choose a different password.',
    });
  }
}
