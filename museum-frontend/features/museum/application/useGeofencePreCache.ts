import { useEffect, useRef } from 'react';

import { useAutoPreCachePreference } from '@/features/settings/application/useAutoPreCachePreference';
import { reportError } from '@/shared/observability/errorReporting';

import { type CityId, CITY_CATALOG } from '../infrastructure/cityCatalog';
import { OFFLINE_STYLE_URL } from '../infrastructure/mapStyleUrl';
import { offlinePackManager } from '../infrastructure/offlinePackManager';
import { haversineDistanceMeters } from './haversine';

const PRE_CACHE_TRIGGER_METERS = 500;

interface UseGeofencePreCacheOptions {
  latitude: number | null;
  longitude: number | null;
}

export const useGeofencePreCache = ({ latitude, longitude }: UseGeofencePreCacheOptions): void => {
  const { enabled } = useAutoPreCachePreference();
  const triggeredRef = useRef<Set<CityId>>(new Set());

  useEffect(() => {
    if (!enabled || latitude === null || longitude === null) return;

    const run = async () => {
      for (const city of CITY_CATALOG) {
        if (triggeredRef.current.has(city.id)) continue;
        const distance = haversineDistanceMeters(
          latitude,
          longitude,
          city.center[1],
          city.center[0],
        );
        if (distance > PRE_CACHE_TRIGGER_METERS) continue;
        triggeredRef.current.add(city.id);
        const already = await offlinePackManager.hasPack(city.id);
        if (already) continue;
        try {
          await offlinePackManager.downloadPack({
            cityId: city.id,
            bounds: city.bounds,
            mapStyleUrl: OFFLINE_STYLE_URL,
          });
        } catch (error) {
          reportError(error, {
            component: 'useGeofencePreCache',
            cityId: city.id,
          });
        }
      }
    };

    void run();
  }, [enabled, latitude, longitude]);
};
