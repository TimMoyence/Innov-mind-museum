import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';

import type { DashboardSessionCard } from '@/features/chat';

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

  const { getVisibleItems } = visibleItemsDeps;
  const selectAll = useCallback(() => {
    void Haptics.selectionAsync();
    setSelectedIds(new Set(getVisibleItems().map((item) => item.id)));
  }, [getVisibleItems]);

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
