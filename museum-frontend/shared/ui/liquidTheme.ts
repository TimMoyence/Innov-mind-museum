import type { ImageSourcePropType } from 'react-native';

import { lightTheme, type ThemePalette } from './themes';

export interface ResponsiveBackground {
  mobile: ImageSourcePropType;
  desktop: ImageSourcePropType;
}

export const viewportConfig = {
  desktopBreakpoint: 1024,
  mobileBackgroundOpacity: 0.18,
  desktopBackgroundOpacity: 0.24,
  mobileResizeMode: 'cover' as const,
  desktopResizeMode: 'contain' as const,
  desktopMaxContentWidth: 1180,
};

export const museumBackgrounds: ResponsiveBackground[] = [
  {
    mobile:
      require('../../assets/images/backgrounds/mobile/museum-child.png') as ImageSourcePropType,
    desktop:
      require('../../assets/images/backgrounds/desktop/museum-child.png') as ImageSourcePropType,
  },
  {
    mobile:
      require('../../assets/images/backgrounds/mobile/museum-girl.png') as ImageSourcePropType,
    desktop:
      require('../../assets/images/backgrounds/desktop/museum-girl.png') as ImageSourcePropType,
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-men.png') as ImageSourcePropType,
    desktop:
      require('../../assets/images/backgrounds/desktop/museum-men.png') as ImageSourcePropType,
  },
  {
    mobile:
      require('../../assets/images/backgrounds/mobile/museum-old-men.png') as ImageSourcePropType,
    desktop:
      require('../../assets/images/backgrounds/desktop/museum-old-men.png') as ImageSourcePropType,
  },
  {
    mobile:
      require('../../assets/images/backgrounds/mobile/museum-old-women.png') as ImageSourcePropType,
    desktop:
      require('../../assets/images/backgrounds/desktop/museum-old-women.png') as ImageSourcePropType,
  },
];

export const pickMuseumBackground = (index: number): ResponsiveBackground => {
  const [first, ...rest] = museumBackgrounds;
  if (!first) throw new Error('museumBackgrounds must not be empty');
  const all = [first, ...rest];
  const length = all.length;
  const normalized = ((index % length) + length) % length;
  return all[normalized] ?? first;
};

export const themeColors = (theme: ThemePalette) => ({
  pageGradient: theme.pageGradient,
  primary: theme.primary,
  textPrimary: theme.textPrimary,
  textSecondary: theme.textSecondary,
  glassBorder: theme.glassBorder,
  glassBackground: theme.glassBackground,
});

export const liquidColors = themeColors(lightTheme);
