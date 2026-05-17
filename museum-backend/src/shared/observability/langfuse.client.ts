/**
 * Langfuse singleton (V12 W1). Returns `null` when disabled or keys missing — wrap
 * call sites with `safeTrace()` so SDK throws never bubble into chat path (UFR fail-open).
 */

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { Langfuse } from 'langfuse';

let _client: Langfuse | null = null;
let _warnedMissingKeys = false;
let _LangfuseCtor: (new (cfg: ConstructorParameters<typeof Langfuse>[0]) => Langfuse) | null = null;

/**
 * Lazy load — SDK uses `dynamicImport` internally which trips Jest+SWC at module
 * bootstrap if loaded eagerly. Returns `null` on load failure (fail-open).
 */
function loadLangfuseCtor():
  | (new (cfg: ConstructorParameters<typeof Langfuse>[0]) => Langfuse)
  | null {
  if (_LangfuseCtor) return _LangfuseCtor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require avoids eager SDK load that breaks Jest+SWC bootstrap
    const mod = require('langfuse') as {
      Langfuse: new (cfg: ConstructorParameters<typeof Langfuse>[0]) => Langfuse;
    };
    _LangfuseCtor = mod.Langfuse;
    return _LangfuseCtor;
  } catch (err) {
    logger.warn('langfuse SDK load failed (telemetry disabled)', { err });
    return null;
  }
}

export function getLangfuse(): Langfuse | null {
  if (!env.langfuse?.enabled) return null;

  if (!env.langfuse.publicKey || !env.langfuse.secretKey) {
    if (!_warnedMissingKeys) {
      logger.warn(
        'LANGFUSE_ENABLED=true but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY missing — telemetry disabled',
        { host: env.langfuse.host },
      );
      _warnedMissingKeys = true;
    }
    return null;
  }

  if (_client) return _client;

  const LangfuseCtor = loadLangfuseCtor();
  if (!LangfuseCtor) return null;

  _client = new LangfuseCtor({
    publicKey: env.langfuse.publicKey,
    secretKey: env.langfuse.secretKey,
    baseUrl: env.langfuse.host,
    flushAt: 10,
    flushInterval: 5_000,
  });
  return _client;
}

/**
 * Ordering: MUST be called AFTER `httpServer.close()` + BullMQ worker `.close()` so
 * spans created during in-flight drain are queued before flush. Calling BEFORE
 * httpServer drain loses those spans. Idempotent.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (!_client) return;
  try {
    await _client.shutdownAsync();
  } catch (err) {
    logger.warn('langfuse shutdownAsync failed (telemetry drop)', { err });
  }
  _client = null;
}
