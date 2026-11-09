
export const typography = {
  fontSize: {
    '2xs': { px: 9, rem: '0.5625rem' },
    'xs-': { px: 10, rem: '0.625rem' },
    xs: { px: 12, rem: '0.75rem' },
    'sm-': { px: 13, rem: '0.8125rem' },
    sm: { px: 14, rem: '0.875rem' },
    'base-': { px: 15, rem: '0.9375rem' },
    base: { px: 16, rem: '1rem' },
    'lg-': { px: 17, rem: '1.0625rem' },
    lg: { px: 18, rem: '1.125rem' },
    xl: { px: 20, rem: '1.25rem' },
    '2xl': { px: 24, rem: '1.5rem' },
    '2xl+': { px: 26, rem: '1.625rem' },
    '3xl': { px: 30, rem: '1.875rem' },
    '4xl': { px: 36, rem: '2.25rem' },
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
