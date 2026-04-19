import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';
type ApiEnvironment = 'staging' | 'production';

interface RuntimeEnv {
  EXPO_PUBLIC_API_BASE_URL?: string;
  EXPO_PUBLIC_API_BASE_URL_STAGING?: string;
  EXPO_PUBLIC_API_BASE_URL_PROD?: string;
  EXPO_PUBLIC_API_ENVIRONMENT?: string;
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
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
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '498339023976-bjbain2ir2t9q4pu9lsmmk8ni7t96dd7.apps.googleusercontent.com';
const DEFAULT_GOOGLE_IOS_CLIENT_ID =
  '498339023976-8r199kpqbqmhb7mdf45ostg3sutqeng2.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

const resolveVariant = (env: RuntimeEnv): AppVariant => {
  const raw = (env.APP_VARIANT ?? env.EAS_BUILD_PROFILE ?? 'development').toLowerCase();

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

const resolveApiEnvironment = (variant: AppVariant, env: RuntimeEnv): ApiEnvironment => {
  const explicit = nonPlaceholder(env.EXPO_PUBLIC_API_ENVIRONMENT)?.toLowerCase();
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
    return production ?? explicit ?? 'http://localhost:3000';
  }

  return explicit ?? staging ?? production ?? 'http://localhost:3000';
};

const resolveGoogleWebClientId = (env: RuntimeEnv): string => {
  return nonPlaceholder(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) ?? DEFAULT_GOOGLE_WEB_CLIENT_ID;
};

const resolveGoogleIosClientId = (env: RuntimeEnv): string => {
  const configured = nonPlaceholder(env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  if (!configured?.endsWith(GOOGLE_IOS_CLIENT_ID_SUFFIX)) {
    return DEFAULT_GOOGLE_IOS_CLIENT_ID;
  }

  return configured;
};

const deriveGoogleIosUrlScheme = (googleIosClientId: string): string => {
  const clientIdPrefix = googleIosClientId.slice(0, -GOOGLE_IOS_CLIENT_ID_SUFFIX.length);
  return `com.googleusercontent.apps.${clientIdPrefix}`;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env as RuntimeEnv;
  const variant = resolveVariant(env);
  const apiEnvironment = resolveApiEnvironment(variant, env);
  const configProjectId = nonEmpty((config.extra as ExpoExtra | undefined)?.eas?.projectId);
  const projectId = configProjectId;
  const googleWebClientId = resolveGoogleWebClientId(env);
  const googleIosClientId = resolveGoogleIosClientId(env);
  const googleIosUrlScheme = deriveGoogleIosUrlScheme(googleIosClientId);

  const appConfig: ExpoConfig = {
    ...config,
    name: APP_NAME,
    slug: APP_SLUG,
    version: '1.0.4',
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
            blockedPermissions: [
              'android.permission.READ_EXTERNAL_STORAGE',
              'android.permission.WRITE_EXTERNAL_STORAGE',
              'com.google.android.gms.permission.AD_ID',
              'android.permission.SYSTEM_ALERT_WINDOW',
            ],
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
      'expo-localization',
      'expo-secure-store',
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: googleIosUrlScheme,
        },
      ],
      [
        '@sentry/react-native/expo',
        {
          organization: String(process.env.SENTRY_ORG ?? 'asili-design'),
          project: String(process.env.SENTRY_PROJECT ?? 'apple-ios'),
        },
      ],
      ['./plugins/withNetworkSecurity', { variant }],
      './plugins/withFmtConstevalPatch',
      '@maplibre/maplibre-react-native',
    ],
    experiments: {
      typedRoutes: false,
    },
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
      GOOGLE_WEB_CLIENT_ID: googleWebClientId,
      GOOGLE_IOS_CLIENT_ID: googleIosClientId,
      GOOGLE_IOS_URL_SCHEME: googleIosUrlScheme,
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
