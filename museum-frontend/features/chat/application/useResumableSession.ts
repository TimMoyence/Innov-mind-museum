/**
 * B2 — Conversation resumption banner data layer.
 *
 * Fetches the user's session list once on mount, filters down to sessions
 * eligible for resumption (`messageCount > 0` AND age < 7 days), picks the
 * most recently updated one, and exposes a `dismiss()` mechanism that hides
 * the banner for 24 hours via AsyncStorage.
 *
 * Spec : `docs/chat-ux-refonte/specs/B2.md` §1.1 R1-R12 ; §4 AC1-AC10.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { storage } from '@/shared/infrastructure/storage';
import { migrateStorageKey } from '@/shared/infrastructure/migrateStorageKey';

/** Storage key holding the ISO timestamp until which the banner stays hidden. */
export const RESUMPTION_BANNER_DISMISS_STORAGE_KEY =
  'musaium.settings.resumptionBannerDismissedUntil';

/** Pre-namespacing key migrated forward once before the read (TD-AS-01). */
const LEGACY_RESUMPTION_KEY = 'settings.resumption_banner_dismissed_until';

/** 24 hours in milliseconds — duration of the dismiss-until window. */
export const RESUMPTION_BANNER_DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

/** 7 days in milliseconds — maximum session age eligible for resumption. */
export const RESUMPTION_BANNER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum number of sessions to fetch from the list endpoint. */
const RESUMPTION_FETCH_LIMIT = 10;

/**
 * Shape returned by {@link useResumableSession} when an eligible session is
 * found. Mirrors the BE list-sessions item shape, narrowed to fields the
 * banner needs.
 */
export interface ResumableSession {
  readonly id: string;
  readonly museumId: number | null;
  readonly museumName: string | null;
  readonly lastArtworkTitle: string | null;
  readonly updatedAt: string;
}

/** Local view of a list-sessions row — uses optional fields for backward-compat (NFR5). */
interface ListSessionItem {
  readonly id: string;
  readonly museumName?: string | null;
  readonly museumId?: number | null;
  readonly lastArtworkTitle?: string | null;
  readonly updatedAt: string;
  readonly messageCount: number;
}

interface ListSessionsResponseShape {
  readonly sessions: readonly ListSessionItem[];
}

/**
 * Selects the session most recently updated among those satisfying the
 * resumption filter (`messageCount > 0` AND age < 7 days). Pure helper —
 * does NOT assume BE-side ordering.
 */
function pickResumable(sessions: readonly ListSessionItem[], now: number): ListSessionItem | null {
  const eligible = sessions.filter((s) => {
    if (s.messageCount <= 0) return false;
    const updatedAtMs = new Date(s.updatedAt).getTime();
    if (Number.isNaN(updatedAtMs)) return false;
    return now - updatedAtMs < RESUMPTION_BANNER_WINDOW_MS;
  });
  if (eligible.length === 0) return null;
  return eligible.reduce((best, current) =>
    new Date(current.updatedAt).getTime() > new Date(best.updatedAt).getTime() ? current : best,
  );
}

/**
 * Conversation resumption banner data hook.
 *
 * - Fetches the most recent sessions exactly once on mount.
 * - Filters by `messageCount > 0` AND age < 7 days, picks max-by-updatedAt.
 * - Respects a dismiss-until storage flag (`settings.resumption_banner_dismissed_until`)
 *   suppressing the banner for 24 h after the user taps the dismiss button.
 * - Tolerates API and storage failures silently — never throws.
 *
 * @returns `{ session, isLoading, dismiss }` — `session` is `null` until the
 * first fetch resolves and remains `null` if no eligible session is found or
 * if the dismiss-until window is active.
 */
export function useResumableSession(): {
  session: ResumableSession | null;
  isLoading: boolean;
  dismiss: () => Promise<void>;
} {
  const [session, setSession] = useState<ResumableSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Cancellation flag flipped by the effect cleanup. Held in a `useRef` so
  // reads cross the `await` flow boundaries without TS narrowing them to
  // always-falsy (`@typescript-eslint/no-unnecessary-condition`).
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    void (async () => {
      try {
        // 1. Dismiss-until storage gate — read tolerant of failure.
        // Migrate the legacy key forward once before reading (TD-AS-01).
        await migrateStorageKey(RESUMPTION_BANNER_DISMISS_STORAGE_KEY, LEGACY_RESUMPTION_KEY);
        let dismissedUntilRaw: string | null = null;
        try {
          dismissedUntilRaw = await storage.getItem(RESUMPTION_BANNER_DISMISS_STORAGE_KEY);
        } catch {
          // Storage read failed → treat as "not dismissed" (R7, AC10).
        }
        if (cancelledRef.current) return;
        if (dismissedUntilRaw !== null && dismissedUntilRaw.length > 0) {
          const dismissedUntilMs = new Date(dismissedUntilRaw).getTime();
          if (!Number.isNaN(dismissedUntilMs) && Date.now() < dismissedUntilMs) {
            setIsLoading(false);
            return;
          }
        }

        // 2. Fetch session list.
        const response = (await chatApi.listSessions({
          limit: RESUMPTION_FETCH_LIMIT,
        })) as unknown as ListSessionsResponseShape;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref mutated by cleanup (async boundary), TS flow analysis narrows incorrectly here. Approved-by: green-code-agent-2026-05-15-B2-001
        if (cancelledRef.current) return;

        // 3. Filter + pick max.
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

        // 4. Telemetry — counts/flags only (NFR4). No PII.
        console.debug('[B2] resumable_session_shown', {
          has_artwork_title: next.lastArtworkTitle !== null,
          has_museum: next.museumName !== null,
          age_hours: Math.floor((now - new Date(next.updatedAt).getTime()) / 3_600_000),
        });
      } catch {
        // API failure → silent fall-through (R11, AC9). Banner stays null.
        if (cancelledRef.current) return;
        setIsLoading(false);
        console.debug('[B2] resumable_session_fetch_failed', { reason: 'fetch-error' });
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const dismiss = useCallback(async (): Promise<void> => {
    // Optimistic UI : clear local state synchronously, then persist (R8, AC8).
    setSession(null);
    const until = new Date(Date.now() + RESUMPTION_BANNER_DISMISS_DURATION_MS).toISOString();
    try {
      await storage.setItem(RESUMPTION_BANNER_DISMISS_STORAGE_KEY, until);
    } catch {
      // Storage write failure tolerated — banner already hidden locally for this
      // session. Next mount will re-fetch and possibly show the banner again.
    }
  }, []);

  return { session, isLoading, dismiss };
}
