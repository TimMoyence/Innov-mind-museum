import { viewportConfig, museumBackgrounds } from '@/shared/ui/liquidTheme';

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

  it('each background has mobile and desktop sources', () => {
    for (const bg of museumBackgrounds) {
      expect(bg.mobile).toBeDefined();
      expect(bg.desktop).toBeDefined();
    }
  });
});
