export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'it', 'ja', 'zh', 'ar'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

interface LanguageOption {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
];

export function isSupportedLocale(code: string): code is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

/**
 * Maps a full locale tag (e.g. "fr-FR") or bare code ("fr") to a SupportedLocale.
 * Returns "en" when the code is not recognized.
 */
export function toSupportedLocale(raw: string): SupportedLocale {
  const code = raw.toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(code) ? code : 'en';
}
