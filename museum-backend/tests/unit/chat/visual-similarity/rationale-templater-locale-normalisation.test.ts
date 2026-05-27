/**
 * RED — UFR-022 phase=red, Cycle 12 (MEDIUM — i18n region-tag normalisation),
 * RUN_ID=2026-05-26-chat-pipeline-hardening.
 *
 * Defensive hardening for the visual-similarity rationale templater
 * (`museum-backend/src/modules/chat/useCase/visual-similarity/rationale-templater.ts:127-129`).
 *
 * Defect class (i18n region-tag drift): the templater's internal
 * `resolveLocale` does a strict equality switch — `locale === 'fr' ? 'fr' :
 * 'en'`. A region-qualified tag such as `'fr-FR'` (the raw shape produced by
 * `parseAcceptLanguageHeader`, `shared/i18n/locale.ts:39`) therefore fails the
 * `=== 'fr'` test and silently degrades to English copy. The main LLM pipeline
 * already normalises via `extractLangCode` (`locale.ts:20`, split on `-`/`_`);
 * the templater should do the same so a tag that leaks through the type union
 * at runtime still renders the correct language.
 *
 * Target contract (delivered by GREEN): the templater normalises its `locale`
 * argument via `extractLangCode` (or equivalent) before the FR/EN switch so
 * `'fr-FR'` → FR copy, `'en-US'` → EN copy, unknown → EN fallback.
 *
 * RED rationale: today `'fr-FR'` (cast through the union) hits the `else`
 * branch → `PREFIX.en` = `'Shares'`, so the FR-prefix assertion FAILS until the
 * normalisation lands. `'fr'` and `'en'` bare codes already work, so those are
 * passing non-regression guards.
 */

import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

/** Same-shape `SharedAttribute` mirror the SUT exports — keep test-side minimal. */
type SharedAttribute = 'artist' | 'movement' | 'era' | 'technique';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
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

/**
 * Casts a region-qualified tag through the `'fr' | 'en'` union. The templater
 * type signature only admits bare codes, but at runtime a region tag can leak
 * in from the Accept-Language path — that's exactly the case we harden.
 * @param tag - A raw locale tag (possibly region-qualified, e.g. `'fr-FR'`).
 * @returns The same tag widened into the templater's `'fr' | 'en'` arg type.
 */
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
