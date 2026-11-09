import { useMemo } from 'react';

import type { ThemePalette } from '@/shared/ui/themes';

import { type MuseumBranding, pickContrastingTextColor } from '../domain/museum-branding';

export const useBrandedTheme = (appTheme: ThemePalette, branding: MuseumBranding): ThemePalette => {
  const primaryColor = branding.primaryColor;

  return useMemo<ThemePalette>(() => {
    if (!primaryColor) {
      return appTheme;
    }

    return {
      ...appTheme,
      primary: primaryColor,
      primaryContrast: pickContrastingTextColor(primaryColor),
      primaryTint: `${primaryColor}1A`,
      primaryBorderSubtle: `${primaryColor}33`,
    };
  }, [appTheme, primaryColor]);
};
