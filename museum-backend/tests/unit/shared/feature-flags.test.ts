import { StaticFeatureFlagService } from '@shared/feature-flags/feature-flags.port';

describe('StaticFeatureFlagService', () => {
  it('returns false for unknown flags', () => {
    const svc = new StaticFeatureFlagService({});
    expect(svc.isEnabled('nonexistent')).toBe(false);
  });

  it('parses FEATURE_FLAG_* env vars', () => {
    const svc = new StaticFeatureFlagService({
      FEATURE_FLAG_VOICE_MODE: 'true',
      FEATURE_FLAG_OCR_GUARD: '1',
      FEATURE_FLAG_API_KEYS: 'false',
      UNRELATED_VAR: 'true',
    });
    expect(svc.isEnabled('voice-mode')).toBe(true);
    expect(svc.isEnabled('ocr-guard')).toBe(true);
    expect(svc.isEnabled('api-keys')).toBe(false);
    expect(svc.isEnabled('unrelated-var')).toBe(false);
  });

  it('handles empty env', () => {
    const svc = new StaticFeatureFlagService({});
    expect(svc.isEnabled('voice-mode')).toBe(false);
  });

  it('uses process.env when no argument is provided', () => {
    const svc = new StaticFeatureFlagService();
    // Should not throw and return false for unknown flags
    expect(svc.isEnabled('some-random-flag')).toBe(false);
  });
});
