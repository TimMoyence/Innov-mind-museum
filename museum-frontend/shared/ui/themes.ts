export interface ThemePalette {
  pageGradient: readonly [string, string, ...string[]];
  primary: string;
  textPrimary: string;
  textSecondary: string;
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
  timestamp: string;
  surface: string;
  overlay: string;
  blurTint: 'light' | 'dark';
}

export const lightTheme: ThemePalette = {
  pageGradient: ['#EAF2FF', '#D8E8FF', '#D5F0FF'],
  primary: '#1D4ED8',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
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
  error: '#991B1B',
  errorBackground: 'rgba(254,242,242,0.82)',
  success: '#166534',
  timestamp: 'rgba(100,116,139,0.92)',
  surface: 'rgba(255,255,255,0.64)',
  overlay: 'rgba(255,255,255,0.70)',
  blurTint: 'light',
};

export const darkTheme: ThemePalette = {
  pageGradient: ['#0F172A', '#1E293B', '#0F172A'],
  primary: '#60A5FA',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
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
  error: '#FCA5A5',
  errorBackground: 'rgba(127,29,29,0.4)',
  success: '#86EFAC',
  timestamp: 'rgba(148,163,184,0.72)',
  surface: 'rgba(30,41,59,0.64)',
  overlay: 'rgba(15,23,42,0.70)',
  blurTint: 'dark',
};
