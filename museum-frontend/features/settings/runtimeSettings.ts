import { resolveInitialApiBaseUrl } from '@/shared/infrastructure/apiConfig';
import { setApiBaseUrl } from '@/shared/infrastructure/httpClient';
import { storage } from '@/shared/infrastructure/storage';

export {
  defaults,
  normalizeGuideLevel,
  type GuideLevel,
  type RuntimeSettings,
} from './runtimeSettings.pure';
import { defaults, normalizeGuideLevel, type GuideLevel, type RuntimeSettings } from './runtimeSettings.pure';

const DEFAULT_LOCALE_KEY = 'runtime.defaultLocale';
const DEFAULT_MUSEUM_MODE_KEY = 'runtime.defaultMuseumMode';
const GUIDE_LEVEL_KEY = 'runtime.guideLevel';

// Legacy keys kept for migration cleanup only. Environment is now build-driven.
const API_BASE_URL_KEY = 'runtime.apiBaseUrl';
const API_ENVIRONMENT_KEY = 'runtime.apiEnvironment';

const cleanupLegacyApiOverrideKeys = async (
  apiBaseUrl: string | null,
  apiEnvironment: string | null,
): Promise<void> => {
  if (apiBaseUrl === null && apiEnvironment === null) {
    return;
  }

  await Promise.all([
    storage.removeItem(API_BASE_URL_KEY).catch(() => undefined),
    storage.removeItem(API_ENVIRONMENT_KEY).catch(() => undefined),
  ]);
};

/**
 * Loads persisted runtime settings from AsyncStorage and cleans up legacy API override keys.
 * @returns Resolved {@link RuntimeSettings}, falling back to defaults for missing values.
 */
export const loadRuntimeSettings = async (): Promise<RuntimeSettings> => {
  const [defaultLocale, defaultMuseumMode, guideLevel, apiBaseUrl, apiEnvironment] =
    await Promise.all([
      storage.getItem(DEFAULT_LOCALE_KEY),
      storage.getItem(DEFAULT_MUSEUM_MODE_KEY),
      storage.getItem(GUIDE_LEVEL_KEY),
      storage.getItem(API_BASE_URL_KEY),
      storage.getItem(API_ENVIRONMENT_KEY),
    ]);

  await cleanupLegacyApiOverrideKeys(apiBaseUrl, apiEnvironment);

  return {
    defaultLocale: defaultLocale ?? defaults.defaultLocale,
    defaultMuseumMode:
      defaultMuseumMode === null
        ? defaults.defaultMuseumMode
        : defaultMuseumMode === 'true',
    guideLevel: normalizeGuideLevel(guideLevel),
  };
};

/**
 * Loads runtime settings and applies the resolved API base URL to the HTTP client.
 * @returns The loaded {@link RuntimeSettings}.
 */
export const applyRuntimeSettings = async (): Promise<RuntimeSettings> => {
  const settings = await loadRuntimeSettings();
  setApiBaseUrl(resolveInitialApiBaseUrl());
  return settings;
};

/**
 * Persists the user's preferred locale.
 * @param value - BCP-47 locale string (e.g. `'fr-FR'`).
 */
export const saveDefaultLocale = async (value: string): Promise<void> => {
  await storage.setItem(DEFAULT_LOCALE_KEY, value.trim() || defaults.defaultLocale);
};

/**
 * Persists the user's default museum mode preference.
 * @param value - `true` for guided museum mode, `false` for standard.
 */
export const saveDefaultMuseumMode = async (value: boolean): Promise<void> => {
  await storage.setItem(DEFAULT_MUSEUM_MODE_KEY, String(value));
};

/**
 * Persists the user's preferred guide expertise level.
 * @param value - One of `'beginner'`, `'intermediate'`, or `'expert'`.
 */
export const saveGuideLevel = async (value: GuideLevel): Promise<void> => {
  await storage.setItem(GUIDE_LEVEL_KEY, value);
};
