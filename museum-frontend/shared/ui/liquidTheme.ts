import type { ImageSourcePropType } from 'react-native';

import { lightTheme, type ThemePalette } from './themes';

/** Pair of image sources for mobile and desktop viewports used by LiquidScreen backgrounds. */
export interface ResponsiveBackground {
  mobile: ImageSourcePropType;
  desktop: ImageSourcePropType;
}

/** Responsive viewport breakpoints, background opacity values, and layout constraints for the liquid design system. */
export const viewportConfig = {
  desktopBreakpoint: 1024,
  mobileBackgroundOpacity: 0.18,
  desktopBackgroundOpacity: 0.24,
  mobileResizeMode: 'cover' as const,
  desktopResizeMode: 'contain' as const,
  desktopMaxContentWidth: 1180,
};

/** Pre-loaded set of museum-themed background image pairs (mobile + desktop) used across screens. */
export const museumBackgrounds: ResponsiveBackground[] = [
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-child.png') as ImageSourcePropType,
    desktop: require('../../assets/images/backgrounds/desktop/museum-child.png') as ImageSourcePropType,
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-girl.png') as ImageSourcePropType,
    desktop: require('../../assets/images/backgrounds/desktop/museum-girl.png') as ImageSourcePropType,
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-men.png') as ImageSourcePropType,
    desktop: require('../../assets/images/backgrounds/desktop/museum-men.png') as ImageSourcePropType,
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-old-men.png') as ImageSourcePropType,
    desktop: require('../../assets/images/backgrounds/desktop/museum-old-men.png') as ImageSourcePropType,
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-old-women.png') as ImageSourcePropType,
    desktop: require('../../assets/images/backgrounds/desktop/museum-old-women.png') as ImageSourcePropType,
  },
];

/** Returns a museum background by index, wrapping around if the index exceeds the available set. */
export const pickMuseumBackground = (index: number): ResponsiveBackground => {
  const length = museumBackgrounds.length;
  const normalized = ((index % length) + length) % length;
  return museumBackgrounds[normalized];
};

/** Returns theme-aware color tokens for the liquid design system. */
export const themeColors = (theme: ThemePalette) => ({
  pageGradient: theme.pageGradient,
  primary: theme.primary,
  textPrimary: theme.textPrimary,
  textSecondary: theme.textSecondary,
  glassBorder: theme.glassBorder,
  glassBackground: theme.glassBackground,
});

/** Core color tokens for the liquid design system (light theme — backward compat for unmigrated files). */
export const liquidColors = themeColors(lightTheme);
