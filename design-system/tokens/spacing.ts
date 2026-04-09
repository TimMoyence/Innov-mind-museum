/**
 * Musaium Design System — Spacing & Radius Tokens (SSOT)
 *
 * Spacing values based on a 4px base unit, derived from actual usage
 * across museum-frontend components. Maps to Tailwind's scale for web.
 */

export const spacing = {
  /** 2px — micro gap */
  '0.5': { px: 2, rem: '0.125rem' },
  /** 4px — tight gap, small margin */
  '1': { px: 4, rem: '0.25rem' },
  /** 6px — compact gap */
  '1.5': { px: 6, rem: '0.375rem' },
  /** 8px — standard gap, common padding */
  '2': { px: 8, rem: '0.5rem' },
  /** 10px — comfortable gap */
  '2.5': { px: 10, rem: '0.625rem' },
  /** 12px — standard padding */
  '3': { px: 12, rem: '0.75rem' },
  /** 14px — comfortable padding */
  '3.5': { px: 14, rem: '0.875rem' },
  /** 16px — section padding */
  '4': { px: 16, rem: '1rem' },
  /** 20px — generous padding */
  '5': { px: 20, rem: '1.25rem' },
  /** 24px — large spacing */
  '6': { px: 24, rem: '1.5rem' },
  /** 28px */
  '7': { px: 28, rem: '1.75rem' },
  /** 32px — section margin */
  '8': { px: 32, rem: '2rem' },
  /** 40px — large section gap */
  '10': { px: 40, rem: '2.5rem' },
  /** 48px */
  '12': { px: 48, rem: '3rem' },
  /** 64px — page-level spacing */
  '16': { px: 64, rem: '4rem' },
  /** 18px — comfortable padding */
  '4.5': { px: 18, rem: '1.125rem' },
  /** 22px — generous padding */
  '5.5': { px: 22, rem: '1.375rem' },
  /** 34px — title line height */
  '8.5': { px: 34, rem: '2.125rem' },
  /** 36px — large element */
  '9': { px: 36, rem: '2.25rem' },
  /** 50px — button height (Apple login) */
  '12.5': { px: 50, rem: '3.125rem' },
  /** 56px — nav height */
  '14': { px: 56, rem: '3.5rem' },
  /** 72px — hero spacing */
  '18': { px: 72, rem: '4.5rem' },
  /** 80px — page spacing */
  '20': { px: 80, rem: '5rem' },
  /** 96px — large page spacing */
  '24': { px: 96, rem: '6rem' },
} as const;

export const radii = {
  /** 4px — subtle rounding */
  xs: { px: 4, rem: '0.25rem' },
  /** 6px — small elements */
  sm: { px: 6, rem: '0.375rem' },
  /** 8px — buttons, inputs */
  md: { px: 8, rem: '0.5rem' },
  /** 10px — cards (compact) */
  DEFAULT: { px: 10, rem: '0.625rem' },
  /** 12px — primary card radius */
  lg: { px: 12, rem: '0.75rem' },
  /** 14px — large cards */
  xl: { px: 14, rem: '0.875rem' },
  /** 16px — modals */
  '2xl': { px: 16, rem: '1rem' },
  /** 20px — large containers */
  '3xl': { px: 20, rem: '1.25rem' },
  /** 24px — hero elements */
  '4xl': { px: 24, rem: '1.5rem' },
  /** 36px — large pill elements */
  '5xl': { px: 36, rem: '2.25rem' },
  /** 999px — pill shape */
  full: { px: 999, rem: '9999px' },
} as const;

export type Spacing = typeof spacing;
export type Radii = typeof radii;
