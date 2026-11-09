type Dict = Record<string, unknown>;

const arBundle = require('@/shared/locales/ar/translation.json') as Dict;
const deBundle = require('@/shared/locales/de/translation.json') as Dict;
const enBundle = require('@/shared/locales/en/translation.json') as Dict;
const esBundle = require('@/shared/locales/es/translation.json') as Dict;
const frBundle = require('@/shared/locales/fr/translation.json') as Dict;
const itBundle = require('@/shared/locales/it/translation.json') as Dict;
const jaBundle = require('@/shared/locales/ja/translation.json') as Dict;
const zhBundle = require('@/shared/locales/zh/translation.json') as Dict;

const get = (obj: Dict, path: string): unknown => {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Dict)[key];
    }
    return undefined;
  }, obj);
};

const LOCALES: Record<string, Dict> = {
  ar: arBundle,
  de: deBundle,
  en: enBundle,
  es: esBundle,
  fr: frBundle,
  it: itBundle,
  ja: jaBundle,
  zh: zhBundle,
};

const REQUIRED_KEYS = [
  'error.network',
  'error.timeout',
  'error.unauthorized',
  'error.forbidden',
  'error.notFound',
  'error.validation',
  'error.rateLimited',
  'error.dailyLimitReached',
  'error.unknown',
  'error.socialAuth.generic',
  'error.socialAuth.google_cancelled',
  'error.socialAuth.google_no_id_token',
  'error.socialAuth.google_in_progress',
  'error.socialAuth.google_play_services_unavailable',
  'error.socialAuth.google_developer_error',
  'error.socialAuth.apple_no_identity_token',
  'error.socialAuth.ios_unavailable',
  'error.chat.contract_invalid',
  'error.chat.audio_missing',
  'error.chat.streaming_unavailable',
  'error.location.generic',
  'error.location.timeout',
  'error.location.permission_denied',
  'error.offlinePack.download_failed',
  'error.review.generic',
  'error.review.load_failed',
  'error.review.load_more_failed',
  'error.review.already_reviewed',
  'error.review.submit_failed',
];

describe('error i18n contract', () => {
  for (const [locale, bundle] of Object.entries(LOCALES)) {
    for (const key of REQUIRED_KEYS) {
      it(`has ${locale.toUpperCase()} translation for "${key}"`, () => {
        const v = get(bundle, key);
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      });
    }
  }
});
