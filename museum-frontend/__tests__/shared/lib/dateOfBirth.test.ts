import { parseDateOfBirth } from '@/shared/lib/dateOfBirth';

describe('parseDateOfBirth', () => {
  describe('ISO happy path', () => {
    it('accepts well-formed ISO date and returns it unchanged', () => {
      expect(parseDateOfBirth('1990-03-15')).toBe('1990-03-15');
    });

    it('accepts ISO date at lower-bound year (1900)', () => {
      expect(parseDateOfBirth('1900-01-01')).toBe('1900-01-01');
    });
  });

  describe('DMY fallback — slash separator', () => {
    it('parses DD/MM/YYYY', () => {
      expect(parseDateOfBirth('15/03/1990')).toBe('1990-03-15');
    });

    it('parses single-digit day/month with slash and pads them', () => {
      expect(parseDateOfBirth('5/3/1990')).toBe('1990-03-05');
    });
  });

  describe('DMY fallback — dot separator', () => {
    it('parses DD.MM.YYYY', () => {
      expect(parseDateOfBirth('15.03.1990')).toBe('1990-03-15');
    });

    it('parses leap-year Feb 29 with dot separator', () => {
      expect(parseDateOfBirth('29.02.2020')).toBe('2020-02-29');
    });
  });

  describe('DMY fallback — dash separator', () => {
    it('parses DD-MM-YYYY (dash not confused with ISO)', () => {
      expect(parseDateOfBirth('15-03-1990')).toBe('1990-03-15');
    });
  });

  describe('Calendar validation — leap year', () => {
    it('rejects Feb 29 on a non-leap year', () => {
      expect(parseDateOfBirth('29/02/2021')).toBeNull();
    });

    it('rejects Apr 31 (month with only 30 days)', () => {
      expect(parseDateOfBirth('31-04-1990')).toBeNull();
    });

    it('rejects Feb 30 (impossible)', () => {
      expect(parseDateOfBirth('30/02/1990')).toBeNull();
    });
  });

  describe('Year range validation', () => {
    it('rejects year < 1900', () => {
      expect(parseDateOfBirth('31/12/1899')).toBeNull();
    });

    it('rejects year > currentYear (dynamic)', () => {
      const futureYear = new Date().getUTCFullYear() + 1;
      expect(parseDateOfBirth(`01/01/${String(futureYear)}`)).toBeNull();
    });
  });

  describe('Month range validation', () => {
    it('rejects month = 0', () => {
      expect(parseDateOfBirth('15/00/1990')).toBeNull();
    });

    it('rejects month = 13', () => {
      expect(parseDateOfBirth('15/13/1990')).toBeNull();
    });
  });

  describe('Day range validation', () => {
    it('rejects day = 0', () => {
      expect(parseDateOfBirth('00/03/1990')).toBeNull();
    });

    it('rejects day = 32', () => {
      expect(parseDateOfBirth('32/03/1990')).toBeNull();
    });
  });

  describe('Empty / whitespace input', () => {
    it('returns null on empty string', () => {
      expect(parseDateOfBirth('')).toBeNull();
    });

    it('returns null on whitespace-only string', () => {
      expect(parseDateOfBirth('   ')).toBeNull();
    });
  });

  describe('Non-string input (defensive)', () => {
    it('returns null on null', () => {
      expect(parseDateOfBirth(null)).toBeNull();
    });

    it('returns null on undefined', () => {
      expect(parseDateOfBirth(undefined)).toBeNull();
    });

    it('returns null on a numeric value passed through unsafe cast', () => {
      expect(parseDateOfBirth(42 as unknown as string)).toBeNull();
    });
  });

  describe('Malformed input', () => {
    it('returns null on a non-date string', () => {
      expect(parseDateOfBirth('not-a-date')).toBeNull();
    });

    it('returns null on YYYY/MM/DD (ISO regex requires dashes, not slashes)', () => {
      expect(parseDateOfBirth('1990/03/15')).toBeNull();
    });

    it('returns null on partial date', () => {
      expect(parseDateOfBirth('1990-03')).toBeNull();
    });
  });
});
