import {
  viewportConfig,
  museumBackgrounds,
  pickMuseumBackground,
  themeColors,
  liquidColors,
} from '@/shared/ui/liquidTheme';
import { lightTheme } from '@/shared/ui/themes';

describe('viewportConfig', () => {
  it('has expected desktop breakpoint', () => {
    expect(viewportConfig.desktopBreakpoint).toBe(1024);
  });

  it('has mobile and desktop opacity values', () => {
    expect(viewportConfig.mobileBackgroundOpacity).toBeGreaterThan(0);
    expect(viewportConfig.desktopBackgroundOpacity).toBeGreaterThan(0);
  });

  it('has resize modes', () => {
    expect(viewportConfig.mobileResizeMode).toBe('cover');
    expect(viewportConfig.desktopResizeMode).toBe('contain');
  });
});

describe('museumBackgrounds', () => {
  it('has at least one background pair', () => {
    expect(museumBackgrounds.length).toBeGreaterThan(0);
  });
});

describe('pickMuseumBackground', () => {
  it('returns the correct background by index', () => {
    const bg = pickMuseumBackground(0);
    expect(bg).toBe(museumBackgrounds[0]);
  });

  it('wraps around for indices beyond array length', () => {
    const length = museumBackgrounds.length;
    const bg = pickMuseumBackground(length);
    expect(bg).toBe(museumBackgrounds[0]);
  });

  it('handles negative indices by wrapping', () => {
    const length = museumBackgrounds.length;
    const bg = pickMuseumBackground(-1);
    expect(bg).toBe(museumBackgrounds[length - 1]);
  });

  it('handles large indices', () => {
    const length = museumBackgrounds.length;
    const bg = pickMuseumBackground(length * 3 + 2);
    expect(bg).toBe(museumBackgrounds[2]);
  });
});

describe('themeColors', () => {
  it('extracts correct color tokens from a theme', () => {
    const colors = themeColors(lightTheme);
    expect(colors.pageGradient).toBe(lightTheme.pageGradient);
    expect(colors.primary).toBe(lightTheme.primary);
    expect(colors.textPrimary).toBe(lightTheme.textPrimary);
    expect(colors.textSecondary).toBe(lightTheme.textSecondary);
    expect(colors.glassBorder).toBe(lightTheme.glassBorder);
    expect(colors.glassBackground).toBe(lightTheme.glassBackground);
  });
});

describe('liquidColors', () => {
  it('is derived from lightTheme', () => {
    expect(liquidColors.primary).toBe(lightTheme.primary);
    expect(liquidColors.pageGradient).toBe(lightTheme.pageGradient);
  });
});
