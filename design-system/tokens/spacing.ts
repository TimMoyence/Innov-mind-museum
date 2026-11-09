
export const spacing = {
  '0.5': { px: 2, rem: '0.125rem' },
  '1': { px: 4, rem: '0.25rem' },
  '1.5': { px: 6, rem: '0.375rem' },
  '2': { px: 8, rem: '0.5rem' },
  '2.5': { px: 10, rem: '0.625rem' },
  '3': { px: 12, rem: '0.75rem' },
  '3.5': { px: 14, rem: '0.875rem' },
  '4': { px: 16, rem: '1rem' },
  '5': { px: 20, rem: '1.25rem' },
  '6': { px: 24, rem: '1.5rem' },
  '7': { px: 28, rem: '1.75rem' },
  '8': { px: 32, rem: '2rem' },
  '10': { px: 40, rem: '2.5rem' },
  '12': { px: 48, rem: '3rem' },
  '4.5': { px: 18, rem: '1.125rem' },
  '5.5': { px: 22, rem: '1.375rem' },
  '9': { px: 36, rem: '2.25rem' },
  '12.5': { px: 50, rem: '3.125rem' },
  '14': { px: 56, rem: '3.5rem' },
  '18': { px: 72, rem: '4.5rem' },
  '20': { px: 80, rem: '5rem' },
} as const;

export const radii = {
  xs: { px: 4, rem: '0.25rem' },
  sm: { px: 6, rem: '0.375rem' },
  md: { px: 8, rem: '0.5rem' },
  DEFAULT: { px: 10, rem: '0.625rem' },
  lg: { px: 12, rem: '0.75rem' },
  xl: { px: 14, rem: '0.875rem' },
  '2xl': { px: 16, rem: '1rem' },
  '3xl': { px: 20, rem: '1.25rem' },
  '4xl': { px: 24, rem: '1.5rem' },
  '5xl': { px: 36, rem: '2.25rem' },
  full: { px: 999, rem: '9999px' },
} as const;

export type Spacing = typeof spacing;
export type Radii = typeof radii;
