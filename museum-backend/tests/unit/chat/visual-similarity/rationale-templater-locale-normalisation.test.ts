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

const FR_PREFIX = 'Partage';
const EN_PREFIX = 'Shares';

const asLocaleArg = (tag: string): 'fr' | 'en' => tag as unknown as 'fr' | 'en';

describe('templateRationale — region-tag locale normalisation (Cycle 12)', () => {
  const sharedAttributes: SharedAttribute[] = ['artist'];

  it('renders FR copy for the region-qualified tag "fr-FR" (not the EN fallback)', () => {
    const facts = makeArtworkFacts();

    const out = templateRationale(facts, asLocaleArg('fr-FR'), sharedAttributes);

    expect(out.startsWith(FR_PREFIX)).toBe(true);
    expect(out.startsWith(EN_PREFIX)).toBe(false);
  });

  it('renders EN copy for the region-qualified tag "en-US"', () => {
    const facts = makeArtworkFacts();

    const out = templateRationale(facts, asLocaleArg('en-US'), sharedAttributes);

    expect(out.startsWith(EN_PREFIX)).toBe(true);
  });

  it('falls back to the FR literal for "fr-FR" when no attribute is shared', () => {
    const facts = makeArtworkFacts();

    expect(templateRationale(facts, asLocaleArg('fr-FR'), [])).toBe('Œuvre similaire');
  });

  it('non-regression — bare "fr" / "en" codes still render their language', () => {
    const facts = makeArtworkFacts();

    expect(templateRationale(facts, 'fr', sharedAttributes).startsWith(FR_PREFIX)).toBe(true);
    expect(templateRationale(facts, 'en', sharedAttributes).startsWith(EN_PREFIX)).toBe(true);
  });

  it('unknown region tag falls back to EN (defensive)', () => {
    const facts = makeArtworkFacts();

    const out = templateRationale(facts, asLocaleArg('pt-BR'), sharedAttributes);

    expect(out.startsWith(EN_PREFIX)).toBe(true);
  });
});
