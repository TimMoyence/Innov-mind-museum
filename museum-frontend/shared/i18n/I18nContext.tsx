import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import * as Updates from 'expo-updates';

import { toSupportedLocale, type SupportedLocale } from '@/shared/config/supportedLocales';
import { setLocale as setHttpLocale } from '@/shared/infrastructure/httpClient';
import { storage } from '@/shared/infrastructure/storage';
import { applyRTLLayout, needsRTLReload } from '@/shared/i18n/rtl';

let onLanguageChangeCb: ((lang: string) => void) | null = null;

/**
 * Registers a callback invoked whenever the user changes the app language.
 * Used to persist the locale preference without coupling shared → features.
 * @param fn - Callback receiving the new language code, or `null` to unregister.
 */
export const setOnLanguageChange = (fn: ((lang: string) => void) | null): void => {
  onLanguageChangeCb = fn;
};

interface I18nContextValue {
  language: SupportedLocale;
  setLanguage: (lang: SupportedLocale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => { /* noop */ },
});

export const useI18n = () => useContext(I18nContext);

function detectDeviceLanguage(): SupportedLocale {
  try {
    const locales = getLocales();
    if (locales.length > 0 && locales[0].languageCode) {
      return toSupportedLocale(locales[0].languageCode);
    }
  } catch {
    // Fallback silently
  }
  return 'en';
}

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<SupportedLocale>('en');

  useEffect(() => {
    // Read the raw stored value — null means "user never chose a language"
    storage.getItem('runtime.defaultLocale')
      .then((stored) => {
        const lang = stored
          ? toSupportedLocale(stored)
          : detectDeviceLanguage();
        setLanguageState(lang);
        void i18n.changeLanguage(lang);
        setHttpLocale(lang);
        // Persist device-detected language so runtimeSettings stays in sync
        if (!stored) {
          onLanguageChangeCb?.(lang);
        }
      })
      .catch(() => { /* noop */ });
  }, []);

  const setLanguage = useCallback((lang: SupportedLocale) => {
    const currentLang = language;
    if (needsRTLReload(currentLang, lang)) {
      onLanguageChangeCb?.(lang);
      applyRTLLayout(lang);
      void Updates.reloadAsync().catch(() => {
        // Fallback: apply language without reload in dev
        setLanguageState(lang);
        void i18n.changeLanguage(lang);
        setHttpLocale(lang);
      });
      return;
    }
    setLanguageState(lang);
    void i18n.changeLanguage(lang);
    setHttpLocale(lang);
    onLanguageChangeCb?.(lang);
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
};
