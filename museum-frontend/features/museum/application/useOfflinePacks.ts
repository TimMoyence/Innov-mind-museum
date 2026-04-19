import { useCallback, useEffect, useState } from 'react';

import type { City, CityId } from '../infrastructure/cityCatalog';
import {
  type CityPackProgress,
  type CityPackSummary,
  offlinePackManager,
} from '../infrastructure/offlinePackManager';
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

const summaryToState = (summary: CityPackSummary): CityPackState =>
  summary.state === 'complete'
    ? { status: 'complete', bytesOnDisk: summary.bytesOnDisk }
    : { status: 'active', percentage: summary.percentage, bytesOnDisk: summary.bytesOnDisk };

const progressToState = (progress: CityPackProgress): CityPackState =>
  progress.state === 'complete'
    ? { status: 'complete', bytesOnDisk: progress.bytesOnDisk }
    : { status: 'active', percentage: progress.percentage, bytesOnDisk: progress.bytesOnDisk };

/**
 * Reads and mutates the offline-pack catalog for the city list. State is
 * keyed by cityId so the UI can render a row per city without having to
 * reconcile native pack ids. Progress updates from in-flight downloads are
 * wired through the same state so the settings screen re-renders on every
 * percentage tick.
 */
export const useOfflinePacks = (): UseOfflinePacksResult => {
  const [packsByCity, setPacksByCity] = useState<Record<CityId, CityPackState>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const summaries = await offlinePackManager.listPacks();
      const next: Record<CityId, CityPackState> = {};
      for (const summary of summaries) {
        next[summary.cityId] = summaryToState(summary);
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
              [progress.cityId]: progressToState(progress),
            }));
          },
        );
        await refresh();
      } catch (error) {
        // Revert optimistic state so the row shows as absent (retryable).
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
        // Native delete failed — re-sync so UI reflects actual storage state.
        await refresh();
        throw error;
      }
    },
    [refresh],
  );

  return { packsByCity, isLoading, refresh, download, remove };
};
