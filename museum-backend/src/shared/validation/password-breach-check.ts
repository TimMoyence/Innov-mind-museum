/**
 * F10 (2026-04-30) — HIBP Pwned Passwords k-anonymity.
 * Sends first 5 hex of SHA-1(password) → `/range/<prefix>`. Response is
 * `<35-hex-suffix>:<count>` lines; local code scans suffixes without ever
 * revealing the full hash. `Add-Padding: true` pads response to ~800–1000
 * entries so observers can't infer prefix from response size.
 *
 * Fail mode: **fail-open** + Sentry warning. Breach-list outage must not lock
 * users out (third-party, no SLA).
 *
 * @see https://haveibeenpwned.com/API/v3
 * @see https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf §3.1.1.2
 */
import crypto from 'node:crypto';

import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { env } from '@src/config/env';

const DEFAULT_TIMEOUT_MS = 2000;
const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range';

/** `breached:false` covers both "not found" and "fail-open on outage". */
export interface BreachCheckResult {
  breached: boolean;
  /** Times seen in breaches; 0 when not found or fail-open. */
  count: number;
  /** True when HIBP unreachable + fell back to allow. */
  failOpen: boolean;
}

/**
 * SHA-1 mandated by HIBP k-anonymity protocol; hash never leaves the process
 * (only first 5 hex sent over wire). Checksum-style use, not crypto primitive.
 */
function sha1HexUpper(value: string): string {
  // eslint-disable-next-line sonarjs/hashing -- SHA-1 mandated by HIBP k-anonymity protocol; not a security primitive (full hash never leaves the process)
  return crypto.createHash('sha1').update(value).digest('hex').toUpperCase();
}

/** On timeout, abandon + return `failOpen: true` (don't lock users out on third-party outage). */
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
      // Padded entries (Add-Padding: true) have count=0.
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
 * Throws `AppError(PASSWORD_BREACHED, 400)` when found.
 * Registration + password-reset use this; password-CHANGE callers use
 * `checkPasswordBreach` directly to warn non-blockingly (audit design §7 F10).
 */
export async function assertPasswordNotBreached(password: string): Promise<void> {
  if (!env.auth.passwordBreachCheckEnabled) {
    return;
  }
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
