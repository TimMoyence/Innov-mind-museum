import { I18nManager } from 'react-native';

export const RTL_LOCALES = ['ar'] as const;

export function isRTLLocale(locale: string): boolean {
  return RTL_LOCALES.some(rtl => locale.startsWith(rtl));
}

export function applyRTLLayout(locale: string): void {
  const shouldBeRTL = isRTLLocale(locale);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
  }
}

export function needsRTLReload(currentLocale: string, newLocale: string): boolean {
  return isRTLLocale(currentLocale) !== isRTLLocale(newLocale);
}
