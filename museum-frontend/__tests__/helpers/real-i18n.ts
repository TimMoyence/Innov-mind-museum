import i18n from '@/shared/i18n/i18n';

type AppLanguage = 'en' | 'fr' | 'es' | 'de' | 'it' | 'ja' | 'zh' | 'ar';

interface MockedI18n {
  useTranslation: () => unknown;
}

const mocked = jest.requireMock<MockedI18n>('react-i18next');
const keysOnly = mocked.useTranslation;

afterEach(() => {
  mocked.useTranslation = keysOnly;
  void i18n.changeLanguage('en');
});

export const speakAppLanguage = (language: AppLanguage): void => {
  mocked.useTranslation = () => ({
    t: i18n.getFixedT(language),
    i18n: { language },
  });
  void i18n.changeLanguage(language);
};
