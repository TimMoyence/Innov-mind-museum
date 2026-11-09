import { HumanMessage } from '@langchain/core/messages';

import { estimatePayloadBytes } from '@modules/chat/useCase/llm/llm-prompt-builder';
import * as costPricing from '@modules/chat/adapters/secondary/llm/llm-cost-pricing';
const VISION_BYTES_EQUIVALENT_FROM_GREEN: number | undefined = (
  costPricing as unknown as { VISION_BYTES_EQUIVALENT?: number }
).VISION_BYTES_EQUIVALENT;

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

      expect(Math.abs(httpBytes - base64Bytes)).toBeLessThanOrEqual(200);
    });

    it('text-only HumanMessage is unchanged (baseline parity — no over-correction)', () => {
      const text = 'Hello, museum guide.';
      const message = new HumanMessage(text);
      const bytes = estimatePayloadBytes([message]);

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

      expect(bytes).toBeLessThan(10_000);

      if (typeof VISION_BYTES_EQUIVALENT_FROM_GREEN === 'number') {
        expect(bytes).toBeGreaterThanOrEqual(VISION_BYTES_EQUIVALENT_FROM_GREEN * 2 - 100);
      }
    });
  });

  describe('R5 sentinel coupling — green-phase export contract', () => {
    it('llm-cost-pricing exports VISION_BYTES_EQUIVALENT (T2.1)', () => {
      expect(typeof VISION_BYTES_EQUIVALENT_FROM_GREEN).toBe('number');
      expect(VISION_BYTES_EQUIVALENT_FROM_GREEN).toBe(4000);
    });
  });
});
