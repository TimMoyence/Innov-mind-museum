import 'intl-pluralrules';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en/translation.json';
import fr from '../locales/fr/translation.json';
import es from '../locales/es/translation.json';
import de from '../locales/de/translation.json';
import it from '../locales/it/translation.json';
import ja from '../locales/ja/translation.json';
import zh from '../locales/zh/translation.json';
import ar from '../locales/ar/translation.json';

import './types';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    es: { translation: es },
    de: { translation: de },
    it: { translation: it },
    ja: { translation: ja },
    zh: { translation: zh },
    ar: { translation: ar },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
