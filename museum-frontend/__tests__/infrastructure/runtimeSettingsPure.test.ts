import { normalizeGuideLevel, defaults } from '@/features/settings/runtimeSettings.pure';

describe('normalizeGuideLevel', () => {
  it('passes through valid guide levels', () => {
    expect(normalizeGuideLevel('beginner')).toBe('beginner');
    expect(normalizeGuideLevel('intermediate')).toBe('intermediate');
    expect(normalizeGuideLevel('expert')).toBe('expert');
  });

  it('returns default for invalid string values', () => {
    expect(normalizeGuideLevel('advanced')).toBe('beginner');
    expect(normalizeGuideLevel('pro')).toBe('beginner');
    expect(normalizeGuideLevel('')).toBe('beginner');
  });

  it('returns default for null', () => {
    expect(normalizeGuideLevel(null)).toBe('beginner');
  });
});

describe('defaults', () => {
  it('has expected default values', () => {
    expect(defaults.defaultLocale).toBe('en-US');
    expect(defaults.defaultMuseumMode).toBe(true);
    expect(defaults.guideLevel).toBe('beginner');
  });
});
