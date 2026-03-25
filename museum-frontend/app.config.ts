import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';
type ApiEnvironment = 'staging' | 'production';

type RuntimeEnv = {
  EXPO_PUBLIC_API_BASE_URL?: string;
  EXPO_PUBLIC_API_BASE_URL_STAGING?: string;
  EXPO_PUBLIC_API_BASE_URL_PROD?: string;
  EXPO_PUBLIC_API_ENVIRONMENT?: string;
  EAS_BUILD_PROFILE?: string;
  APP_VARIANT?: string;
};

type ExpoExtra = {
  eas?: {
    projectId?: string;
  };
};

const APP_NAME = 'Musaium';
const APP_SLUG = 'musaium';
const APP_SCHEME = 'musaium';
const APP_IOS_BUNDLE_ID = 'com.musaium.mobile';
const APP_IOS_BUNDLE_ID_PREVIEW = 'com.musaium.mobile.preview';
const APP_ANDROID_PACKAGE = 'com.musaium.mobile';
const APP_ANDROID_PACKAGE_PREVIEW = 'com.musaium.mobile.preview';
const BRAND_ICON =
  './assets/images/museum-ia/apple-devices/AppIcon.appiconset/icon-ios-1024x1024.png';
const BRAND_SPLASH_IMAGE =
  './assets/images/museum-ia/android/playstore-icon.png';
const BRAND_ANDROID_ADAPTIVE_FOREGROUND =
  './assets/images/museum-ia/android/mipmap-xxxhdpi/ic_launcher_foreground.png';
const BRAND_BACKGROUND_COLOR = '#1E1B19';

const resolveVariant = (env: RuntimeEnv): AppVariant => {
  const raw = (
    env.APP_VARIANT ||
    env.EAS_BUILD_PROFILE ||
    'development'
  ).toLowerCase();

  if (raw === 'production') {
    return 'production';
  }

  if (raw === 'preview') {
    return 'preview';
  }

  return 'development';
};

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

const resolveApiEnvironment = (
  variant: AppVariant,
  env: RuntimeEnv,
): ApiEnvironment => {
  const explicit = nonPlaceholder(
    env.EXPO_PUBLIC_API_ENVIRONMENT,
  )?.toLowerCase();
  if (explicit === 'production') {
    return 'production';
  }

  if (explicit === 'staging') {
    return 'staging';
  }

  return variant === 'production' ? 'production' : 'staging';
};

const resolveApiBaseUrl = (variant: AppVariant, env: RuntimeEnv): string => {
  const explicit = nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL);
  const staging = nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL_STAGING);
  const production = nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL_PROD);
  const apiEnvironment = resolveApiEnvironment(variant, env);

  if (apiEnvironment === 'production') {
    return production || explicit || 'http://localhost:3000';
  }

  return explicit || staging || production || 'http://localhost:3000';
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env as RuntimeEnv;
  const variant = resolveVariant(env);
  const apiEnvironment = resolveApiEnvironment(variant, env);
  const configProjectId = nonEmpty(
    (config.extra as ExpoExtra | undefined)?.eas?.projectId,
  );
  const projectId = configProjectId;

  const appConfig: ExpoConfig = {
    ...config,
    name: APP_NAME,
    slug: APP_SLUG,
    version: '1.0.0',
    orientation: 'portrait',
    icon: BRAND_ICON,
    scheme: APP_SCHEME,
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    runtimeVersion: {
      policy: 'appVersion',
    },
    splash: {
      image: BRAND_SPLASH_IMAGE,
      resizeMode: 'contain',
      backgroundColor: BRAND_BACKGROUND_COLOR,
    },
    ios: {
      supportsTablet: true,
      icon: BRAND_ICON,
      bundleIdentifier:
        variant === 'production'
          ? APP_IOS_BUNDLE_ID
          : APP_IOS_BUNDLE_ID_PREVIEW,
      usesAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSMicrophoneUsageDescription:
          'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
        NSFaceIDUsageDescription:
          'Allow $(PRODUCT_NAME) to use Face ID to unlock the app.',
        NSLocationWhenInUseUsageDescription:
          'Allow Musaium to show museums near you.',
      },
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType:
              'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
        ],
        NSPrivacyCollectedDataTypes: [
          {
            NSPrivacyCollectedDataType:
              'NSPrivacyCollectedDataTypeEmailAddress',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType:
              'NSPrivacyCollectedDataTypeName',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType:
              'NSPrivacyCollectedDataTypePhotosOrVideos',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType:
              'NSPrivacyCollectedDataTypeAudioData',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType:
              'NSPrivacyCollectedDataTypePreciseLocation',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
          },
          {
            NSPrivacyCollectedDataType:
              'NSPrivacyCollectedDataTypeCrashData',
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAnalytics',
            ],
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
          },
        ],
      },
    },
    android: {
      package:
        variant === 'production'
          ? APP_ANDROID_PACKAGE
          : APP_ANDROID_PACKAGE_PREVIEW,
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
        'expo-image-picker',
        {
          photosPermission:
          'Allow $(PRODUCT_NAME) to select artwork photos from your library.',
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'Allow $(PRODUCT_NAME) to access your camera',
          recordAudioAndroid: false,
        },
      ],
      [
        'expo-av',
        {
          microphonePermission:
            'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Allow Musaium to find museums near your location.',
        },
      ],
      'expo-apple-authentication',
      [
        'expo-tracking-transparency',
        {
          userTrackingPermission:
            '$(PRODUCT_NAME) uses tracking to improve your museum experience with personalized artwork recommendations.',
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          // Derived from GOOGLE_IOS_CLIENT_ID — update if client ID changes
          iosUrlScheme:
            'com.googleusercontent.apps.498339023976-8r199kpqbqmhb7mdf45ostg3sutqeng2',
        },
      ],
      [
        '@sentry/react-native/expo',
        {
          organization: process.env.SENTRY_ORG || 'asili-design',
          project: process.env.SENTRY_PROJECT || 'apple-ios',
        },
      ],
    ],
    experiments: {
      typedRoutes: false,
    },
    updates: {
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
    },
    extra: {
      API_BASE_URL: resolveApiBaseUrl(variant, env),
      API_BASE_URL_STAGING: nonPlaceholder(
        env.EXPO_PUBLIC_API_BASE_URL_STAGING,
      ),
      API_BASE_URL_PRODUCTION: nonPlaceholder(
        env.EXPO_PUBLIC_API_BASE_URL_PROD,
      ),
      API_ENVIRONMENT: apiEnvironment,
      GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '498339023976-bjbain2ir2t9q4pu9lsmmk8ni7t96dd7.apps.googleusercontent.com',
      GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '498339023976-8r199kpqbqmhb7mdf45ostg3sutqeng2.apps.googleusercontent.com',
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
