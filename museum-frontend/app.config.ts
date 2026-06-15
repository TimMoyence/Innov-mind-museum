import type { ConfigContext, ExpoConfig } from 'expo/config';

// `readEnvString` est inliné ici plutôt qu'importé depuis `shared/lib/env.ts` :
// `app.config.ts` est loadé par Expo CLI (Node.js require) qui (a) n'honore
// PAS l'alias TS `@/*` (Metro bundler le résout pour l'app, pas Expo prebuild),
// et (b) ne compile pas transitivement les modules TS imports — l'app.config
// elle-même est compilée mais ses imports `.ts` deviennent introuvables.
// Cf. CI mobile run 25987246319 (audit-s1 T1.9 refactor → prebuild fail).
// Pérein 10y : tout helper utilisé dans app.config DOIT être inliné ou
// re-exporté via un `.js` co-located. Le helper canonique reste dans
// `shared/lib/env.ts` pour le reste de l'app — voir doc là-bas.
const readEnvString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

type AppVariant = 'development' | 'preview' | 'production';
type ApiEnvironment = 'staging' | 'production';

interface RuntimeEnv {
  EXPO_PUBLIC_API_BASE_URL?: string;
  EXPO_PUBLIC_API_BASE_URL_STAGING?: string;
  EXPO_PUBLIC_API_BASE_URL_PROD?: string;
  EXPO_PUBLIC_API_ENVIRONMENT?: string;
  EAS_BUILD_PROFILE?: string;
  APP_VARIANT?: string;
}

interface ExpoExtra {
  eas?: {
    projectId?: string;
  };
}

const APP_NAME = 'Musaium';
const APP_SLUG = 'musaium';
const APP_SCHEME = 'musaium';
const APP_IOS_BUNDLE_ID = 'com.musaium.mobile';
const APP_IOS_BUNDLE_ID_PREVIEW = 'com.musaium.mobile.preview';
const APP_ANDROID_PACKAGE = 'com.musaium.mobile';
const APP_ANDROID_PACKAGE_PREVIEW = 'com.musaium.mobile.preview';
const BRAND_ICON =
  './assets/images/museum-ia/apple-devices/AppIcon.appiconset/icon-ios-1024x1024.png';
const BRAND_SPLASH_IMAGE = './assets/images/museum-ia/android/playstore-icon.png';
const BRAND_ANDROID_ADAPTIVE_FOREGROUND =
  './assets/images/museum-ia/android/mipmap-xxxhdpi/ic_launcher_foreground.png';
const BRAND_BACKGROUND_COLOR = '#1E1B19';

const nonEmpty = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : undefined;
};

const nonPlaceholder = (value?: string): string | undefined => {
  const normalized = nonEmpty(value);
  if (!normalized) {
    return undefined;
  }

  return normalized.startsWith('$') ? undefined : normalized;
};

/**
 * Shape of the co-located CommonJS build-time API-URL resolver module
 * (run 2026-06-06-api-url-prod-safety, design D1). It is `require`d (not
 * `import`ed) for the SAME reason `require('./package.json')` is below: Expo
 * CLI loads app.config.ts via Node `require`, which does NOT honor the `@/*`
 * alias nor transitively compile `.ts` imports (lib-docs/expo/LESSONS.md:34).
 * A plain `.js` sibling sidesteps that while keeping the prod-host constant +
 * resolvers in a single, unit-testable source of truth (spec R7).
 */
interface ApiUrlConfigModule {
  PROD_API_BASE_URL: string;
  resolveVariant: (env: RuntimeEnv) => AppVariant;
  resolveApiEnvironment: (variant: AppVariant, env: RuntimeEnv) => ApiEnvironment;
  resolveApiBaseUrl: (variant: AppVariant, env: RuntimeEnv) => string;
  isLocalhostUrl: (value: string) => boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo CLI Node require entry; app.config.ts cannot import the build-time resolvers as a TS module (no ESM/alias resolution at config-load time — lib-docs/expo/LESSONS.md:34). Justification: the resolvers MUST be a require-able .js so a Release/Archive build resolves the prod host without a TS compile step.
const apiUrlConfig = require('./api-url.config.js') as ApiUrlConfigModule;
const { resolveVariant, resolveApiEnvironment, resolveApiBaseUrl } = apiUrlConfig;

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env as RuntimeEnv;
  const variant = resolveVariant(env);
  const apiEnvironment = resolveApiEnvironment(variant, env);
  const configProjectId = nonEmpty((config.extra as ExpoExtra | undefined)?.eas?.projectId);
  const projectId = configProjectId;

