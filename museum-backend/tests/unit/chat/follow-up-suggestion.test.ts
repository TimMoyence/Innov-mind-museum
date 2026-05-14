/**
 * Red tests for B3 — "Ask more" inline (1 follow-up contextuel).
 *
 * Asserts the BE contract documented in
 * `docs/chat-ux-refonte/specs/B3.md` §1.1 / §1.2 (R1-R10) and §4 (AC1-AC9) :
 *
 *   1. `ChatAssistantMetadata.suggestedFollowUp?: string` is a singular optional
 *      field on the domain shape (NEVER an array — doctrine tracking line 68).
 *   2. `mainAssistantOutputSchema.shape.suggestedFollowUp` is a STRING Zod type,
 *      not an array — schema-introspection guard against future drift to
 *      `suggestedFollowUps: string[]`.
 *   3. `toSuggestedFollowUp(value)` (exported helper in `assistant-response.ts`)
 *      returns the trimmed string when `0 < trimmed.length ≤ 80` and `undefined`
 *      otherwise (arrays, nulls, numbers, objects, oversize strings all drop).
 *   4. `extractMetadata({ suggestedFollowUp: 'x' })` sets the field on the
 *      returned metadata.
 *   5. The prompt builder in `llm-sections.ts` references `suggestedFollowUp`
 *      and no longer the legacy `1-2 natural follow-up questions` instruction.
 *
 * At baseline (B3 not yet implemented) :
 *   - `museum-backend/src/modules/chat/domain/chat.types.ts` has NO
 *     `suggestedFollowUp` field on `ChatAssistantMetadata` (only legacy
 *     `followUpQuestions: string[]`).
 *     → TS2353 ("Object literal may only specify known properties")
 *     OR TS2339 ("Property 'suggestedFollowUp' does not exist on type
 *     'ChatAssistantMetadata'") on AC1.
 *   - `mainAssistantOutputSchema` has no `suggestedFollowUp` key in its
 *     `.shape`.
 *     → AC2 fails because `schema.shape.suggestedFollowUp` is `undefined`.
 *   - `toSuggestedFollowUp` is not exported from `assistant-response.ts`.
 *     → TS2305 ("Module has no exported member 'toSuggestedFollowUp'") at
 *     import time on AC3-AC8.
 *   - `llm-sections.ts` still contains the legacy instruction.
 *     → AC9 fails on the substring assertion.
 *
 * Green-code-agent : when adding the field, keep the schema/parser/prompt
 * triad coherent — the singularity invariant is enforced at 4 layers
 * (B3 spec §0.7 / NFR13).
 */

import {
  extractMetadata,
  toSuggestedFollowUp,
} from '@modules/chat/useCase/orchestration/assistant-response';
// RED ASSERTION 1 : `suggestedFollowUp` is not a member of
// `ChatAssistantMetadata` at baseline. The literal assignment below fires
// TS2353 ("Object literal may only specify known properties") at compile
// time — Jest's TS pipeline fails the file.
import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';

// RED ASSERTION 2 : the schema must expose `suggestedFollowUp` in its shape.
// At baseline `schema.shape.suggestedFollowUp` is `undefined`.
import { mainAssistantOutputSchema } from '@modules/chat/useCase/llm/llm-sections/main-assistant-output.schema';

// RED ASSERTION 3 : the prompt builder substring assertion (AC9) reads the
// raw source of `llm-sections.ts` via the imported `buildSectionPrompt`
// runtime — but baseline produces the legacy "1-2 natural follow-up
// questions" string. Verified through a direct fs.readFile on the module
// path so we don't rely on the dynamic prompt output (test fakes vary).
import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_SUGGESTED_FOLLOWUP_CHARS = 80;

