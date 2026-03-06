import { resolveInitialApiBaseUrl } from '@/services/apiConfig';
import { setApiBaseUrl } from '@/shared/infrastructure/httpClient';
import { storage } from '@/shared/infrastructure/storage';

const DEFAULT_LOCALE_KEY = 'runtime.defaultLocale';
const DEFAULT_MUSEUM_MODE_KEY = 'runtime.defaultMuseumMode';
const GUIDE_LEVEL_KEY = 'runtime.guideLevel';

// Legacy keys kept for migration cleanup only. Environment is now build-driven.
const API_BASE_URL_KEY = 'runtime.apiBaseUrl';
const API_ENVIRONMENT_KEY = 'runtime.apiEnvironment';

export type GuideLevel = 'beginner' | 'intermediate' | 'expert';

export interface RuntimeSettings {
  defaultLocale: string;
  defaultMuseumMode: boolean;
  guideLevel: GuideLevel;
}

const defaults: RuntimeSettings = {
  defaultLocale: 'en-US',
  defaultMuseumMode: true,
  guideLevel: 'beginner',
};

const normalizeGuideLevel = (value: string | null): GuideLevel => {
  if (value === 'expert' || value === 'intermediate' || value === 'beginner') {
    return value;
  }
  return defaults.guideLevel;
};

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
    defaultLocale: defaultLocale || defaults.defaultLocale,
    defaultMuseumMode:
      defaultMuseumMode === null
        ? defaults.defaultMuseumMode
        : defaultMuseumMode === 'true',
    guideLevel: normalizeGuideLevel(guideLevel),
  };
};

export const applyRuntimeSettings = async (): Promise<RuntimeSettings> => {
  const settings = await loadRuntimeSettings();
  setApiBaseUrl(resolveInitialApiBaseUrl());
  return settings;
};

export const saveDefaultLocale = async (value: string): Promise<void> => {
  await storage.setItem(DEFAULT_LOCALE_KEY, value.trim() || defaults.defaultLocale);
};

export const saveDefaultMuseumMode = async (value: boolean): Promise<void> => {
  await storage.setItem(DEFAULT_MUSEUM_MODE_KEY, String(value));
};

export const saveGuideLevel = async (value: GuideLevel): Promise<void> => {
  await storage.setItem(GUIDE_LEVEL_KEY, value);
};
