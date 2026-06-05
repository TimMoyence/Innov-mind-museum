/**
 * RED-2 — `useBrandedTheme(appTheme, branding)` (C4 co-branding,
 * run 2026-05-26-kr-product).
 *
 * Phase: RED (UFR-022). MUST FAIL — the hook
 * `features/museum/application/useBrandedTheme` does not exist yet.
 *
 * Asserts (spec-c4 R6/R7 + dispatcher override on contrast):
 *   - branded primaryColor overrides `theme.primary` + derived
 *     `primaryTint`/`primaryBorderSubtle`;
 *   - `primaryContrast` is the LUMINANCE-picked CTA text color (dispatcher
 *     override: EXIGÉ, not the app theme value) → black on light brand,
 *     white on dark brand;
 *   - all other palette fields (textPrimary, cardBackground, pageGradient)
 *     stay at app-theme values;
 *   - empty branding → identity (returns the unmodified app theme);
 *   - override applies on top of BOTH light and dark app themes;
 *   - secondary/accent are NEVER added to the palette (no channel — D2 override).
 *
 * lib-docs consulted: react-native/PATTERNS.md (renderHook from
 * @testing-library/react-native), react/PATTERNS.md (useMemo, purity).
 */

import { renderHook } from '@testing-library/react-native';

import { lightTheme, darkTheme, type ThemePalette } from '@/shared/ui/themes';
import { makeMuseumBranding } from '../../helpers/factories';
import type { MuseumBranding } from '@/features/museum/domain/museum-branding';

// Lazy require so the missing-module failure is a per-test RED, not an import
// crash that hides the assertions GREEN must satisfy.
const useBrandedTheme = (appTheme: ThemePalette, branding: MuseumBranding): ThemePalette => {
  const mod = require('@/features/museum/application/useBrandedTheme') as {
    useBrandedTheme: (appTheme: ThemePalette, branding: MuseumBranding) => ThemePalette;
  };
  return mod.useBrandedTheme(appTheme, branding);
};

describe('useBrandedTheme — branded override (R6)', () => {
  it('overrides primary + derived tint/border with the brand primaryColor', () => {
    const branding = makeMuseumBranding({ primaryColor: '#6B46C1' });
    const { result } = renderHook(() => useBrandedTheme(lightTheme, branding));

    expect(result.current.primary).toBe('#6B46C1');
    expect(result.current.primaryTint).toBe('#6B46C11A');
    expect(result.current.primaryBorderSubtle).toBe('#6B46C133');
  });

  it('leaves non-primary palette fields at the app-theme values', () => {
    const branding = makeMuseumBranding({ primaryColor: '#6B46C1' });
    const { result } = renderHook(() => useBrandedTheme(lightTheme, branding));

    expect(result.current.textPrimary).toBe(lightTheme.textPrimary);
    expect(result.current.cardBackground).toBe(lightTheme.cardBackground);
    expect(result.current.pageGradient).toEqual(lightTheme.pageGradient);
    expect(result.current.shadowColor).toBe(lightTheme.shadowColor);
  });
});

describe('useBrandedTheme — luminance contrast for CTA text (dispatcher override, EXIGÉ)', () => {
  it('uses black contrast text on a dark brand primary', () => {
    const branding = makeMuseumBranding({ primaryColor: '#6B46C1' }); // dark violet
    const { result } = renderHook(() => useBrandedTheme(lightTheme, branding));
    // Dark background → white CTA text.
    expect(result.current.primaryContrast).toBe('#FFFFFF');
  });

  it('uses black contrast text on a light brand primary', () => {
    const branding = makeMuseumBranding({ primaryColor: '#FFEB3B' }); // bright yellow
    const { result } = renderHook(() => useBrandedTheme(lightTheme, branding));
    // Light background → black CTA text (so the label stays legible — WCAG AA).
    expect(result.current.primaryContrast).toBe('#000000');
    // The override drives primaryContrast, so it must NOT equal the app theme's
    // default white contrast for a light brand color.
    expect(result.current.primaryContrast).not.toBe(lightTheme.primaryContrast);
  });
});

describe('useBrandedTheme — fallback (R7)', () => {
  it('returns the unmodified app theme when branding is empty', () => {
    const { result } = renderHook(() => useBrandedTheme(lightTheme, {}));
    expect(result.current).toEqual(lightTheme);
  });

  it('returns the unmodified app theme when primaryColor is absent', () => {
    const branding = makeMuseumBranding({ primaryColor: undefined });
    const { result } = renderHook(() => useBrandedTheme(lightTheme, branding));
    expect(result.current.primary).toBe(lightTheme.primary);
    expect(result.current.primaryContrast).toBe(lightTheme.primaryContrast);
  });
});

describe('useBrandedTheme — applies on top of light AND dark app themes', () => {
  it('preserves dark-theme non-primary fields while overriding primary', () => {
    const branding = makeMuseumBranding({ primaryColor: '#6B46C1' });
    const { result } = renderHook(() => useBrandedTheme(darkTheme, branding));

    expect(result.current.primary).toBe('#6B46C1');
    expect(result.current.textPrimary).toBe(darkTheme.textPrimary);
    expect(result.current.blurTint).toBe(darkTheme.blurTint);
  });
});

describe('useBrandedTheme — no secondary/accent channel (D2 override)', () => {
  it('does not add secondary/accent keys to the palette', () => {
    const branding = makeMuseumBranding({ primaryColor: '#6B46C1' });
    const { result } = renderHook(() => useBrandedTheme(lightTheme, branding));

    expect(result.current).not.toHaveProperty('secondary');
    expect(result.current).not.toHaveProperty('accent');
    // The palette key-set is exactly the app theme's key-set.
    expect(Object.keys(result.current).sort()).toEqual(Object.keys(lightTheme).sort());
  });
});
