import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied';

interface UseLocationResult {
  latitude: number | null;
  longitude: number | null;
  status: LocationStatus;
  error: string | null;
}

/**
 * Hook that requests foreground location permission and returns the current position.
 * Permission is requested on mount; coordinates are fetched once when granted.
 */
export const useLocation = (): UseLocationResult => {
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const requestLocation = async () => {
      setStatus('requesting');
      setError(null);

      try {
        const { status: permissionStatus } =
          await Location.requestForegroundPermissionsAsync();

         
        if (cancelled) return;

        if (permissionStatus !== 'granted') {
          setStatus('denied');
          return;
        }

        setStatus('granted');

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (cancelled) return;

        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to get location',
        );
      }
    };

    void requestLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  return { latitude, longitude, status, error };
};
