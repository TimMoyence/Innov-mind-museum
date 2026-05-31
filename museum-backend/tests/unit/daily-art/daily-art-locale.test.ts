import { selectArtworkForDate } from '@modules/daily-art/useCase/getDailyArtwork.useCase';

import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';

/**
 * QA-08: the daily-art use case must localize the `funFact` field.
 * The output DTO keeps `funFact: string` (response shape unchanged) but the
 * value must reflect the requested locale, falling back to English.
 */
describe('selectArtworkForDate — locale-aware funFact (QA-08)', () => {
  // 2026-01-30 -> dayOfYear 30 -> 30 % 30 === 0 -> artworks[0] (Mona Lisa).
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
      // eslint-disable-next-line security/detect-object-injection -- Justification: `locale` is a literal from a hard-coded const tuple, not user input. Approved-by: QA-08
      expect(dto.funFact).toBe(artworks[0].funFact[locale]);
    }
  });
});
