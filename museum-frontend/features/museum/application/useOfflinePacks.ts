import { useCallback, useEffect, useState } from 'react';

import type { City, CityId } from '../infrastructure/cityCatalog';
import { type CityPackProgress, offlinePackManager } from '../infrastructure/offlinePackManager';
import { OFFLINE_STYLE_URL } from '../infrastructure/mapStyleUrl';

export type CityPackState =
  | { status: 'absent' }
  | { status: 'active'; percentage: number; bytesOnDisk: number }
  | { status: 'complete'; bytesOnDisk: number };

export interface UseOfflinePacksResult {
  packsByCity: Record<CityId, CityPackState>;
  isLoading: boolean;
  refresh: () => Promise<void>;
  download: (city: City) => Promise<void>;
  remove: (cityId: CityId) => Promise<void>;
}

const toPackState = (progress: CityPackProgress): CityPackState =>
  progress.state === 'complete'
    ? { status: 'complete', bytesOnDisk: progress.bytesOnDisk }
    : { status: 'active', percentage: progress.percentage, bytesOnDisk: progress.bytesOnDisk };

export const useOfflinePacks = (): UseOfflinePacksResult => {
  const [packsByCity, setPacksByCity] = useState<Record<CityId, CityPackState>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const summaries = await offlinePackManager.listPacks();
      const next: Record<CityId, CityPackState> = {};
      for (const summary of summaries) {
        next[summary.cityId] = toPackState(summary);
      }
      setPacksByCity(next);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = useCallback(
    async (city: City) => {
      setPacksByCity((current) => ({
        ...current,
        [city.id]: { status: 'active', percentage: 0, bytesOnDisk: 0 },
      }));
      try {
        await offlinePackManager.downloadPack(
          {
            cityId: city.id,
            bounds: city.bounds,
            mapStyleUrl: OFFLINE_STYLE_URL,
          },
          (progress) => {
            setPacksByCity((current) => ({
              ...current,
              [progress.cityId]: toPackState(progress),
            }));
          },
        );
        await refresh();
      } catch (error) {
        setPacksByCity((current) => {
          const { [city.id]: _removed, ...rest } = current;
          return rest;
        });
        throw error;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (cityId: CityId) => {
      setPacksByCity((current) => {
        const { [cityId]: _removed, ...rest } = current;
        return rest;
      });
      try {
        await offlinePackManager.deletePackByCity(cityId);
      } catch (error) {
        await refresh();
        throw error;
      }
    },
    [refresh],
  );

  return { packsByCity, isLoading, refresh, download, remove };
};
