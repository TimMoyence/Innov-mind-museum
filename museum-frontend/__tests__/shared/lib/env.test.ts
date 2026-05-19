/**
 * Tests for `readEnvString()` canonical env-reader helper.
 *
 * Why these tests exist (T4-RED-EXTRA, run 2026-05-19-w2-followup-fixpack):
 * close the FE branch-coverage gate (78%). The helper was at 75% branches —
 * the typeof-guard branch (non-string input) was never exercised. Covers:
 *   - typeof guard rejecting non-string inputs (undefined / number / null / object)
 *   - trim branch returning undefined on whitespace-only input
 *   - happy-path returning the trimmed value
 *
 * F4-EXTRA is test-only — production code is already correct.
 */

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
