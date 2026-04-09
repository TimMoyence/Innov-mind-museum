/**
 * Musaium Design System — Typography Tokens (SSOT)
 *
 * Font sizes in px (React Native) and rem (web).
 * 1rem = 16px baseline.
 */

export const typography = {
  fontSize: {
    /** 9px — micro text */
    '2xs': { px: 9, rem: '0.5625rem' },
    /** 10px — small caption */
    'xs-': { px: 10, rem: '0.625rem' },
    xs: { px: 12, rem: '0.75rem' },
    /** 13px — form labels */
    'sm-': { px: 13, rem: '0.8125rem' },
    sm: { px: 14, rem: '0.875rem' },
    /** 15px — comfortable body */
    'base-': { px: 15, rem: '0.9375rem' },
    base: { px: 16, rem: '1rem' },
    /** 17px — emphasized body */
    'lg-': { px: 17, rem: '1.0625rem' },
    lg: { px: 18, rem: '1.125rem' },
    xl: { px: 20, rem: '1.25rem' },
    '2xl': { px: 24, rem: '1.5rem' },
    /** 26px — sub-hero heading */
    '2xl+': { px: 26, rem: '1.625rem' },
    '3xl': { px: 30, rem: '1.875rem' },
    '4xl': { px: 36, rem: '2.25rem' },
    /** 48px — display/emoji */
    '5xl': { px: 48, rem: '3rem' },
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

  /** Absolute line heights in px (React Native) — for cases where relative values don't apply */
  lineHeightPx: {
    '18': { px: 18, rem: '1.125rem' },
    '19': { px: 19, rem: '1.1875rem' },
    '21': { px: 21, rem: '1.3125rem' },
    '22': { px: 22, rem: '1.375rem' },
  },

  fontFamily: {
    sans: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
} as const;

export type Typography = typeof typography;
