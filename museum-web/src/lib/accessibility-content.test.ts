import { describe, it, expect } from 'vitest';
import { getAccessibilityContent } from './accessibility-content';

describe('accessibility-content.ts', () => {
  it('returns English content for locale "en"', () => {
    const content = getAccessibilityContent('en');
    expect(content.title).toBe('Accessibility Statement');
    expect(content.sections.length).toBeGreaterThan(0);
  });

  it('returns French content for locale "fr"', () => {
    const content = getAccessibilityContent('fr');
    expect(content.title).toContain('Déclaration');
    expect(content.sections.length).toBeGreaterThan(0);
  });

  it('falls back to English for unknown locale', () => {
    const content = getAccessibilityContent('de');
    expect(content.title).toBe('Accessibility Statement');
  });

  it('each section has an id, title, and at least one paragraph', () => {
    const content = getAccessibilityContent('en');
    for (const section of content.sections) {
      expect(section.id).toBeTruthy();
      expect(section.title).toBeTruthy();
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });

  it('French and English have the same number of sections', () => {
    const en = getAccessibilityContent('en');
    const fr = getAccessibilityContent('fr');
    expect(en.sections.length).toBe(fr.sections.length);
  });

  it('all section IDs match between locales', () => {
    const en = getAccessibilityContent('en');
    const fr = getAccessibilityContent('fr');
    const enIds = en.sections.map((s) => s.id);
    const frIds = fr.sections.map((s) => s.id);
    expect(enIds).toEqual(frIds);
  });

  it('documents the WCAG 1.4.3 contrast remediation', () => {
    const en = getAccessibilityContent('en');
    const findings = en.sections.find((s) => s.id === 'findings');
    expect(findings).toBeDefined();
    if (!findings) return;
    const joined = findings.paragraphs.join(' ');
    expect(joined).toContain('1.4.3');
    expect(joined).toContain('4.78:1');
  });
});
