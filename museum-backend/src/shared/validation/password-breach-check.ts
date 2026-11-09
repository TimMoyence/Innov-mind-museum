import crypto from 'node:crypto';

import { AppError } from '@shared/errors/app.error';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { env } from '@src/config/env';

const DEFAULT_TIMEOUT_MS = 2000;
const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range';

export interface BreachCheckResult {
  breached: boolean;
  count: number;
  failOpen: boolean;
}

function sha1HexUpper(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').toUpperCase();
}

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
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Musaium/1.0 (+security@musaium.com)' },
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
      return { breached: false, count: 0, failOpen: false };
    }
    return { breached: true, count, failOpen: false };
  } catch (error) {
    clearTimeout(timer);
    logger.warn('hibp_unavailable_failopen', {
      error: errorMessage(error),
    });
    captureExceptionWithContext(error instanceof Error ? error : new Error(String(error)), {
      component: 'password-breach-check',
      mode: 'fail-open',
    });
    return { breached: false, count: 0, failOpen: true };
  }
}

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
