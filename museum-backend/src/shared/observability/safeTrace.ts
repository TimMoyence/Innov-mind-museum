/**
 * Fail-open wrapper for Langfuse telemetry calls — V12 W1 §2.7.
 *
 * Every call site that touches the Langfuse SDK MUST go through `safeTrace()`.
 * The chat / auth / any business path should NEVER fail because Langfuse is
 * down, slow, mis-configured, or the SDK threw.
 *
 * @module shared/observability/safeTrace
 */

import { logger } from '@shared/logger';

/**
 * Runs `fn` and returns its result, or `undefined` on any throw.
 *
 * @param label  Short identifier used in the warn log on failure.
 * @param fn     Function that may invoke the Langfuse SDK.
 * @returns      `fn()` result, or `undefined` if `fn` threw.
 */
export function safeTrace<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    logger.warn({ err, label }, 'langfuse trace dropped (fail-open)');
    return undefined;
  }
}
