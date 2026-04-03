/**
 * Musaium Design System — Typography Tokens (SSOT)
 *
 * Font sizes in px (React Native) and rem (web).
 * 1rem = 16px baseline.
 */

export const typography = {
  fontSize: {
    xs: { px: 12, rem: '0.75rem' },
    sm: { px: 14, rem: '0.875rem' },
    base: { px: 16, rem: '1rem' },
    lg: { px: 18, rem: '1.125rem' },
    xl: { px: 20, rem: '1.25rem' },
    '2xl': { px: 24, rem: '1.5rem' },
    '3xl': { px: 30, rem: '1.875rem' },
    '4xl': { px: 36, rem: '2.25rem' },
  },

  fontWeight: {
    regular: { value: 400, css: '400' },
    medium: { value: 500, css: '500' },
    semibold: { value: 600, css: '600' },
    bold: { value: 700, css: '700' },
  },

  lineHeight: {
    tight: 1.1,
    snug: 1.25,
    normal: 1.5,
    relaxed: 1.625,
  },

  fontFamily: {
    sans: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
} as const;

export type Typography = typeof typography;
