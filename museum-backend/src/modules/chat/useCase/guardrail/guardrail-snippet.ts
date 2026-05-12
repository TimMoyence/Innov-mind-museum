import { createHash } from 'node:crypto';

/**
 * Redacted shape of a guardrail-blocked payload for audit logging (V13 / STRIDE R3).
 *
 * The contract is intentionally narrow:
 *   - `snippetPreview`: human-scannable head of the offending text, capped at 64
 *     UTF-16 code units. Enough for analysts to spot patterns ("ignore previous…")
 *     without storing the full prompt back in our forensic store.
 *   - `snippetFingerprint`: SHA-256 hex digest of the FULL text. Enables forensic
 *     dedup ("how many times have we blocked this exact payload?") and clustering
 *     of attack variants without reconstructing the source.
 *
 * Storing the full payload would (a) bloat the audit hash chain and (b) leak PII
 * back through forensic queries — both unacceptable for a 13-month retention window.
 */
export interface GuardrailSnippet {
  snippetPreview: string;
  snippetFingerprint: string;
}

/** Hard cap on the human-readable preview kept alongside the fingerprint. */
const SNIPPET_PREVIEW_MAX_CHARS = 64;

/**
 * Builds the audit-safe snippet shape for a guardrail-blocked payload.
 *
 * `slice` operates on UTF-16 code units. For inputs that contain astral-plane
 * characters (emoji, some CJK ideographs) this means a surrogate pair could in
 * theory be split — `slice` itself never returns a U+FFFD replacement char, it
 * just returns a half-pair. That is acceptable here: the fingerprint anchors the
 * full payload, the preview is a best-effort visual aid, and we never normalise
 * or transcode the preview (no `Buffer.from(text, 'utf8').slice()` which would
 * mid-byte-cut multibyte sequences and produce U+FFFD).
 *
 * @param fullText - Raw user / LLM text that the guardrail blocked.
 * @returns Preview (≤64 UTF-16 code units) + sha256 hex fingerprint of the full text.
 */
export function redactSnippetForAudit(fullText: string): GuardrailSnippet {
  const snippetPreview = fullText.slice(0, SNIPPET_PREVIEW_MAX_CHARS);
  const snippetFingerprint = createHash('sha256').update(fullText, 'utf8').digest('hex');
  return { snippetPreview, snippetFingerprint };
}
