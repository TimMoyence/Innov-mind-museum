/**
 * Fail-open wrapper for Langfuse SDK calls (V12 W1 §2.7).
 * Every Langfuse call site MUST go through this — business paths never fail because
 * Langfuse is down/slow/misconfigured. Returns `undefined` on any throw.
 */

import { logger } from '@shared/logger/logger';

export function safeTrace<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    logger.warn('langfuse trace dropped (fail-open)', { err, label });
    return undefined;
  }
}
