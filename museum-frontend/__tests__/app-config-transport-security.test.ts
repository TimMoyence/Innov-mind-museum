/**
 * P3.3 — Mobile transport security shape tests.
 *
 * Asserts that the Expo config produced by `app.config.ts` denies cleartext
 * traffic for non-dev variants and requires Certificate Transparency on iOS
 * production builds. These rules must hold across all 3 variants the EAS
 * build pipeline targets:
 *   - development : LAN backends OK (cleartext allowed, CT off)
 *   - preview     : staging HTTPS, CT off (staging certs may not be CT-logged)
 *   - production  : HTTPS only, CT required
 */

import type { ExpoConfig, ConfigContext } from 'expo/config';
import appConfig from '../app.config';

type AppVariant = 'development' | 'preview' | 'production';

interface InfoPlistTransportSecurity {
  NSAllowsArbitraryLoads: boolean;
  NSAllowsLocalNetworking?: boolean;
  NSRequiresCertificateTransparency?: boolean;
}

interface IosInfoPlist {
  NSAppTransportSecurity?: InfoPlistTransportSecurity;
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

const getAtsBlock = (cfg: ExpoConfig): InfoPlistTransportSecurity | undefined => {
  const infoPlist = cfg.ios?.infoPlist as IosInfoPlist | undefined;
  return infoPlist?.NSAppTransportSecurity;
};

interface AndroidBuildPropertiesShape {
  android?: {
    usesCleartextTraffic?: boolean;
  };
}

const getAndroidBuildProps = (cfg: ExpoConfig): AndroidBuildPropertiesShape['android'] => {
  const plugin = (cfg.plugins ?? []).find(
    (p): p is [string, AndroidBuildPropertiesShape] =>
      Array.isArray(p) && p[0] === 'expo-build-properties',
  );
  return plugin?.[1].android;
};

describe('app.config.ts transport security (P3.3)', () => {
  describe('production variant', () => {
    const cfg = buildConfigForVariant('production');

    it('iOS denies arbitrary cleartext loads', () => {
      const ats = getAtsBlock(cfg);
      expect(ats).toBeDefined();
      expect(ats?.NSAllowsArbitraryLoads).toBe(false);
    });

    it('iOS requires Certificate Transparency', () => {
      expect(getAtsBlock(cfg)?.NSRequiresCertificateTransparency).toBe(true);
    });

    it('iOS does not allow local networking', () => {
      expect(getAtsBlock(cfg)?.NSAllowsLocalNetworking).toBe(false);
    });

    it('Android blocks cleartext traffic', () => {
      expect(getAndroidBuildProps(cfg)?.usesCleartextTraffic).toBe(false);
    });
  });

  describe('preview variant', () => {
    const cfg = buildConfigForVariant('preview');

    it('iOS still denies cleartext loads', () => {
      expect(getAtsBlock(cfg)?.NSAllowsArbitraryLoads).toBe(false);
    });

    it('iOS does not enforce CT (staging certs may not be CT-logged)', () => {
      expect(getAtsBlock(cfg)?.NSRequiresCertificateTransparency).toBe(false);
    });

    it('Android blocks cleartext traffic', () => {
      expect(getAndroidBuildProps(cfg)?.usesCleartextTraffic).toBe(false);
    });
  });

  describe('development variant', () => {
    const cfg = buildConfigForVariant('development');

    it('iOS still denies arbitrary cleartext loads (only local networking is exempt)', () => {
      expect(getAtsBlock(cfg)?.NSAllowsArbitraryLoads).toBe(false);
    });

    it('iOS allows local networking so Metro and LAN backends keep working', () => {
      expect(getAtsBlock(cfg)?.NSAllowsLocalNetworking).toBe(true);
    });

    it('iOS does not enforce CT in dev', () => {
      expect(getAtsBlock(cfg)?.NSRequiresCertificateTransparency).toBe(false);
    });

    it('Android allows cleartext for LAN backends (http://10.x.x.x:3000)', () => {
      expect(getAndroidBuildProps(cfg)?.usesCleartextTraffic).toBe(true);
    });
  });
});
