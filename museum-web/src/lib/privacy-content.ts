import canonical from './legal/privacy-content.canonical.json';

export interface PrivacySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface PrivacyContent {
  title: string;
  version: string;
  lastUpdated: string;
  sections: PrivacySection[];
}

type LegalLocale = 'en' | 'fr';

interface CanonicalSubprocessor {
  name: string;
  role: string;
  jurisdiction: string;
  transferMechanism: 'SCC' | 'adequacy' | 'none' | 'internal';
  category: string;
}

interface CanonicalLocaleContent {
  sections: PrivacySection[];
  recipients: CanonicalSubprocessor[];
}

interface CanonicalPrivacy {
  version: string;
  lastUpdated: string;
  locales: Record<LegalLocale, CanonicalLocaleContent>;
}

const typed = canonical as CanonicalPrivacy;

const TITLES: Record<LegalLocale, string> = {
  en: 'Privacy Policy (GDPR)',
  fr: 'Politique de confidentialité (RGPD)',
};

function buildContent(locale: LegalLocale): PrivacyContent {
  return {
    title: TITLES[locale],
    version: typed.version,
    lastUpdated: typed.lastUpdated,
    sections: typed.locales[locale].sections.map((s) => ({
      id: s.id,
      title: s.title,
      paragraphs: [...s.paragraphs],
    })),
  };
}

const privacyContentByLocale: Record<LegalLocale, PrivacyContent> = {
  en: buildContent('en'),
  fr: buildContent('fr'),
};

function isPrivacyLocale(locale: string): locale is LegalLocale {
  return locale === 'en' || locale === 'fr';
}

export function getPrivacyContent(locale: string): PrivacyContent {
  return isPrivacyLocale(locale) ? privacyContentByLocale[locale] : privacyContentByLocale.en;
}

export function getSubprocessors(locale: string): CanonicalSubprocessor[] {
  const loc: LegalLocale = isPrivacyLocale(locale) ? locale : 'en';
  return typed.locales[loc].recipients.map((r) => ({ ...r }));
}

export type Subprocessor = CanonicalSubprocessor;
