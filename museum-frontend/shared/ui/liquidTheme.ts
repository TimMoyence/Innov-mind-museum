import type { ImageSourcePropType } from 'react-native';

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
    mobile: require('../../assets/images/backgrounds/mobile/museum-child.png'),
    desktop: require('../../assets/images/backgrounds/desktop/museum-child.png'),
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-girl.png'),
    desktop: require('../../assets/images/backgrounds/desktop/museum-girl.png'),
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-men.png'),
    desktop: require('../../assets/images/backgrounds/desktop/museum-men.png'),
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-old-men.png'),
    desktop: require('../../assets/images/backgrounds/desktop/museum-old-men.png'),
  },
  {
    mobile: require('../../assets/images/backgrounds/mobile/museum-old-women.png'),
    desktop: require('../../assets/images/backgrounds/desktop/museum-old-women.png'),
  },
];

export const pickMuseumBackground = (index: number): ResponsiveBackground => {
  const length = museumBackgrounds.length;
  const normalized = ((index % length) + length) % length;
  return museumBackgrounds[normalized];
};

export const liquidColors = {
  pageGradient: ['#EAF2FF', '#D8E8FF', '#D5F0FF'] as const,
  primary: '#1D4ED8',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  glassBorder: 'rgba(255,255,255,0.58)',
  glassBackground: 'rgba(255,255,255,0.44)',
};
