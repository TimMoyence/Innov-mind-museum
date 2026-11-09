import { readEnvString } from '@/shared/lib/env';

describe('readEnvString', () => {
  describe('typeof guard — non-string inputs return undefined', () => {
    it('returns undefined for undefined', () => {
      expect(readEnvString(undefined)).toBeUndefined();
    });

    it('returns undefined for null', () => {
      expect(readEnvString(null)).toBeUndefined();
    });

    it('returns undefined for a number', () => {
      expect(readEnvString(42)).toBeUndefined();
    });

    it('returns undefined for an object', () => {
      expect(readEnvString({ value: 'x' })).toBeUndefined();
    });
  });

  describe('trim branch — empty / whitespace strings return undefined', () => {
    it('returns undefined for empty string', () => {
      expect(readEnvString('')).toBeUndefined();
    });

    it('returns undefined for whitespace-only string', () => {
      expect(readEnvString('   ')).toBeUndefined();
    });

    it('returns undefined for tabs and newlines only', () => {
      expect(readEnvString('\t\n  \r\n')).toBeUndefined();
    });
  });

  describe('happy path — returns trimmed string', () => {
    it('returns the value as-is when no surrounding whitespace', () => {
      expect(readEnvString('https://api.musaium.com')).toBe('https://api.musaium.com');
    });

    it('trims surrounding whitespace', () => {
      expect(readEnvString('  value  ')).toBe('value');
    });
  });
});
