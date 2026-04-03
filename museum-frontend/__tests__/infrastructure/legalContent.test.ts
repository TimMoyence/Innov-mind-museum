import {
  PRIVACY_POLICY_CONTENT,
  isPrivacyPlaceholderValue,
} from '@/features/legal/privacyPolicyContent';
import { TERMS_OF_SERVICE_CONTENT } from '@/features/legal/termsOfServiceContent';

describe('PRIVACY_POLICY_CONTENT', () => {
  it('has required top-level fields', () => {
    expect(PRIVACY_POLICY_CONTENT.title).toBeDefined();
    expect(PRIVACY_POLICY_CONTENT.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PRIVACY_POLICY_CONTENT.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRIVACY_POLICY_CONTENT.controllerName).toBeDefined();
    expect(PRIVACY_POLICY_CONTENT.contactEmail).toContain('@');
  });

  it('has at least one section', () => {
    expect(PRIVACY_POLICY_CONTENT.sections.length).toBeGreaterThan(0);
  });

  it('has non-empty rights summary', () => {
    expect(PRIVACY_POLICY_CONTENT.rightsSummary.length).toBeGreaterThan(0);
  });

  it('each section has id, title, and paragraphs', () => {
    for (const section of PRIVACY_POLICY_CONTENT.sections) {
      expect(section.id).toBeDefined();
      expect(section.title).toBeDefined();
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });
});

describe('TERMS_OF_SERVICE_CONTENT', () => {
  it('has required top-level fields', () => {
    expect(TERMS_OF_SERVICE_CONTENT.title).toBeDefined();
    expect(TERMS_OF_SERVICE_CONTENT.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(TERMS_OF_SERVICE_CONTENT.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has at least one section', () => {
    expect(TERMS_OF_SERVICE_CONTENT.sections.length).toBeGreaterThan(0);
  });

  it('each section has id, title, and paragraphs', () => {
    for (const section of TERMS_OF_SERVICE_CONTENT.sections) {
      expect(section.id).toBeDefined();
      expect(section.title).toBeDefined();
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });
});

describe('isPrivacyPlaceholderValue', () => {
  it('returns true for strings containing TO_FILL_ marker', () => {
    expect(isPrivacyPlaceholderValue('TO_FILL_email')).toBe(true);
    expect(isPrivacyPlaceholderValue('Contact: TO_FILL_address')).toBe(true);
  });

  it('returns false for regular values', () => {
    expect(isPrivacyPlaceholderValue('tim@example.com')).toBe(false);
    expect(isPrivacyPlaceholderValue('')).toBe(false);
    expect(isPrivacyPlaceholderValue('Some regular text')).toBe(false);
  });
});
