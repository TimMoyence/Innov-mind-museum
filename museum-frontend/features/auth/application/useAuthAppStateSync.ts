import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Sentry from '@sentry/react-native';

import { isAccessTokenExpired } from '@/features/auth/domain/authLogic.pure';
import { getAccessToken } from '@/features/auth/infrastructure/authTokenStore';

type BackgroundRefreshFn = () => Promise<string | null>;

const REFRESH_EARLY_WINDOW_MS = 2 * 60 * 1000;
const REFRESH_THROTTLE_MS = 60 * 1000;

const now = (): number => Date.now();

const shouldRefreshSoon = (accessToken: string | null): boolean => {
  if (!accessToken) return false;
  if (isAccessTokenExpired(accessToken)) return true;
  return isAccessTokenExpired(accessToken, REFRESH_EARLY_WINDOW_MS);
};

export const useAuthAppStateSync = (
  refresh: BackgroundRefreshFn,
  opts?: { onForeground?: (durationMs: number) => void },
): void => {
  const lastRefreshAtRef = useRef<number>(0);
  const lastBackgroundAtRef = useRef<number | null>(null);
  const refreshRef = useRef(refresh);
  const onForegroundRef = useRef(opts?.onForeground);

  useEffect(() => {
    refreshRef.current = refresh;
    onForegroundRef.current = opts?.onForeground;
  }, [refresh, opts?.onForeground]);

  useEffect(() => {
    const handler = (next: AppStateStatus): void => {
      if (next === 'background' || next === 'inactive') {
        lastBackgroundAtRef.current = now();
        return;
      }
      if (next !== 'active') return;

      const backgroundedAt = lastBackgroundAtRef.current;
      const backgroundDurationMs = backgroundedAt ? now() - backgroundedAt : 0;
      lastBackgroundAtRef.current = null;

      try {
        Sentry.addBreadcrumb({
          category: 'app.lifecycle',
          level: 'info',
          message: 'foreground',
          data: { background_duration_ms: backgroundDurationMs },
        });
      } catch {}

      onForegroundRef.current?.(backgroundDurationMs);

      const sinceLastRefresh = now() - lastRefreshAtRef.current;
      if (sinceLastRefresh < REFRESH_THROTTLE_MS) return;

      const accessToken = getAccessToken() || null;
      if (!shouldRefreshSoon(accessToken)) return;

      lastRefreshAtRef.current = now();
      void refreshRef.current().catch(() => undefined);
    };

    const subscription = AppState.addEventListener('change', handler);
    return () => {
      subscription.remove();
    };
  }, []);
};
