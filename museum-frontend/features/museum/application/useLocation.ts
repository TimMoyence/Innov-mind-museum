import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { locationCache } from '../infrastructure/locationCache';
import { getErrorMessage } from '@/shared/lib/errors';
import { createAppError } from '@/shared/types/AppError';

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied';
type LocationPrecision = 'fresh' | 'cached' | null;

interface UseLocationResult {
  latitude: number | null;
  longitude: number | null;
  status: LocationStatus;
  precision: LocationPrecision;
  error: string | null;
}

const GPS_TIMEOUT_MS = 8_000;

const TIMEOUT_SENTINEL = Symbol('gps-timeout');

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT_SENTINEL> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timer = setTimeout(() => {
      resolve(TIMEOUT_SENTINEL);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
};

export const useLocation = (): UseLocationResult => {
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [precision, setPrecision] = useState<LocationPrecision>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = (): boolean => cancelled;

    const run = async () => {
      const cached = await locationCache.load();
      if (isCancelled()) return;
      if (cached) {
        setLatitude(cached.latitude);
        setLongitude(cached.longitude);
        setPrecision('cached');
      }

      setStatus('requesting');
      setError(null);

      try {
        const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();

        if (isCancelled()) return;

        if (permissionStatus !== Location.PermissionStatus.GRANTED) {
          setStatus('denied');
          return;
        }

        setStatus('granted');

        const result = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          GPS_TIMEOUT_MS,
        );

        if (isCancelled()) return;

        if (result === TIMEOUT_SENTINEL) {
          setError(
            getErrorMessage(
              createAppError({ kind: 'Location', code: 'timeout', message: 'timeout' }),
            ),
          );
          return;
        }

        setLatitude(result.coords.latitude);
        setLongitude(result.coords.longitude);
        setPrecision('fresh');
        void locationCache.save({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
        });
      } catch (err) {
        if (isCancelled()) return;
        setError(
          getErrorMessage(
            createAppError({
              kind: 'Location',
              code: 'generic',
              message: err instanceof Error ? err.message : 'Failed to get location',
              details: err,
            }),
          ),
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return { latitude, longitude, status, precision, error };
};
