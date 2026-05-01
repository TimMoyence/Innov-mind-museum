import { colors } from '../colors';
import { spacing } from '../spacing';

/**
 * Per-variant per-size token mappings for the LiquidButton primitive.
 * Each leaf object holds presentation values; consumers map them onto
 * RN style objects (mobile) or CSS variables (web).
 */
export const buttonTokens = {
  variants: {
    primary: {
      bg: colors.primary[500],
      bgPressed: colors.primary[600],
      bgDisabled: colors.primary[200],
      border: 'transparent',
      text: '#FFFFFF',
    },
    secondary: {
      bg: 'transparent',
      bgPressed: colors.primary[50],
      bgDisabled: 'transparent',
      border: colors.primary[500],
      text: colors.primary[500],
    },
    destructive: {
      bg: colors.status.danger.light,
      bgPressed: '#B91C1C',
      bgDisabled: '#FCA5A5',
      border: 'transparent',
      text: '#FFFFFF',
    },
  },
  sizes: {
    sm: { paddingV: spacing['2'].px, paddingH: spacing['3'].px, fontSize: 13, radius: 8 },
    md: { paddingV: spacing['3'].px, paddingH: spacing['4'].px, fontSize: 15, radius: 10 },
    lg: { paddingV: spacing['4'].px, paddingH: spacing['5'].px, fontSize: 17, radius: 12 },
  },
} as const;

export type ButtonVariant = keyof typeof buttonTokens.variants;
export type ButtonSize = keyof typeof buttonTokens.sizes;
