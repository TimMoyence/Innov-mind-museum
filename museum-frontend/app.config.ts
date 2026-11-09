import packageJson from './package.json';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import { resolveApiBaseUrl, resolveVariant, type BuildEnv } from './api-url.config';

const readEnvString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

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

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env as BuildEnv;
  const variant = resolveVariant(env);
  const configProjectId = nonEmpty((config.extra as ExpoExtra | undefined)?.eas?.projectId);
  const projectId = configProjectId;

  const appConfig: ExpoConfig = {
    ...config,
    name: APP_NAME,
    slug: APP_SLUG,
    version: packageJson.version,
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
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: variant === 'development',
          NSRequiresCertificateTransparency: variant === 'production',
        },
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
            usesCleartextTraffic: variant === 'development',
            blockedPermissions: [
              'android.permission.READ_EXTERNAL_STORAGE',
              'android.permission.WRITE_EXTERNAL_STORAGE',
              'com.google.android.gms.permission.AD_ID',
              'android.permission.SYSTEM_ALERT_WINDOW',
            ],
          },
          ios: {
            buildReactNativeFromSource: true,
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
      '@maplibre/maplibre-react-native',
      './plugins/withGradleJvmHeap',
    ],
    experiments: {
      typedRoutes: true,
    },
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
    },
    extra: {
      API_BASE_URL: resolveApiBaseUrl(variant, env),
      eas: projectId
        ? {
            projectId,
          }
        : undefined,
    },
  };

  return appConfig;
};