describe('B3 — Suggested follow-up (1 singular factual anchor)', () => {
  describe('type contract — singularity invariant (AC1, R7, NFR13)', () => {
    it('ChatAssistantMetadata.suggestedFollowUp is an optional singular string', () => {
      // RED : at baseline the field does not exist → TS2353 fires here.
      const fresh: ChatAssistantMetadata = { suggestedFollowUp: 'Why is the smile mysterious?' };
      const legacy: ChatAssistantMetadata = {}; // legacy persisted messages have no field

      expect(legacy).toBeDefined();
      expect(fresh.suggestedFollowUp).toBe('Why is the smile mysterious?');
      // Singularity check — `suggestedFollowUp` is `string`, not `string[]`.
      // The cast below would fire TS2322 once the type is correctly added.
      // (We can't actually compile this without `// @ts-expect-error`, but
      //  the type narrowing on `fresh.suggestedFollowUp` proves the shape.)
      const narrowed: string | undefined = fresh.suggestedFollowUp;
      expect(typeof narrowed === 'string' || narrowed === undefined).toBe(true);
    });
  });

  describe('schema contract — Zod string singular (AC2, R1, R3)', () => {
    it('mainAssistantOutputSchema exposes suggestedFollowUp as a string Zod type', () => {
      // RED : at baseline the key is absent from `.shape`.
      const shape = mainAssistantOutputSchema.shape as Record<string, unknown>;
      const field = shape.suggestedFollowUp;
      expect(field).toBeDefined();
    });

    it('mainAssistantOutputSchema.suggestedFollowUp is NOT a ZodArray (singularity invariant)', () => {
      // Zod 4 introspection — `def.type` is a lowercase string discriminator
      // (`'nullable'`, `'string'`, `'array'` …). The outer wrapper is
      // `'nullable'` per the schema (`.nullable()`); the inner wrapped type
      // exposes its own `def.type`. Both Zod 4 (this codebase) and the
      // legacy Zod 3 `_def.typeName` (`'ZodString'`, `'ZodArray'`) shapes
      // are tolerated below for robustness.
      const shape = mainAssistantOutputSchema.shape as Record<string, unknown>;
      const field = shape.suggestedFollowUp as {
        def?: { type?: string; innerType?: { def?: { type?: string } } };
        _def?: { typeName?: string; innerType?: { _def?: { typeName?: string } } };
      };

      // Zod 4 path : `field.def.type === 'nullable'`, unwrap to inner.
      const z4Inner = field?.def?.innerType?.def?.type ?? field?.def?.type;
      // Zod 3 path : `field._def.typeName === 'ZodNullable'`, unwrap to inner.
      const z3Inner = field?._def?.innerType?._def?.typeName ?? field?._def?.typeName;

      const isArray = z4Inner === 'array' || z3Inner === 'ZodArray';
      const isString = z4Inner === 'string' || z3Inner === 'ZodString';

      expect(isArray).toBe(false);
      // Be explicit about the positive expectation too — singular string.
      expect(isString).toBe(true);
    });
  });

  describe('parser helper — toSuggestedFollowUp (AC3-AC5, R4, R5)', () => {
    it('returns undefined for non-string inputs', () => {
      // RED : `toSuggestedFollowUp` is not exported at baseline →
      // TS2305 at import time. Once exported, these assertions enforce R5.
      expect(toSuggestedFollowUp(undefined)).toBeUndefined();
      expect(toSuggestedFollowUp(null)).toBeUndefined();
      expect(toSuggestedFollowUp(42)).toBeUndefined();
      expect(toSuggestedFollowUp({})).toBeUndefined();
      expect(toSuggestedFollowUp(true)).toBeUndefined();
      expect(toSuggestedFollowUp(['array', 'forbidden'])).toBeUndefined();
    });

    it('returns undefined for empty / whitespace-only strings', () => {
      expect(toSuggestedFollowUp('')).toBeUndefined();
      expect(toSuggestedFollowUp('   ')).toBeUndefined();
      expect(toSuggestedFollowUp('\t\n')).toBeUndefined();
    });

    it('returns the trimmed string for valid input', () => {
      expect(toSuggestedFollowUp('Why is the smile mysterious?')).toBe(
        'Why is the smile mysterious?',
      );
      expect(toSuggestedFollowUp('  How did Monet paint at dusk?  ')).toBe(
        'How did Monet paint at dusk?',
      );
    });

    it('returns undefined when input strictly exceeds 80 characters (R5 strict drop, NOT slice)', () => {
      const sized80 = 'x'.repeat(80);
      const sized81 = 'x'.repeat(81);

      expect(toSuggestedFollowUp(sized80)).toBe(sized80); // boundary OK
      expect(toSuggestedFollowUp(sized81)).toBeUndefined(); // strict drop
      expect(toSuggestedFollowUp('y'.repeat(200))).toBeUndefined();
    });

    it('caps trimmed length, not raw length (whitespace does not pass the boundary)', () => {
      // 81 chars of `x` with leading whitespace → trimmed length 81 → drop.
      const padded = '  ' + 'x'.repeat(81);
      expect(toSuggestedFollowUp(padded)).toBeUndefined();
      // 78 chars of `x` with trailing whitespace → trimmed length 78 → keep.
      const padded2 = 'x'.repeat(78) + '   ';
      expect(toSuggestedFollowUp(padded2)).toBe('x'.repeat(78));
    });
  });

  describe('extractMetadata — wiring (AC6-AC8, R6)', () => {
    it('assigns suggestedFollowUp when parsed value is a valid string', () => {
      const meta = extractMetadata({
        suggestedFollowUp: 'Why is the smile mysterious?',
      });
      expect(meta.suggestedFollowUp).toBe('Why is the smile mysterious?');
    });

    it('leaves suggestedFollowUp undefined when the field is absent', () => {
      const meta = extractMetadata({});
      expect(meta.suggestedFollowUp).toBeUndefined();
    });

    it('rejects array values even if the BE LLM drifts (singularity)', () => {
      // Defence in depth — if the LLM emits an array despite the schema,
      // the parser drops it (AC8). NEVER persists multiple follow-ups.
      const meta = extractMetadata({
        suggestedFollowUp: ['oops', 'also forbidden'],
      });
      expect(meta.suggestedFollowUp).toBeUndefined();
    });

    it('rejects oversize strings at the extractor boundary too', () => {
      const meta = extractMetadata({
        suggestedFollowUp: 'x'.repeat(MAX_SUGGESTED_FOLLOWUP_CHARS + 1),
      });
      expect(meta.suggestedFollowUp).toBeUndefined();
    });
  });

  describe('prompt instruction lexical contract (AC9, R2)', () => {
    it('llm-sections.ts references "suggestedFollowUp" in the prompt builder', () => {
      const sourcePath = path.resolve(
        __dirname,
        '../../../src/modules/chat/useCase/llm/llm-sections.ts',
      );
      const source = fs.readFileSync(sourcePath, 'utf8');
      // RED : at baseline this substring is absent — the legacy instruction
      // references `followUpQuestions` (plural) instead.
      expect(source).toContain('suggestedFollowUp');
    });

    it('llm-sections.ts no longer references the legacy "1-2 natural follow-up questions" instruction', () => {
      const sourcePath = path.resolve(
        __dirname,
        '../../../src/modules/chat/useCase/llm/llm-sections.ts',
      );
      const source = fs.readFileSync(sourcePath, 'utf8');
      // RED : at baseline this exact phrase is present at line 249 — once
      // T1.2 lands, the phrase is replaced by the B3 singular instruction.
      expect(source).not.toContain('1-2 natural follow-up questions');
    });
  });
});
