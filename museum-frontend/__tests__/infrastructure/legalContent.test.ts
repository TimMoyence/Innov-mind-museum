import {
  PRIVACY_POLICY_CONTENT,
  isPrivacyPlaceholderValue,
} from '@/features/legal/privacyPolicyContent';
import { TERMS_OF_SERVICE_CONTENT } from '@/features/legal/termsOfServiceContent';

// Conformité email RGPD — RED phase (UFR-022,
// RUN_ID 2026-06-13-conformite-email-subprocessors).
// OLD must be eliminated from the legal content; NEW is the brand mailbox.
const OLD_CONTACT_EMAIL = 'tim.moyence@gmail.com';
const NEW_CONTACT_EMAIL = 'contact@musaium.com';

describe('PRIVACY_POLICY_CONTENT', () => {
  it('has required top-level fields', () => {
    expect(PRIVACY_POLICY_CONTENT.title).toBeDefined();
    expect(PRIVACY_POLICY_CONTENT.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PRIVACY_POLICY_CONTENT.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRIVACY_POLICY_CONTENT.controllerName).toBeDefined();
    // UC-A16 (regression): byte-exact NEW, no longer the weak `.toContain('@')`.
    expect(PRIVACY_POLICY_CONTENT.contactEmail).toBe(NEW_CONTACT_EMAIL);
  });

  it('UC-A17 (regression): serialized PRIVACY_POLICY_CONTENT contains 0 OLD', () => {
    expect(JSON.stringify(PRIVACY_POLICY_CONTENT)).not.toContain(OLD_CONTACT_EMAIL);
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

  it('UC-A21 (regression): serialized TERMS_OF_SERVICE_CONTENT contains 0 OLD', () => {
    expect(JSON.stringify(TERMS_OF_SERVICE_CONTENT)).not.toContain(OLD_CONTACT_EMAIL);
  });

  it('UC-A22 (happy): contact section paragraph references NEW', () => {
    const contact = TERMS_OF_SERVICE_CONTENT.sections.find((s) => s.id === 'contact');
    expect(contact).toBeDefined();
    expect(contact?.paragraphs[0]).toContain(NEW_CONTACT_EMAIL);
    expect(contact?.paragraphs[0]).not.toContain(OLD_CONTACT_EMAIL);
  });

  it('UC-A23 (edge): terms is hand-maintained — has no contactEmail field', () => {
    // Unlike PRIVACY_POLICY_CONTENT, terms exposes no `contactEmail` field;
    // the codegen never touches terms, so the email lives inline in the
    // contact section. Asserting the absence of the field documents NFR-2.
    expect(
      (TERMS_OF_SERVICE_CONTENT as unknown as Record<string, unknown>).contactEmail,
    ).toBeUndefined();
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
