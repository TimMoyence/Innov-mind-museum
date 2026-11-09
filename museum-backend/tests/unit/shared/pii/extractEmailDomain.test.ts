import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { extractEmailDomain } from '@shared/pii/extractEmailDomain';

const FALLBACK = 'unknown';

describe('extractEmailDomain (A1 / R1)', () => {
  it('returns the domain part after the last @, lower-cased', () => {
    expect(extractEmailDomain('Alice@Example.COM')).toBe('example.com');
  });

  it('lower-cases an already-lower domain unchanged', () => {
    expect(extractEmailDomain('bob@musaium.app')).toBe('musaium.app');
  });

  it('uses the substring after the LAST @ when several are present', () => {
    expect(extractEmailDomain('a@b@c.com')).toBe('c.com');
  });

  it('returns the fallback (not the raw input) when there is no @', () => {
    const out = extractEmailDomain('no-at-sign');
    expect(out).toBe(FALLBACK);
    expect(out).not.toContain('@');
    expect(out).not.toBe('no-at-sign');
  });

  it('returns the fallback for an empty string', () => {
    expect(extractEmailDomain('')).toBe(FALLBACK);
  });

  it('returns the fallback for a whitespace-only string', () => {
    expect(extractEmailDomain('   ')).toBe(FALLBACK);
  });

  it('returns the fallback when the @ is the last character (empty domain)', () => {
    const out = extractEmailDomain('user@');
    expect(out).toBe(FALLBACK);
    expect(out).not.toContain('@');
  });

  it('never returns a value containing the local part of the address', () => {
    const out = extractEmailDomain('secret.local-part@example.com');
    expect(out).toBe('example.com');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('@');
  });

  it('trims surrounding whitespace before extracting the domain', () => {
    expect(extractEmailDomain('  user@Example.com  ')).toBe('example.com');
  });

  it('is a pure helper: imports no logger / IO module', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../../src/shared/pii/extractEmailDomain.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/@shared\/logger/);
    expect(source).not.toMatch(/from ['"]node:fs['"]/);
    expect(source).not.toMatch(/console\./);
  });
});
