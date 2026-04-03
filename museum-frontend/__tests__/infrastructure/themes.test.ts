import { lightTheme, darkTheme } from '@/shared/ui/themes';

describe('lightTheme', () => {
  it('has required color properties', () => {
    expect(lightTheme.primary).toBeDefined();
    expect(lightTheme.textPrimary).toBeDefined();
    expect(lightTheme.cardBackground).toBeDefined();
    expect(lightTheme.pageGradient).toHaveLength(3);
  });

  it('has error colors', () => {
    expect(lightTheme.error).toBeDefined();
    expect(lightTheme.errorBackground).toBeDefined();
  });
});

describe('darkTheme', () => {
  it('has required color properties', () => {
    expect(darkTheme.primary).toBeDefined();
    expect(darkTheme.textPrimary).toBeDefined();
    expect(darkTheme.cardBackground).toBeDefined();
    expect(darkTheme.pageGradient).toHaveLength(3);
  });

  it('differs from light theme in key colors', () => {
    expect(darkTheme.textPrimary).not.toBe(lightTheme.textPrimary);
    expect(darkTheme.cardBackground).not.toBe(lightTheme.cardBackground);
  });
});
