import type { SupportedLocale } from '@shared/i18n/locale';

/**
 * Catalog entry for the Daily Art feature.
 *
 * `funFact` is multilingual: a map of locale → localized "did you know?"
 * string for every {@link SupportedLocale}. The HTTP DTO flattens it to a
 * single string for the requested locale (see {@link DailyArtworkDTO}).
 */
export interface Artwork {
  title: string;
  artist: string;
  year: string;
  imageUrl: string;
  description: string;
  funFact: Record<SupportedLocale, string>;
  museum: string;
}

/**
 * Public daily-art payload returned by `GET /api/daily-art`.
 *
 * Identical to {@link Artwork} except `funFact` is flattened to the single
 * localized string for the requested locale (response shape stays `string`).
 */
export interface DailyArtworkDTO extends Omit<Artwork, 'funFact'> {
  funFact: string;
}
