/**
 * Langfuse `mask` hook — central PII redaction applied to every event /
 * observation body BEFORE the SDK transports it to `cloud.langfuse.com` (or
 * self-host). Signature conforms to `langfuse-core@3.38.20`
 * `lib/index.d.ts:7126-7128` :
 *
 *     type MaskFunction = (params: { data: any }) => any;
 *
 * Applied centrally by `maskEventBodyInPlace` (`lib/index.d.ts:7407`) on
 * every event / observation body. Wired at the Langfuse ctor `{ mask: ... }`
 * option in `langfuse.client.ts:55`. When `env.langfuse.enabled === false` the
 * ctor is never instantiated → this function is never called → zero overhead
 * on the chat hot path (R9 invariant).
 *
 * R6 / R7 (spec.md 2026-05-21) — replaces free-text payloads (LangChain
 * CallbackHandler auto-capture shapes : `input.messages[*].content`,
 * `input.prompt`, `input.text`, `output.text`, `output.completion`,
 * `output.content`, top-level `messages`) with the `'[STRIPPED]'` marker.
 * Preserves `metadata`, `model`, `usage`, `usageDetails` byte-identical so
 * the Langfuse cost UI keeps populating token counts (the mask scrubs the
 * free-text, NOT the usage).
 *
 * Fail-safe (R7) : wraps the entire body in try/catch. If anything throws
 * (corrupted shape, hostile Proxy, future Langfuse body shape we don't
 * recognise) the input is returned unchanged and `logger.warn('langfuse_
 * mask_failed', { error })` is fired once — NEVER bubbles into the chat
 * path. The warn payload deliberately does NOT include the `data` itself
 * (mask just failed on it; logging it would defeat the redaction).
 *
 * Reference :
 *   - `lib-docs/langfuse/PATTERNS.md` §2.1 `mask: ({ data }) => data` ctor
 *     option, §3 DO #13.
 *   - `lib-docs/langfuse/LESSONS.md` LF-V3-05 (reclassed P0 → CLOSED
 *     2026-05-21 by this run).
 *   - Marker `'[STRIPPED]'` deliberately distinct from Sentry's
 *     `'[redacted]'` for log-reading disambiguation (design.md D4).
 */

import { logger } from '@shared/logger/logger';

const STRIPPED = '[STRIPPED]';

/** Single string-replacement at `obj[key]` when present and string-typed. */
const stripStringIfPresent = (obj: Record<string, unknown>, key: string): void => {
  if (typeof obj[key] === 'string') {
    obj[key] = STRIPPED;
  }
};

/** Mutates a messages array, replacing each `.content` string with `STRIPPED`. */
const stripMessagesArray = (messages: unknown): void => {
  if (!Array.isArray(messages)) return;
  for (const msg of messages) {
    if (
      msg &&
      typeof msg === 'object' &&
      typeof (msg as Record<string, unknown>).content === 'string'
    ) {
      (msg as Record<string, unknown>).content = STRIPPED;
    }
  }
};

/**
 * Langfuse `MaskFunction` shape — matches `langfuse-core@3.38.20`
 * `lib/index.d.ts:7126-7128` verbatim. The `data` field is intentionally
 * `any` (NOT `unknown`) because the SDK passes arbitrary event/observation
 * bodies whose shape varies per observation type (Event / Span / Generation)
 * and Langfuse v3 itself types it as `any`. Test fixtures rely on this
 * permissive typing to chain `.data.input.messages[0].content` reads.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Justification: spec.md R5 requires the signature `(params: {data: any}) => any` to conform byte-for-byte to langfuse-core@3.38.20 MaskFunction (lib/index.d.ts:7126-7128). Using `unknown` would force every consumer (and frozen test) to add structural guards on shapes the SDK itself types as `any`. Approved-by: team-state/2026-05-21-p0-c1-pii-egress/spec.md §3 R5 */
export interface MaskInput {
  data: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Langfuse `MaskFunction` — strips free-text PII from event/observation
 * bodies. Fail-safe: never throws. Returns the input `params` unchanged on
 * any internal exception (and logs `langfuse_mask_failed` once).
 */
export function stripFreeText(params: MaskInput): MaskInput {
  try {
    // Runtime is defensive — Langfuse v3 calls us with `{ data }` but tests
    // (R7) seed `{}` and other malformed shapes that the type system can't
    // express at this boundary. The interface promises `data: unknown` so
    // null / primitive / Symbol data all flow into the early-return.
    const raw = params as unknown;
    if (typeof raw !== 'object' || raw === null) return params;
    const data = (raw as { data: unknown }).data;
    if (!data || typeof data !== 'object') return params;
    const dataObj = data as Record<string, unknown>;

    // Read the three free-text-bearing branches BEFORE shallow-cloning. This
    // lets hostile shapes (R7 Proxy test — getter throws on `input`/`output`/
    // `messages`) trigger the try/catch immediately, rather than silently
    // returning a no-op clone built from the proxy's empty `ownKeys`.
    const rawInput = dataObj.input;
    const rawOutput = dataObj.output;
    const rawMessages = dataObj.messages;

    // Top-level shallow clone — keeps the function side-effect-free for the
    // caller's `params.data` object.
    const cloned: Record<string, unknown> = { ...dataObj };

    if (rawInput && typeof rawInput === 'object') {
      const inputClone: Record<string, unknown> = {
        ...(rawInput as Record<string, unknown>),
      };
      stripStringIfPresent(inputClone, 'prompt');
      stripStringIfPresent(inputClone, 'text');
      stripMessagesArray(inputClone.messages);
      cloned.input = inputClone;
    }

    if (rawOutput && typeof rawOutput === 'object') {
      const outputClone: Record<string, unknown> = {
        ...(rawOutput as Record<string, unknown>),
      };
      stripStringIfPresent(outputClone, 'text');
      stripStringIfPresent(outputClone, 'completion');
      stripStringIfPresent(outputClone, 'content');
      cloned.output = outputClone;
    }

    // Defensive top-level `messages` (some LangChain shapes put the array at
    // the root of `data` instead of under `input`).
    if (Array.isArray(rawMessages)) {
      const messagesClone = (rawMessages as unknown[]).map((m) =>
        m && typeof m === 'object' ? { ...(m as Record<string, unknown>) } : m,
      );
      stripMessagesArray(messagesClone);
      cloned.messages = messagesClone;
    }

    return { ...params, data: cloned };
  } catch (error) {
    // R7 fail-safe — NEVER let mask exceptions bubble into the SDK's
    // synchronous `maskEventBodyInPlace` path (would crash flush/enqueue).
    // Log the ERROR message only (NOT the data — mask just failed on it).
    logger.warn('langfuse_mask_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return params;
  }
}
