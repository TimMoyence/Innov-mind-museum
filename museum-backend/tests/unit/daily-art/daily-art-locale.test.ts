import { selectArtworkForDate } from '@modules/daily-art/useCase/getDailyArtwork.useCase';

import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';

describe('selectArtworkForDate — locale-aware funFact (QA-08)', () => {
  const monaLisaDate = new Date('2026-01-30T12:00:00Z');

  it('returns the French funFact when locale is "fr"', () => {
    const dto = selectArtworkForDate(monaLisaDate, 'fr');
    expect(dto.title).toBe('Mona Lisa');
    expect(dto.funFact).toBe(artworks[0].funFact.fr);
    expect(dto.funFact).not.toBe(artworks[0].funFact.en);
    expect(typeof dto.funFact).toBe('string');
  });

  it('returns the English funFact when locale is "en"', () => {
    const dto = selectArtworkForDate(monaLisaDate, 'en');
    expect(dto.funFact).toBe(artworks[0].funFact.en);
  });

  it('flattens funFact to a plain string for every supported locale', () => {
    for (const locale of ['en', 'fr', 'es', 'de', 'it', 'ja', 'zh', 'ar'] as const) {
      const dto = selectArtworkForDate(monaLisaDate, locale);
      expect(typeof dto.funFact).toBe('string');
      expect(dto.funFact).toBe(artworks[0].funFact[locale]);
    }
  });
});
