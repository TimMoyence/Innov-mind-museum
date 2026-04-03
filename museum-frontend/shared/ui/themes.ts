import {
  primaryScale,
  textColors,
  darkTextColors,
  darkSurfaceColors,
  statusColors,
  gradientColors,
} from './tokens.generated';

export interface ThemePalette {
  pageGradient: readonly [string, string, ...string[]];
  primary: string;
  primaryContrast: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  placeholderText: string;
  glassBorder: string;
  glassBackground: string;
  cardBackground: string;
  cardBorder: string;
  inputBackground: string;
  inputBorder: string;
  userBubble: string;
  userBubbleBorder: string;
  assistantBubble: string;
  assistantBubbleBorder: string;
  error: string;
  errorBackground: string;
  success: string;
  successBackground: string;
  danger: string;
  warningText: string;
  warningBackground: string;
  shadowColor: string;
  primaryTint: string;
  primaryBorderSubtle: string;
  modalOverlay: string;
  separator: string;
  timestamp: string;
  surface: string;
  overlay: string;
  blurTint: 'light' | 'dark';
}

export const lightTheme: ThemePalette = {
  pageGradient: [primaryScale['50'], primaryScale['100'], gradientColors.lightEnd],
  primary: primaryScale['600'],
  primaryContrast: '#FFFFFF',
  textPrimary: textColors.primary,
  textSecondary: textColors.secondary,
  textTertiary: textColors.tertiary,
  placeholderText: textColors.placeholder,
  glassBorder: 'rgba(255,255,255,0.58)',
  glassBackground: 'rgba(255,255,255,0.44)',
  cardBackground: 'rgba(255,255,255,0.66)',
  cardBorder: 'rgba(148,163,184,0.42)',
  inputBackground: 'rgba(255,255,255,0.7)',
  inputBorder: 'rgba(148,163,184,0.45)',
  userBubble: 'rgba(30, 64, 175, 0.88)',
  userBubbleBorder: 'rgba(191, 219, 254, 0.6)',
  assistantBubble: 'rgba(255,255,255,0.72)',
  assistantBubbleBorder: 'rgba(148,163,184,0.22)',
  error: statusColors.error.light,
  errorBackground: statusColors.errorBg.light,
  success: statusColors.success.light,
  successBackground: statusColors.successBg.light,
  danger: statusColors.danger.light,
  warningText: statusColors.warning.light,
  warningBackground: statusColors.warningBg.light,
  shadowColor: primaryScale['800'],
  primaryTint: 'rgba(30, 64, 175, 0.06)',
  primaryBorderSubtle: 'rgba(30, 64, 175, 0.2)',
  modalOverlay: 'rgba(0, 0, 0, 0.4)',
  separator: 'rgba(148, 163, 184, 0.35)',
  timestamp: 'rgba(100,116,139,0.92)',
  surface: 'rgba(255,255,255,0.64)',
  overlay: 'rgba(255,255,255,0.70)',
  blurTint: 'light',
};

export const darkTheme: ThemePalette = {
  pageGradient: [darkSurfaceColors.default, darkSurfaceColors.elevated, darkSurfaceColors.default],
  primary: primaryScale['350'],
  primaryContrast: '#FFFFFF',
  textPrimary: darkTextColors.primary,
  textSecondary: darkTextColors.secondary,
  textTertiary: darkTextColors.tertiary,
  placeholderText: darkTextColors.placeholder,
  glassBorder: 'rgba(255,255,255,0.12)',
  glassBackground: 'rgba(30,41,59,0.72)',
  cardBackground: 'rgba(30,41,59,0.66)',
  cardBorder: 'rgba(148,163,184,0.18)',
  inputBackground: 'rgba(30,41,59,0.7)',
  inputBorder: 'rgba(148,163,184,0.25)',
  userBubble: 'rgba(30, 64, 175, 0.92)',
  userBubbleBorder: 'rgba(96, 165, 250, 0.4)',
  assistantBubble: 'rgba(30,41,59,0.72)',
  assistantBubbleBorder: 'rgba(148,163,184,0.18)',
  error: statusColors.error.dark,
  errorBackground: statusColors.errorBg.dark,
  success: statusColors.success.dark,
  successBackground: statusColors.successBg.dark,
  danger: statusColors.danger.dark,
  warningText: statusColors.warning.dark,
  warningBackground: statusColors.warningBg.dark,
  shadowColor: '#000000',
  primaryTint: 'rgba(96, 165, 250, 0.1)',
  primaryBorderSubtle: 'rgba(96, 165, 250, 0.2)',
  modalOverlay: 'rgba(0, 0, 0, 0.6)',
  separator: 'rgba(148, 163, 184, 0.25)',
  timestamp: 'rgba(148,163,184,0.72)',
  surface: 'rgba(30,41,59,0.64)',
  overlay: 'rgba(15,23,42,0.70)',
  blurTint: 'dark',
};
