import { storage } from '@/shared/infrastructure/storage';
import { migrateStorageKey } from '@/shared/infrastructure/migrateStorageKey';

export {
  defaults,
  normalizeGuideLevel,
  type GuideLevel,
  type RuntimeSettings,
} from './runtimeSettings.pure';
import {
  defaults,
  normalizeGuideLevel,
  type GuideLevel,
  type RuntimeSettings,
} from './runtimeSettings.pure';

const DEFAULT_LOCALE_KEY = 'musaium.runtime.defaultLocale';
const DEFAULT_MUSEUM_MODE_KEY = 'musaium.runtime.defaultMuseumMode';
const GUIDE_LEVEL_KEY = 'musaium.runtime.guideLevel';

// Pre-namespacing keys migrated forward once before each read (TD-AS-01).
const LEGACY_DEFAULT_LOCALE_KEY = 'runtime.defaultLocale';
const LEGACY_DEFAULT_MUSEUM_MODE_KEY = 'runtime.defaultMuseumMode';
const LEGACY_GUIDE_LEVEL_KEY = 'runtime.guideLevel';

export const loadRuntimeSettings = async (): Promise<RuntimeSettings> => {
  await Promise.all([
    migrateStorageKey(DEFAULT_LOCALE_KEY, LEGACY_DEFAULT_LOCALE_KEY),
    migrateStorageKey(DEFAULT_MUSEUM_MODE_KEY, LEGACY_DEFAULT_MUSEUM_MODE_KEY),
    migrateStorageKey(GUIDE_LEVEL_KEY, LEGACY_GUIDE_LEVEL_KEY),
  ]);

  const [defaultLocale, defaultMuseumMode, guideLevel] = await Promise.all([
    storage.getItem(DEFAULT_LOCALE_KEY),
    storage.getItem(DEFAULT_MUSEUM_MODE_KEY),
    storage.getItem(GUIDE_LEVEL_KEY),
  ]);

  return {
    defaultLocale: defaultLocale ?? defaults.defaultLocale,
    defaultMuseumMode:
      defaultMuseumMode === null ? defaults.defaultMuseumMode : defaultMuseumMode === 'true',
    guideLevel: normalizeGuideLevel(guideLevel),
  };
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
