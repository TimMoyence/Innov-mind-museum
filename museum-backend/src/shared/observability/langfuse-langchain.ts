/**
 * TD-LF-02 — `langfuse-langchain` `CallbackHandler` loader (defense-in-depth
 * lazy require + fail-open). Wires LangChain-internal observations (LLM
 * generations, prompts, token/usage) into the SAME Langfuse trace created by
 * `withLangfuseTrace` (`root` + `updateRoot:true` semantics) instead of
 * starting a parallel trace per `.invoke()` call.
 *
 * Mirrors the `langfuse.client.ts` loader pattern : lazy `require()` to dodge
 * Jest+SWC eager-load issues, in-process cache (single ctor per process),
 * fail-open `null` return so a missing/broken SDK never bubbles into the hot
 * chat path. `CallbackHandler` is typed structurally as `unknown` to keep
 * `langfuse-langchain` an optional runtime dep at the type level.
 */

import { logger } from '@shared/logger/logger';

import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';

/**
 * `langfuse-langchain`'s `CallbackHandler` extends LangChain's
 * `BaseCallbackHandler` at runtime — asserting that here lets the orchestrator
 * type the `.invoke({ callbacks })` opt to LangChain's actual `Callbacks`
 * shape without widening it to `unknown[]` (which breaks structural
 * compatibility with the real `ChatOpenAI` class returned by `toModel`).
 */
type CallbackHandlerCtor = new (cfg: { root: unknown; updateRoot: boolean }) => BaseCallbackHandler;

let _CallbackHandlerCtor: CallbackHandlerCtor | null = null;
let _loadFailed = false;

function loadCallbackHandler(): CallbackHandlerCtor | null {
  if (_CallbackHandlerCtor) return _CallbackHandlerCtor;
  if (_loadFailed) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require avoids eager SDK load that breaks Jest+SWC bootstrap (same as langfuse.client.ts)
    const mod = require('langfuse-langchain') as { CallbackHandler: CallbackHandlerCtor };
    _CallbackHandlerCtor = mod.CallbackHandler;
    return _CallbackHandlerCtor;
  } catch (err) {
    _loadFailed = true;
    logger.warn('langfuse_langchain_sdk_load_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * TD-LF-02 — builds a LangChain `CallbackHandler` that appends to an existing
 * Langfuse trace (created by `withLangfuseTrace`) instead of starting a new
 * one. `updateRoot:true` lets the handler write input / output / token usage
 * onto the trace root span — that is the source signal the Langfuse cost UI
 * reads. Fail-open : returns `null` when the SDK isn't installed or the
 * constructor throws (chat path keeps running, manual `withLangfuseTrace`
 * span still produced).
 */
export function createLangfuseCallbackHandler(trace: unknown): BaseCallbackHandler | null {
  const Ctor = loadCallbackHandler();
  if (!Ctor) return null;
  try {
    return new Ctor({ root: trace, updateRoot: true });
  } catch (err) {
    logger.warn('langfuse_langchain_handler_construct_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Test-only helper — clears the cached ctor + failure flag between specs. */
export function resetLangfuseLangChainLoaderForTests(): void {
  _CallbackHandlerCtor = null;
  _loadFailed = false;
}
