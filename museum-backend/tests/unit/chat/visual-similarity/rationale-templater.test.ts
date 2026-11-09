import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

type SharedAttribute = 'artist' | 'movement' | 'era' | 'technique';

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
    const unsafeLocale = 'xx' as unknown as 'fr' | 'en';

    expect(() => templateRationale(facts, unsafeLocale, ALL_ATTRIBUTES)).not.toThrow();
    const out = templateRationale(facts, unsafeLocale, ALL_ATTRIBUTES);
    expect(typeof out).toBe('string');
    expect(out.length).toBeLessThanOrEqual(MAX_RATIONALE_CHARS);
  });
});
