import { SUPPORTED_LOCALES } from '@shared/i18n/locale';

import type { Artwork } from '@modules/daily-art/domain/artwork.types';
import type { SupportedLocale } from '@shared/i18n/locale';

const makeFunFact = (text: string): Record<SupportedLocale, string> =>
  Object.fromEntries(SUPPORTED_LOCALES.map((loc) => [loc, `${loc}: ${text}`])) as Record<
    SupportedLocale,
    string
  >;

export const makeArtwork = (overrides?: Partial<Artwork>): Artwork => ({
  title: 'Mona Lisa',
  artist: 'Leonardo da Vinci',
  year: 'c. 1503-1519',
  imageUrl: 'https://example.com/mona-lisa.jpg',
  description: 'A famous portrait',
  funFact: makeFunFact('Has her own mailbox at the Louvre.'),
  museum: 'Louvre, Paris',
  ...overrides,
});
