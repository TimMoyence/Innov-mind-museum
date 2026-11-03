import { maskPersonalData } from '@shared/pii/mask-personal-data';

describe('maskPersonalData', () => {
  // ── Email detection ──────────────────────────────────────────────────

  describe('email detection', () => {
    it('replaces a standard email', () => {
      const result = maskPersonalData('Contact me at john@example.com please');
      expect(result.text).toBe('Contact me at [EMAIL] please');
      expect(result.count).toBe(1);
    });

    it('replaces multiple emails', () => {
      const result = maskPersonalData('john@a.com and jane@b.org');
      expect(result.text).toBe('[EMAIL] and [EMAIL]');
      expect(result.count).toBe(2);
    });

    it('handles emails with dots and plus signs', () => {
      const result = maskPersonalData('user.name+tag@sub.domain.co.uk');
      expect(result.text).toBe('[EMAIL]');
      expect(result.count).toBe(1);
    });
  });

  // ── Phone detection ──────────────────────────────────────────────────

  describe('phone detection', () => {
    it('replaces international format +33', () => {
      const result = maskPersonalData('Call +33 6 12 34 56 78');
      expect(result.text).toBe('Call [PHONE]');
      expect(result.count).toBe(1);
    });

    it('replaces US format +1-555-123-4567', () => {
      const result = maskPersonalData('My number is +1-555-123-4567.');
      expect(result.text).toContain('[PHONE]');
      expect(result.count).toBe(1);
    });

    it('replaces local French format 06 12 34 56 78', () => {
      const result = maskPersonalData('Appelez-moi au 06 12 34 56 78');
      expect(result.text).toContain('[PHONE]');
      expect(result.count).toBe(1);
    });

    it('does not replace short numbers (< 7 digits)', () => {
      const result = maskPersonalData('Room 42 in 1874');
      expect(result.text).toBe('Room 42 in 1874');
      expect(result.count).toBe(0);
    });
  });

  // ── Mixed and edge cases ───────��─────────────────────────────────────

  describe('mixed and edge cases', () => {
    it('replaces both email and phone in same text', () => {
      const result = maskPersonalData('Email: user@test.com, Tel: +33 6 12 34 56 78');
      expect(result.text).toContain('[EMAIL]');
      expect(result.text).toContain('[PHONE]');
      expect(result.count).toBe(2);
    });

    it('returns text unchanged when no PII found', () => {
      const text = 'Tell me about Water Lilies by Monet, painted in 1906';
      const result = maskPersonalData(text);
      expect(result.text).toBe(text);
      expect(result.count).toBe(0);
    });

    it('handles empty string', () => {
      const result = maskPersonalData('');
      expect(result.text).toBe('');
      expect(result.count).toBe(0);
    });

    it('does not false-positive on art-related years', () => {
      const text = 'The painting from 1874 by Monet is in Room 12';
      const result = maskPersonalData(text);
      expect(result.text).toBe(text);
      expect(result.count).toBe(0);
    });
  });
});
