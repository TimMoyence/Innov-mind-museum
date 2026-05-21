/**
 * TD-RNAV-01 — Universal Links (iOS) + App Links (Android) config-eval tests.
 *
 * Asserts that the Expo config produced by `app.config.ts`:
 *   - production : declares `ios.associatedDomains = ['applinks:musaium.com']`
 *                  and an Android `VIEW` intent filter (autoVerify) for
 *                  https://musaium.com with BROWSABLE + DEFAULT categories.
 *   - preview / development : carry NEITHER the associatedDomain NOR the
 *                  https/musaium.com VIEW intent filter (association is
 *                  prod-only, spec R3 / design D3).
 *   - all variants : keep `scheme: 'musaium'` unchanged (spec R4 regression).
 *
 * Runner: Jest (`test:rn`, preset `jest-expo`). Mirrors the helper shape of
 * `app-config-transport-security.test.ts` (env save/restore in `finally`).
 */

import type { ExpoConfig, ConfigContext } from 'expo/config';
import appConfig from '../app.config';

type AppVariant = 'development' | 'preview' | 'production';

interface AndroidIntentFilterData {
  scheme?: string;
  host?: string;
}

interface AndroidIntentFilter {
  action?: string;
  autoVerify?: boolean;
  data?: AndroidIntentFilterData | AndroidIntentFilterData[];
  category?: string[];
}

const ctx = { config: {} } as unknown as ConfigContext;

const buildConfigForVariant = (variant: AppVariant): ExpoConfig => {
  const original = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    return appConfig(ctx);
  } finally {
    if (original === undefined) {
      delete process.env.APP_VARIANT;
    } else {
      process.env.APP_VARIANT = original;
    }
  }
};

const getIntentFilters = (cfg: ExpoConfig): AndroidIntentFilter[] => {
  const filters = cfg.android?.intentFilters as AndroidIntentFilter[] | undefined;
  return Array.isArray(filters) ? filters : [];
};

const asDataArray = (
  data: AndroidIntentFilterData | AndroidIntentFilterData[] | undefined,
): AndroidIntentFilterData[] => {
  if (Array.isArray(data)) {
    return data;
  }
  return data ? [data] : [];
};

const hasHttpsMusaiumViewFilter = (cfg: ExpoConfig): boolean =>
  getIntentFilters(cfg).some(
    (filter) =>
      filter.action === 'VIEW' &&
      asDataArray(filter.data).some(
        (entry) => entry.scheme === 'https' && entry.host === 'musaium.com',
      ),
  );

describe('app.config.ts universal links / app links (TD-RNAV-01)', () => {
  describe('production variant', () => {
    const cfg = buildConfigForVariant('production');

    it('iOS declares the applinks:musaium.com associated domain (R1)', () => {
      expect(cfg.ios?.associatedDomains).toBeDefined();
      expect(cfg.ios?.associatedDomains).toContain('applinks:musaium.com');
    });

    it('Android declares an autoVerify VIEW intent filter for https://musaium.com (R2)', () => {
      const filter = getIntentFilters(cfg).find(
        (entry) =>
          entry.action === 'VIEW' &&
          asDataArray(entry.data).some(
            (data) => data.scheme === 'https' && data.host === 'musaium.com',
          ),
      );

      expect(filter).toBeDefined();
      expect(filter?.autoVerify).toBe(true);
      expect(filter?.category).toContain('BROWSABLE');
      expect(filter?.category).toContain('DEFAULT');
    });

    it('keeps the custom scheme "musaium" (R4)', () => {
      expect(cfg.scheme).toBe('musaium');
    });
  });

  describe('preview variant', () => {
    const cfg = buildConfigForVariant('preview');

    it('does NOT declare applinks:musaium.com (R3, prod-only)', () => {
      const domains = cfg.ios?.associatedDomains;
      expect(!domains?.includes('applinks:musaium.com')).toBe(true);
    });

    it('has no https/musaium.com VIEW intent filter (R3, prod-only)', () => {
      expect(hasHttpsMusaiumViewFilter(cfg)).toBe(false);
    });

    it('keeps the custom scheme "musaium" (R4)', () => {
      expect(cfg.scheme).toBe('musaium');
    });
  });

  describe('development variant', () => {
    const cfg = buildConfigForVariant('development');

    it('does NOT declare applinks:musaium.com (R3, prod-only)', () => {
      const domains = cfg.ios?.associatedDomains;
      expect(!domains?.includes('applinks:musaium.com')).toBe(true);
    });

    it('has no https/musaium.com VIEW intent filter (R3, prod-only)', () => {
      expect(hasHttpsMusaiumViewFilter(cfg)).toBe(false);
    });

    it('keeps the custom scheme "musaium" (R4)', () => {
      expect(cfg.scheme).toBe('musaium');
    });
  });
});
