import { renderHook } from '@testing-library/react-native';

import { lightTheme, darkTheme, type ThemePalette } from '@/shared/ui/themes';
import { makeMuseumBranding } from '../../helpers/factories';
import type { MuseumBranding } from '@/features/museum/domain/museum-branding';

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
    const branding = makeMuseumBranding({ primaryColor: '#6B46C1' });
    const { result } = renderHook(() => useBrandedTheme(lightTheme, branding));
    expect(result.current.primaryContrast).toBe('#FFFFFF');
  });

  it('uses black contrast text on a light brand primary', () => {
    const branding = makeMuseumBranding({ primaryColor: '#FFEB3B' });
    const { result } = renderHook(() => useBrandedTheme(lightTheme, branding));
    expect(result.current.primaryContrast).toBe('#000000');
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
    expect(Object.keys(result.current).sort()).toEqual(Object.keys(lightTheme).sort());
  });
});
