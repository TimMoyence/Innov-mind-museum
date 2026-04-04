import { useCallback, useEffect, useRef, useState } from 'react';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { mapSessionsToDashboardCards } from '@/features/chat/domain/dashboard-session';
import { useConversationsStore } from '@/features/conversation/infrastructure/conversationsStore';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { getErrorMessage } from '@/shared/lib/errors';

/** Manages dashboard data fetching, pagination, and legacy migration. */
export function useConversationsData() {
  const setItems = useConversationsStore((s) => s.setItems);
  const appendItems = useConversationsStore((s) => s.appendItems);
  const clearItems = useConversationsStore((s) => s.clearItems);
  const migrateLegacy = useConversationsStore((s) => s.migrateLegacySavedSessions);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One-time migration of legacy savedSessions from raw AsyncStorage
  useEffect(() => {
    void migrateLegacy();
  }, [migrateLegacy]);

  const loadDashboard = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const locale = useRuntimeSettingsStore.getState().defaultLocale;
        const response = await chatApi.listSessions({ limit: 20 });
        const mapped = mapSessionsToDashboardCards(response.sessions, locale);
        setItems(mapped);
        setNextCursor(response.page.nextCursor);
        setHasMore(response.page.hasMore);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
        clearItems();
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [setItems, clearItems],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const locale = useRuntimeSettingsStore.getState().defaultLocale;
      const response = await chatApi.listSessions({ limit: 20, cursor: nextCursor });
      const mapped = mapSessionsToDashboardCards(response.sessions, locale);
      appendItems(mapped);
      setNextCursor(response.page.nextCursor);
      setHasMore(response.page.hasMore);
    } catch {
      // Silently fail — user can scroll again
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, nextCursor, appendItems]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return {
    isLoading,
    isRefreshing,
    isLoadingMore,
    error,
    setError,
    loadDashboard,
    loadMore,
  };
}
