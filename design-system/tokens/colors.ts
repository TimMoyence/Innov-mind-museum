/**
 * Musaium Design System — Color Tokens (SSOT)
 *
 * This is the single source of truth for all colors across:
 * - museum-frontend (React Native / Expo)
 * - museum-web (Next.js / Tailwind 4)
 * - museum-admin (Vite / Tailwind 4)
 *
 * Run `node --import tsx design-system/build.ts` to regenerate platform outputs.
 */

export const colors = {
  primary: {
    50: '#EAF2FF',
    100: '#D8E8FF',
    200: '#B0CFFF',
    300: '#80B2FF',
    400: '#5090FF',
    500: '#2563EB',
    600: '#1D4ED8',
    700: '#1E40AF',
    800: '#1E3A8A',
    900: '#172554',
  },

  accent: {
    400: '#38BDF8',
    500: '#0EA5E9',
    600: '#0284C7',
  },

  gold: {
    400: '#D4A853',
    500: '#C49A3C',
    600: '#A67C2E',
  },

  text: {
    primary: '#0F172A',
    secondary: '#334155',
    tertiary: '#475569',
    muted: '#94A3B8',
    placeholder: '#64748B',
  },

  surface: {
    default: '#FFFFFF',
    elevated: '#F8FAFC',
    muted: '#F1F5F9',
  },

  status: {
    error: { light: '#991B1B', dark: '#FCA5A5' },
    errorBg: { light: 'rgba(254,242,242,0.82)', dark: 'rgba(127,29,29,0.4)' },
    success: { light: '#166534', dark: '#86EFAC' },
    successBg: { light: 'rgba(220,252,231,0.78)', dark: 'rgba(34,197,94,0.15)' },
    danger: { light: '#DC2626', dark: '#EF4444' },
    warning: { light: '#92400E', dark: '#FCD34D' },
    warningBg: { light: 'rgba(254,243,199,0.78)', dark: 'rgba(245,158,11,0.15)' },
  },

  dark: {
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
      tertiary: '#7C8CA2',
      muted: '#64748B',
      placeholder: '#64748B',
    },
    surface: {
      default: '#0F172A',
      elevated: '#1E293B',
      muted: '#334155',
    },
  },
} as const;

export type Colors = typeof colors;
