import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import * as Updates from 'expo-updates';

import { toSupportedLocale, type SupportedLocale } from '@/shared/config/supportedLocales';
import { setLocale as setHttpLocale } from '@/shared/infrastructure/httpClient';
import { storage } from '@/shared/infrastructure/storage';
import { migrateStorageKey } from '@/shared/infrastructure/migrateStorageKey';
import { applyRTLLayout, needsRTLReload } from '@/shared/i18n/rtl';

const LANGUAGE_KEY = 'musaium.runtime.defaultLocale';

const persistLanguage = (lang: SupportedLocale): void => {
  void storage.setItem(LANGUAGE_KEY, lang);
};

interface I18nContextValue {
  language: SupportedLocale;
  setLanguage: (lang: SupportedLocale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => undefined,
});

export const useI18n = () => useContext(I18nContext);

function detectDeviceLanguage(): SupportedLocale {
  try {
    const locales = getLocales();
    if (locales.length > 0 && locales[0].languageCode) {
      return toSupportedLocale(locales[0].languageCode);
    }
  } catch {}
  return 'en';
}

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<SupportedLocale>('en');

  useEffect(() => {
    migrateStorageKey(LANGUAGE_KEY, 'runtime.defaultLocale')
      .then(() => storage.getItem(LANGUAGE_KEY))
      .then((stored) => {
        const lang = stored ? toSupportedLocale(stored) : detectDeviceLanguage();
        setLanguageState(lang);
        void i18n.changeLanguage(lang);
        setHttpLocale(lang);
        if (!stored) {
          persistLanguage(lang);
        }
      })
      .catch(() => undefined);
  }, []);

  const setLanguage = useCallback(
    (lang: SupportedLocale) => {
      const currentLang = language;
      if (needsRTLReload(currentLang, lang)) {
        persistLanguage(lang);
        applyRTLLayout(lang);
        void (async () => {
          try {
            if (!__DEV__) {
              await Updates.reloadAsync();
              return;
            }
          } catch {}
          setLanguageState(lang);
          void i18n.changeLanguage(lang);
          setHttpLocale(lang);
        })();
        return;
      }
      setLanguageState(lang);
      void i18n.changeLanguage(lang);
      setHttpLocale(lang);
      persistLanguage(lang);
    },
    [language],
  );

  return <I18nContext.Provider value={{ language, setLanguage }}>{children}</I18nContext.Provider>;
};
