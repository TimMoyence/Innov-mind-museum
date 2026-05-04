import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';

import type { Artwork } from '@modules/daily-art/domain/artwork/artwork.types';

/**
 * Returns the day-of-year (1-366) for a given date.
 */
const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1_000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

/**
 * Returns a `YYYY-MM-DD` date string used as the cache key suffix.
 */
export const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Selects today's artwork from the curated list using deterministic rotation.
 */
export const selectArtworkForDate = (date: Date): Artwork => {
  const dayOfYear = getDayOfYear(date);
  return artworks[dayOfYear % artworks.length];
};
