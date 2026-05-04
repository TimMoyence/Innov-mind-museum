import { selectArtworkForDate, artworks } from '@modules/daily-art';

describe('daily-art', () => {
  describe('selectArtworkForDate', () => {
    it('returns a valid artwork shape with all required fields', () => {
      const artwork = selectArtworkForDate(new Date('2025-06-15'));

      expect(artwork).toEqual(
        expect.objectContaining({
          title: expect.any(String),
          artist: expect.any(String),
          year: expect.any(String),
          imageUrl: expect.any(String),
          description: expect.any(String),
          funFact: expect.any(String),
          museum: expect.any(String),
        }),
      );
    });

    it('returns the same artwork for the same day', () => {
      const date = new Date('2025-03-20');
      const first = selectArtworkForDate(date);
      const second = selectArtworkForDate(new Date('2025-03-20'));

      expect(first).toEqual(second);
    });

    it('returns a different artwork on a different day', () => {
      const day1 = selectArtworkForDate(new Date('2025-01-01'));
      const day2 = selectArtworkForDate(new Date('2025-01-02'));

      expect(day1.title).not.toBe(day2.title);
    });

    it('contains exactly 30 curated artworks', () => {
      expect(artworks).toHaveLength(30);
    });

    it('every artwork has a non-empty title, artist, and imageUrl', () => {
      for (const artwork of artworks) {
        expect(artwork.title.length).toBeGreaterThan(0);
        expect(artwork.artist.length).toBeGreaterThan(0);
        expect(artwork.imageUrl).toMatch(/^https:\/\//);
      }
    });

    it('cycles through the list deterministically based on day of year', () => {
      // Day 1 of the year and day 31 should both map to index 1 and index 1
      // respectively (modulo 30), so day 31 wraps to index 1
      const jan1 = selectArtworkForDate(new Date('2025-01-01'));
      const jan31 = selectArtworkForDate(new Date('2025-01-31'));

      // Day-of-year for Jan 1 = 1, Jan 31 = 31
      // 1 % 30 = 1, 31 % 30 = 1 => same artwork
      expect(jan1.title).toBe(jan31.title);
    });
  });
});
