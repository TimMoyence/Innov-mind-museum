import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';

import type { DailyArtworkDTO } from '@modules/daily-art/domain/artwork.types';
import type { SupportedLocale } from '@shared/i18n/locale';

/** Day-of-year (1-366). */
const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1_000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

/** `YYYY-MM-DD` — used as cache key suffix. */
export const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Deterministic rotation: `artworks[dayOfYear % length]`, with the multilingual
 * `funFact` flattened to the requested locale. `locale` is a {@link SupportedLocale}
 * (the route resolves any unsupported tag to English before calling), and every
 * catalog entry carries all 8 locales, so the lookup is always defined.
 */
export const selectArtworkForDate = (date: Date, locale: SupportedLocale): DailyArtworkDTO => {
  const dayOfYear = getDayOfYear(date);
  const artwork = artworks[dayOfYear % artworks.length];
  return {
    ...artwork,
    funFact: artwork.funFact[locale],
  };
};
