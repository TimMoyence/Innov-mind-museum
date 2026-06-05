import { describe, it, expect } from 'vitest';
import { EMAIL_RE, SLUG_RE, HEX_RE, HTTPS_RE, KB_LOCALE_RE } from './validation';

// ---------------------------------------------------------------------------
// RED phase — UFR-022 / RUN_ID 2026-05-23-web-refactor-p1
// These tests fail until museum-web/src/lib/validation.ts is created.
// Sémantique = byte-for-byte conservée par rapport aux définitions locales
// pré-existantes (spec U-R6.1 / UB-5).
// ---------------------------------------------------------------------------

describe('validation.ts — EMAIL_RE', () => {
  it('matches a valid email', () => {
    expect(EMAIL_RE.test('foo@bar.com')).toBe(true);
  });

  it('matches a short email a@b.co', () => {
    expect(EMAIL_RE.test('a@b.co')).toBe(true);
  });

  it('rejects a string without @', () => {
    expect(EMAIL_RE.test('no-at-here.com')).toBe(false);
  });

  it('rejects a string without a TLD dot', () => {
    expect(EMAIL_RE.test('foo@bar')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(EMAIL_RE.test('')).toBe(false);
  });

  it('rejects a string with whitespace', () => {
    expect(EMAIL_RE.test('foo @bar.com')).toBe(false);
  });

  it('has the exact byte-for-byte source pattern (UB-5)', () => {
    expect(EMAIL_RE.source).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
    expect(EMAIL_RE.flags).toBe('');
  });
});

describe('validation.ts — SLUG_RE', () => {
  it('matches a simple kebab slug', () => {
    expect(SLUG_RE.test('my-museum-1')).toBe(true);
  });

  it('matches an all-lowercase alphanumeric slug', () => {
    expect(SLUG_RE.test('abc123')).toBe(true);
  });

  it('rejects uppercase letters', () => {
    expect(SLUG_RE.test('My-Museum')).toBe(false);
  });

  it('rejects whitespace', () => {
    expect(SLUG_RE.test('my museum')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(SLUG_RE.test('')).toBe(false);
  });

  it('has the exact byte-for-byte source pattern (UB-5)', () => {
    expect(SLUG_RE.source).toBe('^[a-z0-9-]+$');
    expect(SLUG_RE.flags).toBe('');
  });
});

describe('validation.ts — HEX_RE', () => {
  it('matches a lowercase 6-digit hex color', () => {
    expect(HEX_RE.test('#aabbcc')).toBe(true);
  });

  it('matches an uppercase 6-digit hex color', () => {
    expect(HEX_RE.test('#AABBCC')).toBe(true);
  });

  it('rejects a 3-digit hex shorthand', () => {
    expect(HEX_RE.test('#abc')).toBe(false);
  });

  it('rejects a hex without the leading #', () => {
    expect(HEX_RE.test('aabbcc')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(HEX_RE.test('')).toBe(false);
  });

  it('has the exact byte-for-byte source pattern (UB-5)', () => {
    expect(HEX_RE.source).toBe('^#[0-9a-fA-F]{6}$');
    expect(HEX_RE.flags).toBe('');
  });
});

describe('validation.ts — HTTPS_RE', () => {
  it('matches an https URL', () => {
    expect(HTTPS_RE.test('https://x.com')).toBe(true);
  });

  it('matches HTTPS uppercase (i flag)', () => {
    expect(HTTPS_RE.test('HTTPS://x.com')).toBe(true);
  });

  it('rejects http (non-secure)', () => {
    expect(HTTPS_RE.test('http://x.com')).toBe(false);
  });

  it('rejects a URL with whitespace', () => {
    expect(HTTPS_RE.test('https://x .com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(HTTPS_RE.test('')).toBe(false);
  });

  it('has the exact byte-for-byte source pattern + i flag (UB-5)', () => {
    expect(HTTPS_RE.source).toBe('^https:\\/\\/[^\\s]+$');
    expect(HTTPS_RE.flags).toBe('i');
  });
});

describe('validation.ts — KB_LOCALE_RE', () => {
  it('matches a 2-letter locale (fr)', () => {
    expect(KB_LOCALE_RE.test('fr')).toBe(true);
  });

  it('matches a BCP-47 locale with region (fr-FR)', () => {
    expect(KB_LOCALE_RE.test('fr-FR')).toBe(true);
  });

  it('rejects an all-uppercase 2-letter locale (FR)', () => {
    expect(KB_LOCALE_RE.test('FR')).toBe(false);
  });

  it('rejects a region with lowercase suffix (fr-fr)', () => {
    expect(KB_LOCALE_RE.test('fr-fr')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(KB_LOCALE_RE.test('')).toBe(false);
  });

  it('has the exact byte-for-byte source pattern (UB-5)', () => {
    expect(KB_LOCALE_RE.source).toBe('^[a-z]{2}(-[A-Z]{2})?$');
    expect(KB_LOCALE_RE.flags).toBe('');
  });
});
