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

export function loadPrivacyCanonical(): PrivacyCanonical {
  return privacyCanonicalJson as PrivacyCanonical;
}

export function loadTermsCanonical(): TermsCanonical {
  return termsCanonicalJson as TermsCanonical;
}
