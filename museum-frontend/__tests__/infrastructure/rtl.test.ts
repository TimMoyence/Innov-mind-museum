jest.mock('react-native', () => ({
  I18nManager: {
    isRTL: false,
    allowRTL: jest.fn(),
    forceRTL: jest.fn(),
  },
}));

import { isRTLLocale, needsRTLReload, applyRTLLayout } from '@/shared/i18n/rtl';
import { I18nManager } from 'react-native';

describe('rtl', () => {
  describe('isRTLLocale', () => {
    it('ar is RTL', () => {
      expect(isRTLLocale('ar')).toBe(true);
    });

    it('ar-SA is RTL (startsWith match)', () => {
      expect(isRTLLocale('ar-SA')).toBe(true);
    });

    it('en is not RTL', () => {
      expect(isRTLLocale('en')).toBe(false);
    });

    it('fr is not RTL', () => {
      expect(isRTLLocale('fr')).toBe(false);
    });

    it('he is not RTL (not in RTL_LOCALES)', () => {
      // The source only includes 'ar' in RTL_LOCALES
      expect(isRTLLocale('he')).toBe(false);
    });
  });

  describe('needsRTLReload', () => {
    it('returns true when switching from LTR to RTL', () => {
      expect(needsRTLReload('en', 'ar')).toBe(true);
    });

    it('returns true when switching from RTL to LTR', () => {
      expect(needsRTLReload('ar', 'en')).toBe(true);
    });

    it('returns false when both are LTR', () => {
      expect(needsRTLReload('en', 'fr')).toBe(false);
    });

    it('returns false when both are RTL', () => {
      expect(needsRTLReload('ar', 'ar-SA')).toBe(false);
    });
  });

  describe('applyRTLLayout', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (I18nManager as unknown as Record<string, boolean>).isRTL = false;
    });

    it('forces RTL for Arabic locale', () => {
      applyRTLLayout('ar');

      expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
      expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
    });

    it('disables RTL for English locale when currently RTL', () => {
      (I18nManager as unknown as Record<string, boolean>).isRTL = true;

      applyRTLLayout('en');

      expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
      expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
    });

    it('does nothing when RTL state already matches', () => {
      (I18nManager as unknown as Record<string, boolean>).isRTL = false;

      applyRTLLayout('en');

      expect(I18nManager.allowRTL).not.toHaveBeenCalled();
      expect(I18nManager.forceRTL).not.toHaveBeenCalled();
    });
  });
});
