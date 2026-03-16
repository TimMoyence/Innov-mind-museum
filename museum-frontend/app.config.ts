import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

type RuntimeEnv = {
  EXPO_PUBLIC_API_BASE_URL?: string;
  EXPO_PUBLIC_API_BASE_URL_STAGING?: string;
  EXPO_PUBLIC_API_BASE_URL_PROD?: string;
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
const BRAND_ICON = './assets/images/museum-ia/apple-devices/AppIcon.appiconset/icon-ios-1024x1024.png';
const BRAND_SPLASH_IMAGE = './assets/images/museum-ia/android/playstore-icon.png';
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

const resolveApiBaseUrl = (variant: AppVariant, env: RuntimeEnv): string => {
  const explicit = nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL);
  const staging = nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL_STAGING);
  const production = nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL_PROD);

  if (variant === 'production') {
    return production || explicit || 'http://localhost:3000';
  }

  if (variant === 'preview') {
    return staging || explicit || 'http://localhost:3000';
  }

  return explicit || staging || production || 'http://localhost:3000';
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env as RuntimeEnv;
  const variant = resolveVariant(env);
  const configProjectId = nonEmpty((config.extra as ExpoExtra | undefined)?.eas?.projectId);
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
        variant === 'production' ? APP_IOS_BUNDLE_ID : APP_IOS_BUNDLE_ID_PREVIEW,
      infoPlist: {
        NSMicrophoneUsageDescription:
          'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
      },
    },
    android: {
      package:
        variant === 'production'
          ? APP_ANDROID_PACKAGE
          : APP_ANDROID_PACKAGE_PREVIEW,
      permissions: ['android.permission.RECORD_AUDIO'],
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
          photosPermission: 'Allow $(PRODUCT_NAME) to access your photos',
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
      API_BASE_URL_STAGING: nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL_STAGING),
      API_BASE_URL_PRODUCTION: nonPlaceholder(env.EXPO_PUBLIC_API_BASE_URL_PROD),
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
