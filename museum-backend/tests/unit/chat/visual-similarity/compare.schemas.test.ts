/**
 * RED — T6.1 — Zod schemas for `POST /chat/compare` body + 200 response.
 *
 * Locks down tasks.md T6.1 + spec R6 (image input rejection), R17 (`topK ∈
 * [1,10]`, default 5), R18 (image size cap mirrors `LLM_MAX_IMAGE_BYTES`)
 * and the design.md §5 wire shape:
 *   - `sessionId` is a UUID,
 *   - `topK` is an integer in `[1, 10]`, default 5 (R17),
 *   - `museumQids` is an optional array of `^Q[1-9][0-9]*$` items, max 20,
 *   - `locale` is the `'fr' | 'en'` enum used by the use-case,
 *   - the response carries the {@link CompareResult} envelope (matches +
 *     durationMs + modelVersion + optional fallbackReason).
 *
 * Image bytes themselves arrive via `multer.single('image')` (multipart
 * file field), NOT via the request body — mirrors `chat-message.route.ts`.
 * The body schema therefore validates everything BUT the image payload.
 *
 * SUT does not yet exist (Phase 6 wiring). The dynamic require() below
 * yields a "Cannot find module …" RED until the editor lands
 * `compare.schemas.ts`.
 */

import {
  DEFAULT_MODEL_VERSION,
  makeCompareMatch,
  makeCompareResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

import type { z } from 'zod';

// ---------------------------------------------------------------------------
// SUT — Phase 6 module, must not yet exist.
// ---------------------------------------------------------------------------

interface CompareSchemasModule {
  compareRequestSchema: z.ZodType<{
    sessionId: string;
    topK: number;
    locale?: 'fr' | 'en';
    museumQids?: string[];
  }>;
  compareResponseSchema: z.ZodType<unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load (Phase 6 RED)
const sut = require(
  '@modules/chat/adapters/primary/http/schemas/compare.schemas',
) as CompareSchemasModule;

const { compareRequestSchema, compareResponseSchema } = sut;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const VALID_SESSION_ID = '8c7b1e0a-3f4d-4e21-9b6a-1c2d3e4f5a6b';

/**
 * Builds a known-good body payload that the schema MUST accept.
 * @param overrides - Partial overrides merged on top of the canonical defaults.
 * @returns A plain object suitable for `compareRequestSchema.safeParse(...)`.
 */
const validBody = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  sessionId: VALID_SESSION_ID,
  topK: 5,
  locale: 'fr',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Request schema — happy paths
// ---------------------------------------------------------------------------

describe('compareRequestSchema (T6.1 — body validation)', () => {
  it('accepts a fully valid body', () => {
    const result = compareRequestSchema.safeParse(validBody());
    expect(result.success).toBe(true);
  });

  it('accepts a body without museumQids (optional)', () => {
    const body = validBody();
    delete body.museumQids;
    const result = compareRequestSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('accepts a body with an empty museumQids array', () => {
    const result = compareRequestSchema.safeParse(validBody({ museumQids: [] }));
    expect(result.success).toBe(true);
  });

  it('accepts a body with multiple valid museumQids', () => {
    const result = compareRequestSchema.safeParse(
      validBody({ museumQids: ['Q19675', 'Q23402', 'Q179001'] }),
    );
    expect(result.success).toBe(true);
  });

  it('applies the default topK of 5 (R17) when topK is omitted', () => {
    const body = validBody();
    delete body.topK;
    const result = compareRequestSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topK).toBe(5);
    }
  });

  // ── sessionId ───────────────────────────────────────────────────────

  it('rejects a missing sessionId', () => {
    const body = validBody();
    delete body.sessionId;
    const result = compareRequestSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID sessionId', () => {
    const result = compareRequestSchema.safeParse(validBody({ sessionId: 'not-a-uuid' }));
    expect(result.success).toBe(false);
  });

  // ── topK (R17) ──────────────────────────────────────────────────────

  it('R17 — rejects topK below the lower bound (0)', () => {
    const result = compareRequestSchema.safeParse(validBody({ topK: 0 }));
    expect(result.success).toBe(false);
  });

  it('R17 — rejects negative topK', () => {
    const result = compareRequestSchema.safeParse(validBody({ topK: -1 }));
    expect(result.success).toBe(false);
  });

  it('R17 — rejects topK above the upper bound (11)', () => {
    const result = compareRequestSchema.safeParse(validBody({ topK: 11 }));
    expect(result.success).toBe(false);
  });

  it('R17 — rejects non-integer topK', () => {
    const result = compareRequestSchema.safeParse(validBody({ topK: 1.5 }));
    expect(result.success).toBe(false);
  });

  it('R17 — rejects non-numeric topK', () => {
    const result = compareRequestSchema.safeParse(validBody({ topK: 'abc' }));
    expect(result.success).toBe(false);
  });

  it('R17 — accepts the lower bound (topK=1)', () => {
    const result = compareRequestSchema.safeParse(validBody({ topK: 1 }));
    expect(result.success).toBe(true);
  });

  it('R17 — accepts the upper bound (topK=10)', () => {
    const result = compareRequestSchema.safeParse(validBody({ topK: 10 }));
    expect(result.success).toBe(true);
  });

  // ── museumQids regex ────────────────────────────────────────────────

  it('accepts a single well-formed Wikidata QID', () => {
    const result = compareRequestSchema.safeParse(validBody({ museumQids: ['Q19675'] }));
    expect(result.success).toBe(true);
  });

  it('rejects a museumQids entry that is not a Q-ID', () => {
    const result = compareRequestSchema.safeParse(validBody({ museumQids: ['notAQid'] }));
    expect(result.success).toBe(false);
  });

  it('rejects a museumQids entry that starts with Q0 (regex requires Q[1-9])', () => {
    const result = compareRequestSchema.safeParse(validBody({ museumQids: ['Q0'] }));
    expect(result.success).toBe(false);
  });

  it('rejects a museumQids entry that is a number (must be string)', () => {
    const result = compareRequestSchema.safeParse(validBody({ museumQids: [123] }));
    expect(result.success).toBe(false);
  });

  it('rejects a museumQids array longer than 20 entries', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `Q${String(i + 1)}`);
    const result = compareRequestSchema.safeParse(validBody({ museumQids: tooMany }));
    expect(result.success).toBe(false);
  });

  // ── locale enum ─────────────────────────────────────────────────────

  it('accepts locale "fr"', () => {
    const result = compareRequestSchema.safeParse(validBody({ locale: 'fr' }));
    expect(result.success).toBe(true);
  });

  it('accepts locale "en"', () => {
    const result = compareRequestSchema.safeParse(validBody({ locale: 'en' }));
    expect(result.success).toBe(true);
  });

  it('rejects an unsupported locale (e.g. "es")', () => {
    const result = compareRequestSchema.safeParse(validBody({ locale: 'es' }));
    expect(result.success).toBe(false);
  });

  it('accepts a body with locale omitted (resolved downstream from Accept-Language)', () => {
    const body = validBody();
    delete body.locale;
    const result = compareRequestSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  // ── R6 image input — note ──────────────────────────────────────────
  //
  // The image bytes themselves are uploaded via multer (multipart `image`
  // field), NOT through the body schema — mirrors chat-message.route.ts.
  // The body schema therefore intentionally does not declare an `image`
  // field; image rejection (mime, magic, oversize) is enforced at the
  // multer layer + the existing ImageProcessingService (R12). The route
  // integration test (T6.2) covers the wire-level image checks.

  it('strips unknown fields rather than failing validation', () => {
    const result = compareRequestSchema.safeParse(validBody({ unknown: 'ignored' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknown).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Response schema
// ---------------------------------------------------------------------------

describe('compareResponseSchema (T6.1 — 200 response shape)', () => {
  it('accepts a populated CompareResult fixture', () => {
    const fixture = makeCompareResult({ matches: [makeCompareMatch()] });
    const result = compareResponseSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('accepts an empty-matches CompareResult with a fallbackReason', () => {
    const fixture = makeCompareResult({ matches: [], fallbackReason: 'no_visual_neighbor' });
    const result = compareResponseSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('accepts the encoder_unavailable fallbackReason variant', () => {
    const fixture = makeCompareResult({
      matches: [],
      modelVersion: '',
      fallbackReason: 'encoder_unavailable',
    });
    const result = compareResponseSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown fallbackReason literal', () => {
    const result = compareResponseSchema.safeParse({
      matches: [],
      durationMs: 0,
      modelVersion: '',
      fallbackReason: 'invented_reason',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing the required `matches` field', () => {
    const result = compareResponseSchema.safeParse({
      durationMs: 1234,
      modelVersion: DEFAULT_MODEL_VERSION,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing the required `modelVersion` field', () => {
    const result = compareResponseSchema.safeParse({
      matches: [],
      durationMs: 1234,
    });
    expect(result.success).toBe(false);
  });
});
