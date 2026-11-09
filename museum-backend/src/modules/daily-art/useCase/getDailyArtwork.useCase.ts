import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';

import type { DailyArtworkDTO } from '@modules/daily-art/domain/artwork.types';
import type { SupportedLocale } from '@shared/i18n/locale';

const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1_000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

export const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

export const selectArtworkForDate = (date: Date, locale: SupportedLocale): DailyArtworkDTO => {
  const dayOfYear = getDayOfYear(date);
  const artwork = artworks[dayOfYear % artworks.length];
  return {
    ...artwork,
    funFact: artwork.funFact[locale],
  };
};
