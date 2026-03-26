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
  pageGradient: ['#EAF2FF', '#D8E8FF', '#D5F0FF'],
  primary: '#1D4ED8',
  primaryContrast: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textTertiary: '#475569',
  placeholderText: '#64748B',
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
  successBackground: 'rgba(220,252,231,0.78)',
  danger: '#DC2626',
  warningText: '#92400E',
  warningBackground: 'rgba(254,243,199,0.78)',
  shadowColor: '#1E3A8A',
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
  pageGradient: ['#0F172A', '#1E293B', '#0F172A'],
  primary: '#60A5FA',
  primaryContrast: '#FFFFFF',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#7C8CA2',
  placeholderText: '#64748B',
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
  successBackground: 'rgba(34,197,94,0.15)',
  danger: '#EF4444',
  warningText: '#FCD34D',
  warningBackground: 'rgba(245,158,11,0.15)',
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
