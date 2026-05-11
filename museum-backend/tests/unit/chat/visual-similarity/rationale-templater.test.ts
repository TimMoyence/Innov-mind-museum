/**
 * RED — T5.2 — pure rationale templater `rationale-templater.ts`.
 *
 * Locks down tasks.md T5.2 + design.md §9 D5 + spec R-glossary `Rationale`:
 *   - Output is templated FR / EN (no LLM, deterministic),
 *   - Output is bounded ≤ 80 characters even at maximum shared-attribute fan-out,
 *   - When NO attribute is shared the output falls back to the literal
 *     `'Œuvre similaire'` (FR) / `'Similar artwork'` (EN),
 *   - Unknown locale never crashes — defaults to EN per the locale-invariant
 *     contract (defensive — backstops future locale add-ons).
 *
 * SUT does not yet exist (Phase 5). Tests are RED until the editor lands the
 * templater file.
 */

import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

/** Same-shape `SharedAttribute` enum the SUT will export — keep test-side mirror minimal. */
type SharedAttribute = 'artist' | 'movement' | 'era' | 'technique';

// SUT — Phase 5 file, must not yet exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
const templater = require('@modules/chat/useCase/visual-similarity/rationale-templater') as {
  templateRationale: (
    facts: ArtworkFacts,
    locale: 'fr' | 'en',
    sharedAttributes: SharedAttribute[],
  ) => string;
};

const { templateRationale } = templater;

const MAX_RATIONALE_CHARS = 80;
const ALL_ATTRIBUTES: SharedAttribute[] = ['artist', 'movement', 'era', 'technique'];

describe('templateRationale (T5.2 — pure templater)', () => {
  it('produces a French phrase ≤ 80 chars when every attribute is shared (fr)', () => {
    const facts = makeArtworkFacts();

    const out = templateRationale(facts, 'fr', ALL_ATTRIBUTES);

    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(MAX_RATIONALE_CHARS);
  });

  it('produces an English phrase ≤ 80 chars when every attribute is shared (en)', () => {
    const facts = makeArtworkFacts();

    const out = templateRationale(facts, 'en', ALL_ATTRIBUTES);

    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(MAX_RATIONALE_CHARS);
  });

  it('falls back to the FR literal "Œuvre similaire" when no attribute is shared', () => {
    const facts = makeArtworkFacts();

    expect(templateRationale(facts, 'fr', [])).toBe('Œuvre similaire');
  });

  it('falls back to the EN literal "Similar artwork" when no attribute is shared', () => {
    const facts = makeArtworkFacts();

    expect(templateRationale(facts, 'en', [])).toBe('Similar artwork');
  });

  it('does NOT exceed 80 chars even when every shared attribute is populated with long values', () => {
    const facts = makeArtworkFacts({
      artist: 'A'.repeat(60),
      movement: 'M'.repeat(60),
      technique: 'T'.repeat(60),
      date: 'D'.repeat(60),
    });

    const fr = templateRationale(facts, 'fr', ALL_ATTRIBUTES);
    const en = templateRationale(facts, 'en', ALL_ATTRIBUTES);

    expect(fr.length).toBeLessThanOrEqual(MAX_RATIONALE_CHARS);
    expect(en.length).toBeLessThanOrEqual(MAX_RATIONALE_CHARS);
  });

  it('does not crash on an unknown locale (defensive fallback)', () => {
    const facts = makeArtworkFacts();
    // Cast through unknown — we are deliberately exercising the runtime guard
    // for locales the type union does not allow at compile time.
    const unsafeLocale = 'xx' as unknown as 'fr' | 'en';

    expect(() => templateRationale(facts, unsafeLocale, ALL_ATTRIBUTES)).not.toThrow();
    const out = templateRationale(facts, unsafeLocale, ALL_ATTRIBUTES);
    expect(typeof out).toBe('string');
    expect(out.length).toBeLessThanOrEqual(MAX_RATIONALE_CHARS);
  });
});
