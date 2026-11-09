import { useCallback, useEffect, useRef, useState } from 'react';

import { dismissBanner, isBannerDismissed } from '@/features/chat/application/bannerDismissal';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { migrateStorageKey } from '@/shared/infrastructure/migrateStorageKey';

export const RESUMPTION_BANNER_DISMISS_STORAGE_KEY =
  'musaium.settings.resumptionBannerDismissedUntil';

const LEGACY_RESUMPTION_KEY = 'settings.resumption_banner_dismissed_until';

export const RESUMPTION_BANNER_DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

export const RESUMPTION_BANNER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const RESUMPTION_FETCH_LIMIT = 10;

export interface ResumableSession {
  readonly id: string;
  readonly museumId: number | null;
  readonly museumName: string | null;
  readonly lastArtworkTitle: string | null;
  readonly updatedAt: string;
}

interface ListSessionItem {
  readonly id: string;
  readonly museumName?: string | null;
  readonly museumId?: number | null;
  readonly lastArtworkTitle?: string | null;
  readonly updatedAt: string;
  readonly lastMessageAt?: string | null;
  readonly messageCount: number;
}

interface ListSessionsResponseShape {
  readonly sessions: readonly ListSessionItem[];
}

function activityMs(s: ListSessionItem): number {
  return new Date(s.lastMessageAt ?? s.updatedAt).getTime();
}

function pickResumable(sessions: readonly ListSessionItem[], now: number): ListSessionItem | null {
  const eligible = sessions.filter((s) => {
    if (s.messageCount <= 0) return false;
    const ms = activityMs(s);
    if (Number.isNaN(ms)) return false;
    return now - ms < RESUMPTION_BANNER_WINDOW_MS;
  });
  if (eligible.length === 0) return null;
  return eligible.reduce((best, current) =>
    activityMs(current) > activityMs(best) ? current : best,
  );
}

export function useResumableSession(): {
  session: ResumableSession | null;
  isLoading: boolean;
  dismiss: () => Promise<void>;
} {
  const [session, setSession] = useState<ResumableSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const cancelledRef = useRef(false);
  const isCancelled = useCallback((): boolean => cancelledRef.current, []);

  useEffect(() => {
    cancelledRef.current = false;

    void (async () => {
      try {
        await migrateStorageKey(RESUMPTION_BANNER_DISMISS_STORAGE_KEY, LEGACY_RESUMPTION_KEY);
        const dismissed = await isBannerDismissed(RESUMPTION_BANNER_DISMISS_STORAGE_KEY);
        if (isCancelled()) return;
        if (dismissed) {
          setIsLoading(false);
          return;
        }

        const response = (await chatApi.listSessions({
          limit: RESUMPTION_FETCH_LIMIT,
        })) as unknown as ListSessionsResponseShape;
        if (isCancelled()) return;

        const now = Date.now();
        const picked = pickResumable(response.sessions, now);
        if (!picked) {
          setIsLoading(false);
          return;
        }

        const next: ResumableSession = {
          id: picked.id,
          museumId: picked.museumId ?? null,
          museumName: picked.museumName ?? null,
          lastArtworkTitle: picked.lastArtworkTitle ?? null,
          updatedAt: picked.updatedAt,
        };
        setSession(next);
        setIsLoading(false);

        console.debug('[B2] resumable_session_shown', {
          has_artwork_title: next.lastArtworkTitle !== null,
          has_museum: next.museumName !== null,
          age_hours: Math.floor((now - new Date(next.updatedAt).getTime()) / 3_600_000),
        });
      } catch {
        if (isCancelled()) return;
        setIsLoading(false);
        console.debug('[B2] resumable_session_fetch_failed', { reason: 'fetch-error' });
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [isCancelled]);

  const dismiss = useCallback(async (): Promise<void> => {
    setSession(null);
    await dismissBanner(
      RESUMPTION_BANNER_DISMISS_STORAGE_KEY,
      RESUMPTION_BANNER_DISMISS_DURATION_MS,
    );
  }, []);

  return { session, isLoading, dismiss };
}
