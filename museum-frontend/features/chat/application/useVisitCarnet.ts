import { defer } from '@/shared/lib/defer';
import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from 'i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { getErrorMessage } from '@/shared/lib/errors';

import { incrementCounter } from './phase-telemetry';
import { groupSessionsByMuseumAndDate, type VisitCarnetGroup } from '@/features/chat/domain/carnet';
import type { SessionListItemDTO } from '@/features/chat/domain/contracts';

const CARNET_FETCH_LIMIT = 50;

interface ListSessionsResponseShape {
  readonly sessions: readonly SessionListItemDTO[];
}

export interface UseVisitCarnetReturn {
  isLoading: boolean;
  error: string | null;
  groups: VisitCarnetGroup[];
  refresh: () => Promise<void>;
}

export function useVisitCarnet(): UseVisitCarnetReturn {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<VisitCarnetGroup[]>([]);

  const cancelledRef = useRef(false);

  const telemetryEmittedRef = useRef(false);

  const runFetch = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = (await chatApi.listSessions({
        limit: CARNET_FETCH_LIMIT,
      })) as unknown as ListSessionsResponseShape;
      if (cancelledRef.current) return;

      const locale = i18n.language;
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

  useEffect(() => {
    cancelledRef.current = false;
    defer(runFetch);
    return () => {
      cancelledRef.current = true;
    };
  }, [runFetch]);

  const refresh = useCallback(async (): Promise<void> => {
    await runFetch();
  }, [runFetch]);

  return { isLoading, error, groups, refresh };
}
