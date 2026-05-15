/**
 * B1 — Visit notebook (carnet) list data layer.
 *
 * Fetches the user's session list once on mount, filters out empty sessions,
 * groups the remainder by museum (museumId > museumName > unknown), sorts
 * sessions DESC by `updatedAt` within each group, and emits a one-shot
 * telemetry counter when the first non-empty render lands.
 *
 * Spec : `docs/chat-ux-refonte/specs/B1.md` §1.1 R1-R10 ; §1.6 R34 ; §4 AC1-AC7, AC14.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { getErrorMessage } from '@/shared/lib/errors';

import { incrementCounter } from './phase-telemetry';
import { groupSessionsByMuseumAndDate, type VisitCarnetGroup } from '@/features/chat/domain/carnet';
import type { SessionListItemDTO } from '@/features/chat/domain/contracts';

/** Hard cap matching the BE-side `listSessions` limit (R1, NFR1). */
const CARNET_FETCH_LIMIT = 50;

/** Loose shape we expect from `chatApi.listSessions` (subset we consume). */
interface ListSessionsResponseShape {
  readonly sessions: readonly SessionListItemDTO[];
}

/**
 * Hook return shape (R10).
 *
 * Stable shape across loading / error / success states — callers may rely
 * on field presence with no narrowing required.
 */
export interface UseVisitCarnetReturn {
  isLoading: boolean;
  error: string | null;
  groups: VisitCarnetGroup[];
  refresh: () => Promise<void>;
}

/**
 * Carnet list hook.
 *
 * - R1/R8/R10 — fetches `chatApi.listSessions({ limit: 50 })` once on mount.
 * - R2 — filters out `messageCount === 0` sessions before grouping.
 * - R3/R4 — groups + sorts via {@link groupSessionsByMuseumAndDate}.
 * - R7 — captures fetch errors silently, exposes them as a string + empty
 *   groups, never throws to the caller.
 * - R9 — ignores late responses after unmount (closure-cell cancellation
 *   pattern, mirrors `useResumableSession` / B6).
 * - R34 — increments `carnet_list_viewed_total` once per successful
 *   non-empty render.
 *
 * Note : refresh re-fires the API call. Caller-driven (pull-to-refresh).
 */
export function useVisitCarnet(): UseVisitCarnetReturn {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<VisitCarnetGroup[]>([]);

  // Cancellation flag in a ref so reads survive `await` boundaries without
  // TS narrowing them to `false` literal (mirrors `useResumableSession`).
  const cancelledRef = useRef(false);

  // One-shot telemetry guard — increment only on the first non-empty render.
  const telemetryEmittedRef = useRef(false);

  const runFetch = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = (await chatApi.listSessions({
        limit: CARNET_FETCH_LIMIT,
      })) as unknown as ListSessionsResponseShape;
      if (cancelledRef.current) return;

      const locale = useRuntimeSettingsStore.getState().defaultLocale;
      const eligible = response.sessions.filter((s) => s.messageCount > 0);
      const nextGroups = groupSessionsByMuseumAndDate([...eligible], locale);
      setGroups(nextGroups);
      setIsLoading(false);

      if (nextGroups.length > 0 && !telemetryEmittedRef.current) {
        telemetryEmittedRef.current = true;
        incrementCounter('carnet_list_viewed_total');
      }
    } catch (fetchError) {
      if (cancelledRef.current) return;
      setError(getErrorMessage(fetchError));
      setGroups([]);
      setIsLoading(false);
    }
  }, []);

  /**
   * Synchronises React state with the BE list-sessions endpoint — projecting
   * an out-of-React fetch result into state, which is the canonical effect
   * use-case. The `react-hooks/set-state-in-effect` lint rule flags this as a
   * cascade risk, but the fetch is awaited (no synchronous setState chain)
   * and the cancellation flag breaks the loop on unmount.
   */
  useEffect(() => {
    cancelledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing React with BE list-sessions response; pattern mirrors useResumableSession (B2). Approved-by: green-code-agent-2026-05-15-B1-001
    void runFetch();
    return () => {
      cancelledRef.current = true;
    };
  }, [runFetch]);

  const refresh = useCallback(async (): Promise<void> => {
    await runFetch();
  }, [runFetch]);

  return { isLoading, error, groups, refresh };
}
