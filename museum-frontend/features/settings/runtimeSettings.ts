import { storage } from '@/shared/infrastructure/storage';
import { migrateStorageKey } from '@/shared/infrastructure/migrateStorageKey';

export {
  defaults,
  normalizeGuideLevel,
  type GuideLevel,
  type RuntimeSettings,
} from './runtimeSettings.pure';
import { defaults, normalizeGuideLevel, type RuntimeSettings } from './runtimeSettings.pure';

const DEFAULT_MUSEUM_MODE_KEY = 'musaium.runtime.defaultMuseumMode';
const GUIDE_LEVEL_KEY = 'musaium.runtime.guideLevel';

const LEGACY_DEFAULT_MUSEUM_MODE_KEY = 'runtime.defaultMuseumMode';
const LEGACY_GUIDE_LEVEL_KEY = 'runtime.guideLevel';

export const loadRuntimeSettings = async (): Promise<RuntimeSettings> => {
  await Promise.all([
    migrateStorageKey(DEFAULT_MUSEUM_MODE_KEY, LEGACY_DEFAULT_MUSEUM_MODE_KEY),
    migrateStorageKey(GUIDE_LEVEL_KEY, LEGACY_GUIDE_LEVEL_KEY),
  ]);

  const [defaultMuseumMode, guideLevel] = await Promise.all([
    storage.getItem(DEFAULT_MUSEUM_MODE_KEY),
    storage.getItem(GUIDE_LEVEL_KEY),
  ]);

  return {
    defaultMuseumMode:
      defaultMuseumMode === null ? defaults.defaultMuseumMode : defaultMuseumMode === 'true',
    guideLevel: normalizeGuideLevel(guideLevel),
  };
};