  const appConfig: ExpoConfig = {
    ...config,
    name: APP_NAME,
    slug: APP_SLUG,
    // C4 A5 (2026-05-21) — single-source-of-truth: derive the published
    // Expo binary version from museum-frontend/package.json so a manual
    // literal bump cannot drift behind the npm manifest. `require()` is
    // licit here because Expo CLI loads app.config.ts via Node `require`
    // (cf. lib-docs/expo/LESSONS.md:34); ESM/import is not honoured.
    // Sentinel `scripts/sentinels/fe-version-sync.mjs` keeps the invariant.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo CLI Node require entry; no ESM import resolution available in app.config.ts
    version: (require('./package.json') as { version: string }).version,
    orientation: 'portrait',
    icon: BRAND_ICON,
    scheme: APP_SCHEME,
    userInterfaceStyle: 'automatic',
    runtimeVersion: '1.0.0',
    splash: {
      image: BRAND_SPLASH_IMAGE,
      resizeMode: 'contain',
      backgroundColor: BRAND_BACKGROUND_COLOR,
    },
    ios: {
      supportsTablet: true,
      icon: BRAND_ICON,
      bundleIdentifier: variant === 'production' ? APP_IOS_BUNDLE_ID : APP_IOS_BUNDLE_ID_PREVIEW,
      // TD-RNAV-01 — Universal Links. Production-only (spec R3 / design D3):
      // the entitlement is asserted per-bundle-id, and the preview bundle
      // (`com.musaium.mobile.preview`) is absent from the published AASA, so a
      // non-prod build claiming `applinks:musaium.com` would fail verification.
      associatedDomains: variant === 'production' ? ['applinks:musaium.com'] : undefined,
      buildNumber: '93',
      usesAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          'Musaium uses your camera so you can photograph artworks, monuments and museum exhibits — the captured image is sent to our AI assistant which identifies the piece and gives you historical and contextual information about it.',
        NSMicrophoneUsageDescription:
          'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
        NSPhotoLibraryUsageDescription:
          'Allow $(PRODUCT_NAME) to access your photo library to select artwork images for analysis.',
        NSPhotoLibraryAddUsageDescription:
          'Allow $(PRODUCT_NAME) to save images to your photo library.',
        NSFaceIDUsageDescription: 'Allow $(PRODUCT_NAME) to use Face ID to unlock the app.',
        NSLocationWhenInUseUsageDescription:
          'Musaium uses your location to find museums and cultural sites near you, show them on the map, and recommend nearby visits — your location is never tracked or shared with third parties.',
        // P3.3 — Transport security hardening.
        // Deny arbitrary cleartext loads at all times; require Certificate
        // Transparency for production builds so misissued certs for the API
        // domain are rejected by the OS at TLS handshake. Dev/preview keep
        // CT off to permit staging certs that may not be CT-logged.
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: variant === 'development',
          NSRequiresCertificateTransparency: variant === 'production',
        },
        // Background audio capability — required for TTS playback to continue
        // when the device locks or the app backgrounds. Backed by
        // `setAudioModeAsync({ shouldPlayInBackground: true })` in
        // `useTextToSpeech.ts` (Apple Forum #95216 — declaring without using
        // triggers App Store reject).
        UIBackgroundModes: ['audio'],
      },
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
            NSPrivacyAccessedAPITypeReasons: ['C617.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
            NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
            NSPrivacyAccessedAPITypeReasons: ['E174.1'],
          },
        ],
        NSPrivacyCollectedDataTypes: [
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeName',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhotosOrVideos',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeAudioData',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePreciseLocation',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
            NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
          },
        ],
      },
    },
    android: {
      package: variant === 'production' ? APP_ANDROID_PACKAGE : APP_ANDROID_PACKAGE_PREVIEW,
      // TD-RNAV-01 — App Links. Production-only (spec R3 / design D3): the
      // `autoVerify` VIEW filter delegates https://musaium.com to this package,
      // which is matched server-side by `public/.well-known/assetlinks.json`.
      // The preview package is not in assetlinks, so non-prod stays browser-open.
      intentFilters:
        variant === 'production'
          ? [
              {
                action: 'VIEW',
                autoVerify: true,
                data: [{ scheme: 'https', host: 'musaium.com' }],
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ]
          : undefined,
      versionCode: 93,
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
      ],
      adaptiveIcon: {
        foregroundImage: BRAND_ANDROID_ADAPTIVE_FOREGROUND,
        backgroundColor: BRAND_BACKGROUND_COLOR,
      },
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: BRAND_ICON,
    },
    plugins: [
      'expo-router',
      [
        'expo-build-properties',
        {
          android: {
            // P3.3 — Block plaintext HTTP at the OS network layer for all
            // non-dev variants. Dev keeps cleartext on so Metro/LAN backends
            // (http://10.0.x.x:3000) keep working; preview/internal/production
            // are HTTPS-only.
            usesCleartextTraffic: variant === 'development',
            blockedPermissions: [
              'android.permission.READ_EXTERNAL_STORAGE',
              'android.permission.WRITE_EXTERNAL_STORAGE',
              'com.google.android.gms.permission.AD_ID',
              'android.permission.SYSTEM_ALERT_WINDOW',
            ],
          },
          ios: {
            // RN 0.83.6 prebuilt React.framework tarball bakes RCTSwiftUI
            // symbols in, then the pod system rebuilds RCTSwiftUI locally
            // and statically links into Musaium.debug.dylib → ObjC runtime
            // "Class implemented in both" warnings at launch (29 symbols
            // duplicated). Building RN from source uses one canonical compile
            // path. +8-10 min on clean Xcode build, cached after.
            buildReactNativeFromSource: true,
            // P3.4 (TD-SSL-01) — Disable Expo dev-client iOS network inspector
            // because it interferes with `initializeSslPinning` setup on dev-client
            // builds (lib-docs/react-native-ssl-public-key-pinning/PATTERNS.md §5.3
            // lines 135-152). Production builds disable the inspector automatically ;
            // this opt-out only affects dev/preview.
            networkInspector: false,
          },
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow $(PRODUCT_NAME) to select artwork photos from your library.',
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission:
            'Musaium uses your camera so you can photograph artworks, monuments and museum exhibits — the captured image is sent to our AI assistant which identifies the piece and gives you historical and contextual information about it.',
          recordAudioAndroid: false,
        },
      ],
      [
        'expo-audio',
        {
          microphonePermission:
            'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Musaium uses your location to find museums and cultural sites near you, show them on the map, and recommend nearby visits — your location is never tracked or shared with third parties.',
        },
      ],
      'expo-apple-authentication',
      'expo-font',
      'expo-image',
      'expo-localization',
      'expo-secure-store',
      'expo-web-browser',
      [
        '@sentry/react-native/expo',
        {
          organization: readEnvString(process.env.SENTRY_ORG) ?? 'asili-design',
          project: readEnvString(process.env.SENTRY_PROJECT) ?? 'apple-ios',
        },
      ],
      ['./plugins/withNetworkSecurity', { variant }],
      './plugins/withFmtConstevalPatch',
      './plugins/withExpoModulesSwiftVersion',
      '@maplibre/maplibre-react-native',
      // Bumps `org.gradle.jvmargs` to -Xmx6144m to keep D8 dex-merge under
      // the new-architecture (Hermes V1, RN 0.83) heap pressure on CI runners.
      // Kept last so any earlier plugin that mutates gradle.properties cannot
      // overwrite the heap setting.
      './plugins/withGradleJvmHeap',
    ],
    experiments: {
      typedRoutes: true,
    },
    // OTA disabled intentionally — see docs/adr/ADR-009-ota-disabled.md.
    // Channel URL is kept configured so EAS Build metadata stays consistent;
    // runtime flag `enabled: false` ensures no OTA fetch at app start.
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
    },
    extra: {
      API_BASE_URL: resolveApiBaseUrl(variant, env),
      API_BASE_URL_STAGING: nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL_STAGING),
      API_BASE_URL_PRODUCTION: nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL_PROD),
      API_ENVIRONMENT: apiEnvironment,
      APP_VARIANT: variant,
      eas: projectId
        ? {
            projectId,
          }
        : undefined,
    },
  };

  return appConfig;
};
