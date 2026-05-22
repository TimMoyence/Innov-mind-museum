/**
 * Single source of truth for the public legal content (privacy + terms).
 *
 * The canonical JSON files in this folder are the immutable origin from
 * which all three public surfaces (`docs/privacy-policy.html`,
 * `museum-web/src/lib/privacy-content.ts`,
 * `museum-frontend/features/legal/{privacyPolicyContent,termsOfServiceContent}.ts`)
 * are regenerated at build time.
 *
 * The drift sentinel (`museum-backend/scripts/sentinels/privacy-content-drift.mjs`)
 * verifies that every surface stays byte-aligned with the canonical.
 *
 * Rationale: see design.md §9 D1 (run 2026-05-21-p0-gdpr).
 */
import privacyCanonicalJson from './privacy-content.canonical.json';
import termsCanonicalJson from './terms-content.canonical.json';

export type LegalLocale = 'en' | 'fr';

export type TransferMechanism = 'SCC' | 'adequacy' | 'none' | 'internal';

export interface Subprocessor {
  name: string;
  role: string;
  jurisdiction: string;
  transferMechanism: TransferMechanism;
  category: string;
}

export interface PrivacySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface PrivacyLocaleContent {
  sections: PrivacySection[];
  recipients: Subprocessor[];
}

export interface PrivacyCanonical {
  version: string;
  lastUpdated: string;
  locales: Record<LegalLocale, PrivacyLocaleContent>;
}

export interface TermsSection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface TermsLocaleContent {
  title: string;
  sections: TermsSection[];
}

export interface TermsCanonical {
  version: string;
  lastUpdated: string;
  locales: Record<LegalLocale, TermsLocaleContent>;
}

/**
 * Load the canonical privacy content (typed). The underlying JSON is
 * imported at module load — no async I/O required.
 */
export function loadPrivacyCanonical(): PrivacyCanonical {
  return privacyCanonicalJson as PrivacyCanonical;
}

/**
 * Load the canonical terms-of-service content (typed). The underlying JSON
 * is imported at module load — no async I/O required.
 */
export function loadTermsCanonical(): TermsCanonical {
  return termsCanonicalJson as TermsCanonical;
}
