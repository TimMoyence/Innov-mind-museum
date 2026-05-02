/**
 * Langfuse client wrapper — V12 W1 telemetry.
 *
 * Lazily instantiates a singleton Langfuse client when LANGFUSE_ENABLED=true
 * and both LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY are present. Returns
 * `null` otherwise so call sites stay branch-free via `safeTrace()`.
 *
 * @module shared/observability/langfuse.client
 */

import { logger } from '@shared/logger';
import { Langfuse } from 'langfuse';

import { env } from '@src/config/env';

let _client: Langfuse | null = null;
let _warnedMissingKeys = false;

/**
 * Returns the shared Langfuse client, or `null` if disabled / unconfigured.
 *
 * - Returns `null` when LANGFUSE_ENABLED=false (default).
 * - Returns `null` and logs once when ENABLED=true but keys are missing.
 * - Otherwise constructs the client lazily on first call.
 *
 * Always wrap call sites with `safeTrace()` from `./safeTrace.ts` so a runtime
 * exception in the SDK never bubbles into the chat path.
 */
export function getLangfuse(): Langfuse | null {
  if (!env.langfuse?.enabled) return null;

  if (!env.langfuse.publicKey || !env.langfuse.secretKey) {
    if (!_warnedMissingKeys) {
      logger.warn(
        { host: env.langfuse.host },
        'LANGFUSE_ENABLED=true but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY missing — telemetry disabled',
      );
      _warnedMissingKeys = true;
    }
    return null;
  }

  if (_client) return _client;

  _client = new Langfuse({
    publicKey: env.langfuse.publicKey,
    secretKey: env.langfuse.secretKey,
    baseUrl: env.langfuse.host,
    flushAt: 10,
    flushInterval: 5_000,
  });
  return _client;
}

/**
 * Graceful shutdown — flush pending spans before the process exits.
 *
 * MUST be called AFTER `httpServer.close()` and BullMQ worker `.close()` so
 * spans created during the in-flight drain window are queued before flush.
 * Calling this BEFORE httpServer drain will lose those spans.
 *
 * Safe to call multiple times; the second call is a no-op.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (!_client) return;
  try {
    await _client.shutdownAsync();
  } catch (err) {
    logger.warn({ err }, 'langfuse shutdownAsync failed (telemetry drop)');
  }
  _client = null;
}
