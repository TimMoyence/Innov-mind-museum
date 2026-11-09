import type { SupportedLocale } from '@shared/i18n/locale';

export interface Artwork {
  title: string;
  artist: string;
  year: string;
  imageUrl: string;
  description: string;
  funFact: Record<SupportedLocale, string>;
  museum: string;
}

export interface DailyArtworkDTO extends Omit<Artwork, 'funFact'> {
  funFact: string;
}
