import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';

import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';

/** Manages bulk edit mode: toggle, selection, select-all. */
export function useConversationsBulkMode(visibleItemsDeps: {
  items: DashboardSessionCard[];
  isSavedOnly: boolean;
  savedSessionIds: string[];
  sortMode: string;
  searchQuery: string;
  getVisibleItems: () => DashboardSessionCard[];
}) {
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const toggleSelection = useCallback((sessionId: string) => {
    void Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    void Haptics.selectionAsync();
    setSelectedIds(new Set(visibleItemsDeps.getVisibleItems().map((item) => item.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleItems reference intentionally excluded to avoid re-creating on each filter
  }, [
    visibleItemsDeps.items,
    visibleItemsDeps.isSavedOnly,
    visibleItemsDeps.savedSessionIds,
    visibleItemsDeps.sortMode,
    visibleItemsDeps.searchQuery,
  ]);

  const resetSelection = useCallback(() => {
    setSelectedIds(new Set());
    setEditMode(false);
  }, []);

  return {
    editMode,
    selectedIds,
    toggleEditMode,
    toggleSelection,
    selectAll,
    resetSelection,
  };
}
