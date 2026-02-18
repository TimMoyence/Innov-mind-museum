import { storage } from '@/shared/infrastructure/storage';

const DEFAULT_LOCALE_KEY = 'runtime.defaultLocale';
const DEFAULT_MUSEUM_MODE_KEY = 'runtime.defaultMuseumMode';
const GUIDE_LEVEL_KEY = 'runtime.guideLevel';

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

export const loadRuntimeSettings = async (): Promise<RuntimeSettings> => {
  const [defaultLocale, defaultMuseumMode, guideLevel] = await Promise.all([
    storage.getItem(DEFAULT_LOCALE_KEY),
    storage.getItem(DEFAULT_MUSEUM_MODE_KEY),
    storage.getItem(GUIDE_LEVEL_KEY),
  ]);

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
  return loadRuntimeSettings();
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
