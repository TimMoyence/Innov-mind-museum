import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

type RuntimeEnv = {
  EXPO_PUBLIC_API_BASE_URL?: string;
  EXPO_PUBLIC_API_BASE_URL_STAGING?: string;
  EXPO_PUBLIC_API_BASE_URL_PROD?: string;
  EXPO_PUBLIC_EAS_PROJECT_ID?: string;
  EAS_PROJECT_ID?: string;
  EAS_BUILD_PROFILE?: string;
  APP_VARIANT?: string;
};

type ExpoExtra = {
  eas?: {
    projectId?: string;
  };
};

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

const resolveApiBaseUrl = (variant: AppVariant, env: RuntimeEnv): string => {
  const explicit = nonEmpty(env.EXPO_PUBLIC_API_BASE_URL);
  if (explicit) {
    return explicit;
  }

  if (variant === 'production') {
    return nonEmpty(env.EXPO_PUBLIC_API_BASE_URL_PROD) || 'http://localhost:3000';
  }

  return nonEmpty(env.EXPO_PUBLIC_API_BASE_URL_STAGING) || 'http://localhost:3000';
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env as RuntimeEnv;
  const variant = resolveVariant(env);
  const isProduction = variant === 'production';
  const configProjectId = nonEmpty((config.extra as ExpoExtra | undefined)?.eas?.projectId);
  const projectId =
    nonEmpty(env.EXPO_PUBLIC_EAS_PROJECT_ID) ||
    nonEmpty(env.EAS_PROJECT_ID) ||
    configProjectId;

  const appConfig: ExpoConfig = {
    ...config,
    name: isProduction ? 'MuseumIA' : 'MuseumIA Preview',
    slug: 'museum-ia',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'museumia',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    runtimeVersion: {
      policy: 'appVersion',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: isProduction
        ? 'com.museumia.mobile'
        : 'com.museumia.mobile.preview',
      infoPlist: {
        NSMicrophoneUsageDescription:
          'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
      },
    },
    android: {
      package: isProduction
        ? 'com.museumia.mobile'
        : 'com.museumia.mobile.preview',
      permissions: ['android.permission.RECORD_AUDIO'],
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/images/favicon.png',
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
      API_BASE_URL_STAGING: nonEmpty(env.EXPO_PUBLIC_API_BASE_URL_STAGING),
      API_BASE_URL_PRODUCTION: nonEmpty(env.EXPO_PUBLIC_API_BASE_URL_PROD),
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
