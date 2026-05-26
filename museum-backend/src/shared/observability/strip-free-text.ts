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
 * Cycle 2 (spec-cycle2.md 2026-05-26, REQ-1..10) — multimodal `content`. The
 * core product shape ("photograph an artwork then chat") builds a
 * `HumanMessage` whose `content` is an ARRAY of parts
 * `[{type:'text', text}, {type:'image_url', image_url:{url:'data:...base64'}}]`
 * (producer `llm-prompt-builder.ts`). Each `type:'text'` part has its `text`
 * stripped (A-03) and each `type:'image_url'` part has its data-URL / signed
 * URL stripped (A-05), for both the `{url}` object form and the bare-string
 * form. Unknown part types are left untouched (REQ-7, accepted residue). The
 * single array-aware helper `stripContentValue` is reused across input
 * messages, top-level messages, and `output.content` (PATTERNS.md §3 DO #13 —
 * one central hook).
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

/**
 * Strip the free-text PII of a single multimodal `content` PART, returning a
 * NEW part (immutable — never mutates the caller's object). Recognised shapes :
 *  - `type:'text'`  → `text` replaced with `STRIPPED` when it is a NON-EMPTY
 *    string (A-03). Empty string left as-is (nothing to leak, REQ-6/T-09) ;
 *    a missing `text` field left untouched (REQ-6/T-08).
 *  - `type:'image_url'` → the URL / data-URL replaced with `STRIPPED` (A-05),
 *    structure preserved. Both the object form `{ image_url: { url } }` and
 *    the bare-string form `{ image_url: 'data:...' }` are handled (REQ-2 / R-3).
 *  - any other `type` (or no `type`) → returned unchanged (REQ-7, accepted
 *    residue ; Musaium only emits `text` + `image_url`).
 */
const stripContentPart = (part: unknown): unknown => {
  if (!part || typeof part !== 'object') return part;
  const partObj = part as Record<string, unknown>;

  if (partObj.type === 'text') {
    // Non-empty string → strip ; empty string / absent / non-string → leave.
    if (typeof partObj.text === 'string' && partObj.text !== '') {
      return { ...partObj, text: STRIPPED };
    }
    return part;
  }

  if (partObj.type === 'image_url') {
    const imageUrl = partObj.image_url;
    if (typeof imageUrl === 'string') {
      // Bare-string variant: { type:'image_url', image_url:'data:...' }.
      return { ...partObj, image_url: STRIPPED };
    }
    if (imageUrl && typeof imageUrl === 'object') {
      // Object variant: { type:'image_url', image_url:{ url:'data:...' } }.
      return {
        ...partObj,
        image_url: { ...(imageUrl as Record<string, unknown>), url: STRIPPED },
      };
    }
    return part;
  }

  return part;
};

/**
 * Strip the free-text PII of a `content` VALUE, whatever its form. Returns a
 * NEW value (immutable → idempotent + side-effect-free) :
 *  - `string`           → `STRIPPED` (legacy text-only behaviour, REQ-3).
 *  - `Array` (multimodal) → each part mapped through `stripContentPart` (REQ-1/2).
 *  - anything else (`null`/`undefined`/number/object) → returned unchanged (REQ-5).
 *
 * A hostile array (Proxy whose `map`/`length`/index getters throw, T-18) makes
 * `.map` throw here ; the exception propagates to the global try/catch in
 * `stripFreeText` (REQ-10 fail-safe) — no per-part catch (that would mask a
 * partial leak).
 */
const stripContentValue = (value: unknown): unknown => {
  if (typeof value === 'string') return STRIPPED;
  if (Array.isArray(value)) return value.map(stripContentPart);
  return value;
};

/**
 * Returns a NEW messages array with each `.content` masked via
 * `stripContentValue` (string → `STRIPPED`, multimodal array → parts stripped).
 * Each message is shallow-cloned before mutation so the caller's objects stay
 * untouched (side-effect-free). Non-object entries / messages without a
 * `content` key are passed through unchanged (REQ-5/T-14).
 */
const stripMessagesArray = (messages: unknown): unknown => {
  if (!Array.isArray(messages)) return messages;
  return (messages as unknown[]).map((msg): unknown => {
    if (!msg || typeof msg !== 'object') return msg;
    const msgObj = msg as Record<string, unknown>;
    if (!('content' in msgObj)) return { ...msgObj };
    return { ...msgObj, content: stripContentValue(msgObj.content) };
  });
};

/**
 * Mask the free-text branches of a body's `input` object (clone-then-mutate,
 * side-effect-free). `prompt` / `text` are always strings ; `messages` is an
 * array of (possibly multimodal) messages. Returns a NEW input clone.
 */
const stripInputObject = (rawInput: Record<string, unknown>): Record<string, unknown> => {
  const inputClone: Record<string, unknown> = { ...rawInput };
  stripStringIfPresent(inputClone, 'prompt');
  stripStringIfPresent(inputClone, 'text');
  if (Array.isArray(inputClone.messages)) {
    inputClone.messages = stripMessagesArray(inputClone.messages);
  }
  return inputClone;
};

/**
 * Mask the free-text branches of a body's `output` object (clone-then-mutate).
 * `text` / `completion` are always strings ; `content` may be a string OR a
 * multimodal array (REQ-4 symmetry). Returns a NEW output clone.
 */
const stripOutputObject = (rawOutput: Record<string, unknown>): Record<string, unknown> => {
  const outputClone: Record<string, unknown> = { ...rawOutput };
  stripStringIfPresent(outputClone, 'text');
  stripStringIfPresent(outputClone, 'completion');
  // Only reassign when the key exists so we never introduce a spurious
  // `content: undefined`.
  if ('content' in outputClone) {
    outputClone.content = stripContentValue(outputClone.content);
  }
  return outputClone;
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
      cloned.input = stripInputObject(rawInput as Record<string, unknown>);
    }

    if (rawOutput && typeof rawOutput === 'object') {
      cloned.output = stripOutputObject(rawOutput as Record<string, unknown>);
    }

    // Defensive top-level `messages` (some LangChain shapes put the array at
    // the root of `data` instead of under `input`). `stripMessagesArray`
    // returns a NEW array with each message shallow-cloned and its `content`
    // masked (string OR multimodal array, REQ-1/2 T-19).
    if (Array.isArray(rawMessages)) {
      cloned.messages = stripMessagesArray(rawMessages);
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
