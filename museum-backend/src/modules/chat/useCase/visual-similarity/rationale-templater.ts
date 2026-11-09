import { extractLangCode } from '@shared/i18n/locale';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

export type SharedAttribute = 'artist' | 'movement' | 'era' | 'technique';

const MAX_RATIONALE_CHARS = 80;

const PER_FIELD_CHAR_CAP = 16;

function clip(s: string, cap: number): string {
  if (s.length <= cap) {
    return s;
  }
  return `${s.slice(0, Math.max(0, cap - 1))}…`;
}

const FALLBACK = {
  fr: 'Œuvre similaire',
  en: 'Similar artwork',
} as const;

const PREFIX = {
  fr: 'Partage',
  en: 'Shares',
} as const;

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

function resolveLocale(locale: 'fr' | 'en'): 'fr' | 'en' {
  return extractLangCode(locale) === 'fr' ? 'fr' : 'en';
}

export function templateRationale(
  facts: ArtworkFacts,
  locale: 'fr' | 'en',
  sharedAttributes: SharedAttribute[],
): string {
  const lang = resolveLocale(locale);

  if (sharedAttributes.length === 0) {
    return FALLBACK[lang];
  }

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

  return clip(phrase, MAX_RATIONALE_CHARS);
}
