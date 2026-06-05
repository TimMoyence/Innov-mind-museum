import { useMemo } from 'react';

import type { ThemePalette } from '@/shared/ui/themes';

import { type MuseumBranding, pickContrastingTextColor } from '../domain/museum-branding';

/**
 * Returns a {@link ThemePalette} with the `primary` channel (plus the derived
 * `primaryTint` / `primaryBorderSubtle`) swapped to the museum's validated brand
 * `primaryColor`. The CTA text color (`primaryContrast`) is recomputed from the
 * brand color via WCAG luminance so a light operator brand keeps its label
 * legible (dispatcher override: EXIGÉ).
 *
 * When the museum has no valid `primaryColor` the unmodified app theme is
 * returned (R7 — identity, light/dark preserved). No `secondary` / `accent`
 * channel is added: `ThemePalette` has none and there are 0 consumers (D2),
 * so the key-set stays exactly the app theme's key-set.
 *
 * Memoised on `[appTheme, branding.primaryColor]` — re-derives only on a
 * light/dark flip or a brand-color change (react/PATTERNS.md:111 — purity +
 * stable identity contract the compiler can't infer from a literal spread).
 */
export const useBrandedTheme = (appTheme: ThemePalette, branding: MuseumBranding): ThemePalette => {
  const primaryColor = branding.primaryColor;

  return useMemo<ThemePalette>(() => {
    if (!primaryColor) {
      return appTheme;
    }

    return {
      ...appTheme,
      primary: primaryColor,
      primaryContrast: pickContrastingTextColor(primaryColor),
      primaryTint: `${primaryColor}1A`,
      primaryBorderSubtle: `${primaryColor}33`,
    };
  }, [appTheme, primaryColor]);
};
