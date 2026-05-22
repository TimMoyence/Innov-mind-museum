/**
 * RED tests — C2 I-SEC2 image payload byte inflation.
 *
 * RUN_ID 2026-05-21-p0-c2-cost-breaker.
 * Spec §3 R4 — `estimatePayloadBytes()` MUST bound base64 / http image_url
 *              content items to `VISION_BYTES_EQUIVALENT` (default 4000),
 *              independent of source URL length.
 * Design.md §6 Test plan — `llm-prompt-builder-image-payload.spec.ts`.
 *
 * Today's behaviour (RED expectation):
 *  - `toContentString` calls `JSON.stringify(item)` on every non-text item
 *    (`llm-prompt-builder.ts:431`). A 100 KB base64 data-URL becomes a
 *    ~100 000-byte string in the serialized payload.
 *  - `estimatePayloadBytes()` returns the literal byte length → ×100-1000
 *    vs realistic per-image provider tokens (85-1024).
 *  - The breaker — once wired (A6/A7) — trips immediately on the first image
 *    request because of this inflation.
 *
 * Green phase (T2.1 + T2.2) exports `VISION_BYTES_EQUIVALENT` from
 * `llm-cost-pricing.ts` and rewires `estimatePayloadBytes()` to substitute the
 * constant in lieu of the literal item bytes for `{type:'image_url', ...}`
 * entries. After green, all four assertions below pass.
 */

import { HumanMessage } from '@langchain/core/messages';

import { estimatePayloadBytes } from '@modules/chat/useCase/llm/llm-prompt-builder';
// IMPORT-PROBE — the constant does NOT exist today. Compilation failure or
// `undefined` at runtime is part of the RED contract (T2.1 exports it).
// We tolerate `undefined` at runtime so the tests still execute & FAIL on the
// numeric expectations rather than at module load. After T2.1 lands, the
// import resolves and the assertions remain the load-bearing signal.
import * as costPricing from '@modules/chat/adapters/secondary/llm/llm-cost-pricing';
const VISION_BYTES_EQUIVALENT_FROM_GREEN: number | undefined = (
  costPricing as unknown as { VISION_BYTES_EQUIVALENT?: number }
).VISION_BYTES_EQUIVALENT;

/** Builds a base64 data-URL of approximately `targetBytes` raw bytes in the
 * `url` field. Test fixture, not a fake — the payload IS the input under
 * test (we want a real string of N bytes flowing through `toContentString`). */
function makeBase64DataUrl(approxBytes: number): string {
  const prefix = 'data:image/jpeg;base64,';
  const padded = 'A'.repeat(Math.max(0, approxBytes - prefix.length));
  return prefix + padded;
}

describe('estimatePayloadBytes — image payload override (RUN_ID 2026-05-21-p0-c2-cost-breaker)', () => {
  describe('R4 — base64 data-URL image_url items count fixed vision bytes, NOT literal base64', () => {
    it('text + 100 KB base64 data-URL → total payload bytes < 5000', () => {
      const text = 'What is this artwork?';
      const dataUrl = makeBase64DataUrl(100_000);
      const message = new HumanMessage({
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      });

      const bytes = estimatePayloadBytes([message]);

      // R4 invariant: image contributes a bounded forfait (default 4000 bytes
      // via VISION_BYTES_EQUIVALENT). Plus text (~21 bytes) + JSON overhead for
      // the text item (~30 bytes) ⇒ comfortably under 5000.
      expect(bytes).toBeLessThan(5000);
    });

    it('text + http(s) URL image_url and text + base64 image_url return ~equal byte counts (source-agnostic — D2)', () => {
      const text = 'What is this artwork?';

      const httpMessage = new HumanMessage({
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: 'https://example.com/img.jpg' } },
        ],
      });

      const base64Message = new HumanMessage({
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: makeBase64DataUrl(100_000) } },
        ],
      });

      const httpBytes = estimatePayloadBytes([httpMessage]);
      const base64Bytes = estimatePayloadBytes([base64Message]);

      // D2 — source-agnostic image override. Provider bills the same regardless
      // of transport mode (URL vs inline base64). The two messages MUST map to
      // the same forfait → byte counts differ by at most ±200 (text + JSON
      // overhead drift, NOT the URL length).
      expect(Math.abs(httpBytes - base64Bytes)).toBeLessThanOrEqual(200);
    });

    it('text-only HumanMessage is unchanged (baseline parity — no over-correction)', () => {
      const text = 'Hello, museum guide.';
      const message = new HumanMessage(text);
      const bytes = estimatePayloadBytes([message]);

      // Text-only path stays at the raw text byte length (+ no JSON overhead
      // because content is a string, not an array). 20 chars ASCII ≈ 20 bytes.
      expect(bytes).toBeGreaterThanOrEqual(text.length);
      expect(bytes).toBeLessThan(text.length + 50);
    });

    it('two image_url items contribute approximately 2 × VISION_BYTES_EQUIVALENT', () => {
      const message = new HumanMessage({
        content: [
          { type: 'text', text: 'Compare these two artworks.' },
          { type: 'image_url', image_url: { url: makeBase64DataUrl(100_000) } },
          { type: 'image_url', image_url: { url: makeBase64DataUrl(100_000) } },
        ],
      });

      const bytes = estimatePayloadBytes([message]);

      // Expected forfait = 2 × 4000 = 8000 bytes + text + JSON overhead.
      // Today: each base64 string flows through `JSON.stringify(item)` → > 200 000.
      // R4 invariant: additive override, capped well under 10 000.
      expect(bytes).toBeLessThan(10_000);

      // Sanity check on the constant flow: if the green-phase export exists,
      // the floor is ≥ 2 × VISION_BYTES_EQUIVALENT (minus any rounding /
      // optimization). Skip when the import probe is undefined (pre-green).
      if (typeof VISION_BYTES_EQUIVALENT_FROM_GREEN === 'number') {
        expect(bytes).toBeGreaterThanOrEqual(VISION_BYTES_EQUIVALENT_FROM_GREEN * 2 - 100);
      }
    });
  });

  describe('R5 sentinel coupling — green-phase export contract', () => {
    it('llm-cost-pricing exports VISION_BYTES_EQUIVALENT (T2.1)', () => {
      // RED today : export missing → undefined.
      // GREEN (T2.1) : VISION_BYTES_EQUIVALENT = VISION_TOKEN_EQUIVALENT * BYTES_PER_TOKEN = 4000.
      expect(typeof VISION_BYTES_EQUIVALENT_FROM_GREEN).toBe('number');
      expect(VISION_BYTES_EQUIVALENT_FROM_GREEN).toBe(4000);
    });
  });
});
