export type AppVariant = 'development' | 'preview' | 'production';

export interface BuildEnv {
  APP_VARIANT?: string;
  EAS_BUILD_PROFILE?: string;
  CONFIGURATION?: string;
  EXPO_PUBLIC_API_BASE_URL?: string;
}

export function resolveVariant(env: BuildEnv): AppVariant;

export function resolveApiBaseUrl(variant: AppVariant, env: BuildEnv): string;
