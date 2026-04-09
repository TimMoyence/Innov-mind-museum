import {
  primaryScale,
  textColors,
  darkTextColors,
  surfaceColors,
  darkSurfaceColors,
  statusColors,
  gradientColors,
  functional,
} from './tokens';

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
  primaryContrast: surfaceColors.default,
  textPrimary: textColors.primary,
  textSecondary: textColors.secondary,
  textTertiary: textColors.tertiary,
  placeholderText: textColors.placeholder,
  glassBorder: functional.glassBorder,
  glassBackground: functional.glassBackground,
  cardBackground: functional.cardBackground,
  cardBorder: functional.cardBorder,
  inputBackground: functional.inputBackground,
  inputBorder: functional.inputBorder,
  userBubble: functional.userBubble,
  userBubbleBorder: functional.userBubbleBorder,
  assistantBubble: functional.assistantBubble,
  assistantBubbleBorder: functional.assistantBubbleBorder,
  error: statusColors.error.light,
  errorBackground: statusColors.errorBg.light,
  success: statusColors.success.light,
  successBackground: statusColors.successBg.light,
  danger: statusColors.danger.light,
  warningText: statusColors.warning.light,
  warningBackground: statusColors.warningBg.light,
  shadowColor: primaryScale['800'],
  primaryTint: functional.primaryTint,
  primaryBorderSubtle: functional.primaryBorderSubtle,
  modalOverlay: functional.modalOverlay,
  separator: functional.separator,
  timestamp: functional.timestamp,
  surface: functional.surface,
  overlay: functional.overlay,
  blurTint: 'light',
};

export const darkTheme: ThemePalette = {
  pageGradient: [darkSurfaceColors.default, darkSurfaceColors.elevated, darkSurfaceColors.default],
  primary: primaryScale['350'],
  primaryContrast: surfaceColors.default,
  textPrimary: darkTextColors.primary,
  textSecondary: darkTextColors.secondary,
  textTertiary: darkTextColors.tertiary,
  placeholderText: darkTextColors.placeholder,
  glassBorder: functional.darkGlassBorder,
  glassBackground: functional.darkGlassBackground,
  cardBackground: functional.darkCardBackground,
  cardBorder: functional.darkCardBorder,
  inputBackground: functional.darkInputBackground,
  inputBorder: functional.darkInputBorder,
  userBubble: functional.darkUserBubble,
  userBubbleBorder: functional.darkUserBubbleBorder,
  assistantBubble: functional.darkAssistantBubble,
  assistantBubbleBorder: functional.darkAssistantBubbleBorder,
  error: statusColors.error.dark,
  errorBackground: statusColors.errorBg.dark,
  success: statusColors.success.dark,
  successBackground: statusColors.successBg.dark,
  danger: statusColors.danger.dark,
  warningText: statusColors.warning.dark,
  warningBackground: statusColors.warningBg.dark,
  shadowColor: functional.darkShadowColor,
  primaryTint: functional.darkPrimaryTint,
  primaryBorderSubtle: functional.darkPrimaryBorderSubtle,
  modalOverlay: functional.darkModalOverlay,
  separator: functional.darkSeparator,
  timestamp: functional.darkTimestamp,
  surface: functional.darkSurface,
  overlay: functional.darkOverlay,
  blurTint: 'dark',
};
