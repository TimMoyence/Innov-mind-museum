/**
 * T5.2 — Pure rationale templater for visual-similarity matches.
 *
 * Renders a short FR / EN human-readable phrase describing why a candidate
 * artwork is similar to the query — interpolating only the attributes the
 * scorer flagged as shared (`artist`, `movement`, `era`, `technique`).
 *
 * Per design.md §9 D5 the rationale is **templated, not LLM-generated**:
 *
 *   - Cost / latency : zero token spend, zero round-trip per match.
 *   - Hallucination guard (UFR-013) : an LLM can fabricate a plausible-but-false
 *     rationale; deterministic templating cannot.
 *   - I18n explicite : FR / EN switch, no inference of language from prompt.
 *   - Determinism testable : same inputs → same output, every time.
 *
 * Hard contract (locked by `tests/unit/chat/visual-similarity/rationale-templater.test.ts`):
 *
 *   1. Output length ≤ {@link MAX_RATIONALE_CHARS} (= 80) characters, even when
 *      every shared attribute is populated with a 60-char monster value
 *      (defensive truncation — design.md §9 risk note "rationale explosion").
 *   2. Empty `sharedAttributes` → FR fallback `'Œuvre similaire'`, EN fallback
 *      `'Similar artwork'`.
 *   3. Unknown locale → defaults to EN gracefully (no throw). Backstops future
 *      locale add-ons that haven't been wired through the type union yet.
 *
 * Pure function. No side effects, no I/O, no logger. Safe to call in tight
 * loops over the topK match list.
 */
import { extractLangCode } from '@shared/i18n/locale';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

/**
 * Attributes that the metadata scorer (T5.1) can flag as shared between the
 * query and a candidate. Mirror of the test-side type — keep in sync.
 *
 * `era` is the date-bucket attribute (`ArtworkFacts.date`). The scorer maps a
 * `±50 years` window into the boolean `era` flag; the templater only renders
 * the shared label, not the window logic.
 */
export type SharedAttribute = 'artist' | 'movement' | 'era' | 'technique';

/** Hard upper bound on rendered rationale length. Asserted by the test suite. */
const MAX_RATIONALE_CHARS = 80;

/**
 * Per-field interpolation cap, applied **before** the joined-string length
 * guard. design.md §9 risk note caps each interpolated field at 64 chars to
 * prevent a malformed Wikidata payload from blowing up the rationale; we
 * tighten further (16 chars) so that with the four-attribute fan-out we still
 * fit under {@link MAX_RATIONALE_CHARS} without needing the post-truncation
 * fallback in the common case.
 */
const PER_FIELD_CHAR_CAP = 16;

/**
 * Truncate a string to `cap` chars, replacing the tail with the ellipsis
 * character `…` (a single code point — counts as 1 char) when truncation
 * happens. Returns `s` unchanged when `s.length ≤ cap`.
 */
function clip(s: string, cap: number): string {
  if (s.length <= cap) {
    return s;
  }
  return `${s.slice(0, Math.max(0, cap - 1))}…`;
}

/** FR / EN fallback literals — locked by the test suite, do not edit lightly. */
const FALLBACK = {
  fr: 'Œuvre similaire',
  en: 'Similar artwork',
} as const;

/** Per-locale label prefix for the rationale phrase. */
const PREFIX = {
  fr: 'Partage',
  en: 'Shares',
} as const;

/** Per-locale, per-attribute human label. */
const ATTRIBUTE_LABEL: Record<'fr' | 'en', Record<SharedAttribute, string>> = {
  fr: {
    artist: 'artiste',
    movement: 'mouvement',
    era: 'époque',
    technique: 'technique',
  },
  en: {
    artist: 'artist',
    movement: 'movement',
    era: 'era',
    technique: 'technique',
  },
};

/**
 * Resolve the displayed value for a shared attribute from the candidate's
 * facts, applying the per-field clip. Returns `null` when the underlying fact
 * is missing — in that case the attribute is silently dropped from the phrase
 * (the metadata scorer should not have flagged it shared if the fact is
 * absent, but we stay defensive).
 */
function attributeValue(facts: ArtworkFacts, attr: SharedAttribute): string | null {
  let raw: string | undefined;
  switch (attr) {
    case 'artist':
      raw = facts.artist;
      break;
    case 'movement':
      raw = facts.movement;
      break;
    case 'era':
      raw = facts.date;
      break;
    case 'technique':
      raw = facts.technique;
      break;
  }
  if (raw === undefined || raw.length === 0) {
    return null;
  }
  return clip(raw, PER_FIELD_CHAR_CAP);
}

/**
 * Normalise a possibly-unknown locale to one of the supported {@link FALLBACK}
 * keys. The argument is typed `'fr' | 'en'`, but at runtime a region-qualified
 * tag (e.g. `'fr-FR'` from the Accept-Language path) can leak through the type
 * union — so we normalise via `extractLangCode` (shared/i18n/locale.ts, the
 * same normaliser the LLM pipeline uses) before the FR/EN switch. Unknown
 * locales fall through to `'en'` per the defensive contract.
 */
function resolveLocale(locale: 'fr' | 'en'): 'fr' | 'en' {
  return extractLangCode(locale) === 'fr' ? 'fr' : 'en';
}

/**
 * Render the FR / EN rationale phrase for a similarity match.
 *
 * @param facts - Candidate's verified facts (Wikidata-enriched).
 * @param locale - `'fr'` or `'en'` — unknown locales fall back to `'en'`.
 * @param sharedAttributes - Attributes the metadata scorer (T5.1) flagged as
 *   shared between the query and the candidate. Order is preserved in the
 *   rendered phrase. Empty → fallback literal.
 * @returns A non-empty string, length ≤ {@link MAX_RATIONALE_CHARS}.
 */
export function templateRationale(
  facts: ArtworkFacts,
  locale: 'fr' | 'en',
  sharedAttributes: SharedAttribute[],
): string {
  const lang = resolveLocale(locale);

  if (sharedAttributes.length === 0) {
    return FALLBACK[lang];
  }

  // Build "<label> <value>" fragments in the requested order. Drop fragments
  // whose underlying fact is missing — defensive against scorer / facts drift.
  const fragments: string[] = [];
  for (const attr of sharedAttributes) {
    const value = attributeValue(facts, attr);
    if (value === null) {
      continue;
    }
    fragments.push(`${ATTRIBUTE_LABEL[lang][attr]} ${value}`);
  }

  if (fragments.length === 0) {
    return FALLBACK[lang];
  }

  const phrase = `${PREFIX[lang]} ${fragments.join(', ')}`;

  // Final hard cap — even with PER_FIELD_CHAR_CAP fragments can in pathological
  // unicode cases exceed MAX_RATIONALE_CHARS once the prefix + separators are
  // added. Truncate with ellipsis to honour the contract.
  return clip(phrase, MAX_RATIONALE_CHARS);
}
