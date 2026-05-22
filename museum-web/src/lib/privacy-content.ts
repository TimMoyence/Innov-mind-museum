/**
 * GENERATED-FROM-CANONICAL — DO NOT EDIT MANUALLY.
 *
 * Reads `museum-backend/src/shared/legal/privacy-content.canonical.json`
 * (single source of truth — see ADR for canonical-content-source) and
 * surfaces a `PrivacyContent` object via `getPrivacyContent(locale)`.
 *
 * The drift sentinel `museum-backend/scripts/sentinels/privacy-content-drift.mjs`
 * verifies this file stays byte-aligned with the canonical by grepping for the
 * canonical `version`, `lastUpdated`, every section `id`, and every recipient
 * `name`. Those tokens are emitted verbatim by the helpers below.
 *
 * Canonical metadata mirror (kept verbatim for drift sentinel grep) ----------
 *   version: 1.0.0
 *   lastUpdated: 2026-05-21
 *   sectionIds: controller, data-collected, purposes, device-permissions,
 *               recipients, transfers, retention, security, rights, minors,
 *               cookies, ai-disclosure, granular-ai-consent, changes
 *   subprocessors:
 *     - OpenAI
 *     - Google Cloud
 *     - DeepSeek
 *     - OVH SAS
 *     - Amazon Web Services
 *     - Expo
 *     - Brevo
 *     - Sentry
 *     - Apple
 *     - Tavily
 *     - Brave
 *     - Unsplash
 *     - Langfuse
 *     - CARTO
 *     - Wikidata
 *     - Wikimedia
 *     - Nominatim
 *     - OpenStreetMap Foundation
 *     - Better-Stack
 */
import canonical from '../../../museum-backend/src/shared/legal/privacy-content.canonical.json';

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

/**
 * Inline canonical tokens — emitted as TS string literals so the drift
 * sentinel (`privacy-content-drift.mjs`) can find them in the source AFTER
 * its comment-stripping pre-pass. Do not delete or rename: the sentinel
 * greps for each value verbatim. Keep in sync with the canonical JSON; the
 * `sentinel:privacy-drift` CI step catches drift.
 *
 * For the human-readable docblock list of subprocessors, see the canonical
 * JSON. This array is the machine-readable mirror.
 */
export const PRIVACY_SURFACE_TOKENS = {
  version: '1.0.0',
  lastUpdated: '2026-05-21',
  sectionIds: [
    'controller',
    'data-collected',
    'purposes',
    'device-permissions',
    'recipients',
    'transfers',
    'retention',
    'security',
    'rights',
    'minors',
    'cookies',
    'ai-disclosure',
    'granular-ai-consent',
    'changes',
  ] as const,
  subprocessors: [
    'OpenAI',
    'Google Cloud',
    'DeepSeek',
    'OVH SAS',
    'Amazon Web Services',
    'Expo',
    'Brevo',
    'Sentry',
    'Apple',
    'Tavily',
    'Brave',
    'Unsplash',
    'Langfuse',
    'CARTO',
    'Wikidata',
    'Wikimedia',
    'Nominatim',
    'OpenStreetMap Foundation',
    'Better-Stack',
  ] as const,
} as const;

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

/**
 * Typed recipients (subprocessors) — exported for the `/subprocessors` route.
 * Returned as a copy so callers cannot mutate the canonical-derived array.
 */
export function getSubprocessors(locale: string): CanonicalSubprocessor[] {
  const loc: LegalLocale = isPrivacyLocale(locale) ? locale : 'en';
  return typed.locales[loc].recipients.map((r) => ({ ...r }));
}

export type Subprocessor = CanonicalSubprocessor;
