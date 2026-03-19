import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';

import { toSupportedLocale, type SupportedLocale } from '@/shared/config/supportedLocales';
import { saveDefaultLocale } from '@/features/settings/runtimeSettings';
import { setLocale as setHttpLocale } from '@/shared/infrastructure/httpClient';
import { storage } from '@/shared/infrastructure/storage';

interface I18nContextValue {
  language: SupportedLocale;
  setLanguage: (lang: SupportedLocale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => {},
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
          void saveDefaultLocale(lang);
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback((lang: SupportedLocale) => {
    setLanguageState(lang);
    void i18n.changeLanguage(lang);
    setHttpLocale(lang);
    void saveDefaultLocale(lang);
  }, []);

  return (
    <I18nContext.Provider value={{ language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
};
