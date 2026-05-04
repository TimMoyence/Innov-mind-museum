import { RegexPiiSanitizer } from '@modules/chat/adapters/secondary/pii/pii-sanitizer.regex';
import { DisabledPiiSanitizer } from '@modules/chat/domain/ports/pii-sanitizer.port';

describe('RegexPiiSanitizer', () => {
  const sanitizer = new RegexPiiSanitizer();

  // ── Email detection ──────────────────────────────────────────────────

  describe('email detection', () => {
    it('replaces a standard email', () => {
      const result = sanitizer.sanitize('Contact me at john@example.com please');
      expect(result.sanitizedText).toBe('Contact me at [EMAIL] please');
      expect(result.detectedPiiCount).toBe(1);
    });

    it('replaces multiple emails', () => {
      const result = sanitizer.sanitize('john@a.com and jane@b.org');
      expect(result.sanitizedText).toBe('[EMAIL] and [EMAIL]');
      expect(result.detectedPiiCount).toBe(2);
    });

    it('handles emails with dots and plus signs', () => {
      const result = sanitizer.sanitize('user.name+tag@sub.domain.co.uk');
      expect(result.sanitizedText).toBe('[EMAIL]');
      expect(result.detectedPiiCount).toBe(1);
    });
  });

  // ── Phone detection ──────────────────────────────────────────────────

  describe('phone detection', () => {
    it('replaces international format +33', () => {
      const result = sanitizer.sanitize('Call +33 6 12 34 56 78');
      expect(result.sanitizedText).toBe('Call [PHONE]');
      expect(result.detectedPiiCount).toBe(1);
    });

    it('replaces US format +1-555-123-4567', () => {
      const result = sanitizer.sanitize('My number is +1-555-123-4567.');
      expect(result.sanitizedText).toContain('[PHONE]');
      expect(result.detectedPiiCount).toBe(1);
    });

    it('replaces local French format 06 12 34 56 78', () => {
      const result = sanitizer.sanitize('Appelez-moi au 06 12 34 56 78');
      expect(result.sanitizedText).toContain('[PHONE]');
      expect(result.detectedPiiCount).toBe(1);
    });

    it('does not replace short numbers (< 7 digits)', () => {
      const result = sanitizer.sanitize('Room 42 in 1874');
      expect(result.sanitizedText).toBe('Room 42 in 1874');
      expect(result.detectedPiiCount).toBe(0);
    });
  });

  // ── Mixed and edge cases ───────��─────────────────────────────────────

  describe('mixed and edge cases', () => {
    it('replaces both email and phone in same text', () => {
      const result = sanitizer.sanitize('Email: user@test.com, Tel: +33 6 12 34 56 78');
      expect(result.sanitizedText).toContain('[EMAIL]');
      expect(result.sanitizedText).toContain('[PHONE]');
      expect(result.detectedPiiCount).toBe(2);
    });

    it('returns text unchanged when no PII found', () => {
      const text = 'Tell me about Water Lilies by Monet, painted in 1906';
      const result = sanitizer.sanitize(text);
      expect(result.sanitizedText).toBe(text);
      expect(result.detectedPiiCount).toBe(0);
    });

    it('handles empty string', () => {
      const result = sanitizer.sanitize('');
      expect(result.sanitizedText).toBe('');
      expect(result.detectedPiiCount).toBe(0);
    });

    it('does not false-positive on art-related years', () => {
      const text = 'The painting from 1874 by Monet is in Room 12';
      const result = sanitizer.sanitize(text);
      expect(result.sanitizedText).toBe(text);
      expect(result.detectedPiiCount).toBe(0);
    });
  });
});

describe('DisabledPiiSanitizer', () => {
  it('passes text through unchanged', () => {
    const sanitizer = new DisabledPiiSanitizer();
    const result = sanitizer.sanitize('john@example.com +33 6 12 34 56 78');
    expect(result.sanitizedText).toBe('john@example.com +33 6 12 34 56 78');
    expect(result.detectedPiiCount).toBe(0);
  });
});
