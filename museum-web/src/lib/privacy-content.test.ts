import { describe, it, expect } from 'vitest';
import { getPrivacyContent } from './privacy-content';

describe('privacy-content.ts', () => {
  it('returns English content for locale "en"', () => {
    const content = getPrivacyContent('en');
    expect(content.title).toBe('Privacy Policy (GDPR)');
    expect(content.sections.length).toBeGreaterThan(0);
  });

  it('returns French content for locale "fr"', () => {
    const content = getPrivacyContent('fr');
    expect(content.title).toContain('RGPD');
    expect(content.sections.length).toBeGreaterThan(0);
  });

  it('falls back to English for unknown locale', () => {
    const content = getPrivacyContent('de');
    expect(content.title).toBe('Privacy Policy (GDPR)');
  });

  it('each section has an id, title, and at least one paragraph', () => {
    const content = getPrivacyContent('en');
    for (const section of content.sections) {
      expect(section.id).toBeTruthy();
      expect(section.title).toBeTruthy();
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });

  it('French and English have the same number of sections', () => {
    const en = getPrivacyContent('en');
    const fr = getPrivacyContent('fr');
    expect(en.sections.length).toBe(fr.sections.length);
  });

  it('all section IDs match between locales', () => {
    const en = getPrivacyContent('en');
    const fr = getPrivacyContent('fr');
    const enIds = en.sections.map((s) => s.id);
    const frIds = fr.sections.map((s) => s.id);
    expect(enIds).toEqual(frIds);
  });
});
