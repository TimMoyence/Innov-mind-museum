import { useCallback, useState } from 'react';
import { Alert, Share } from 'react-native';
import { useTranslation } from 'react-i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { useConversationsStore } from '@/features/conversation/infrastructure/conversationsStore';

/** Manages conversation actions: sort, filter, share, save, delete. */
export function useConversationsActions() {
  const { t } = useTranslation();

  const items = useConversationsStore((s) => s.items);
  const removeItems = useConversationsStore((s) => s.removeItems);
  const savedSessionIds = useConversationsStore((s) => s.savedSessionIds);
  const toggleSaved = useConversationsStore((s) => s.toggleSaved);
  const sortMode = useConversationsStore((s) => s.sortMode);
  const setSortMode = useConversationsStore((s) => s.setSortMode);

  const [isSavedOnly, setIsSavedOnly] = useState(false);
  const [menuStatus, setMenuStatus] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleSortMode = () => {
    Alert.alert(t('conversations.sort_title'), undefined, [
      {
        text: t('conversations.sort_option_recent'),
        onPress: () => {
          setSortMode('recent');
          setMenuStatus(t('conversations.sorted_by_recency'));
        },
      },
      {
        text: t('conversations.sort_option_messages'),
        onPress: () => {
          setSortMode('messages');
          setMenuStatus(t('conversations.sorted_by_messages'));
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const toggleSavedFilter = () => {
    setIsSavedOnly((previous) => {
      const next = !previous;
      setMenuStatus(next ? t('conversations.showing_saved_only') : t('conversations.showing_all'));
      return next;
    });
  };

  const shareDashboard = async () => {
    const total = items.length;
    const savedCount = savedSessionIds.length;
    await Share.share({
      title: t('conversations.share_title'),
      message: t('conversations.share_body', { total, savedCount }),
    });
    setMenuStatus(t('conversations.shared_success'));
  };

  const toggleSavedSession = useCallback(
    (sessionId: string) => {
      const isNowSaved = toggleSaved(sessionId);
      setMenuStatus(
        isNowSaved ? t('conversations.session_saved') : t('conversations.session_unsaved'),
      );
    },
    [toggleSaved, t],
  );

  // ── Delete helpers ────────────────────────────────────────────────────

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await chatApi.deleteSessionIfEmpty(sessionId);
      } catch {
        // Best-effort deletion; remove from UI regardless
      }
      removeItems([sessionId]);
    },
    [removeItems],
  );

  const confirmDeleteSingle = useCallback(
    (sessionId: string) => {
      Alert.alert(t('conversations.delete_confirm'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => void deleteSession(sessionId),
        },
      ]);
    },
    [t, deleteSession],
  );

  const deleteBulk = useCallback(
    async (ids: string[]) => {
      setIsDeleting(true);
      try {
        await Promise.allSettled(ids.map((id) => chatApi.deleteSessionIfEmpty(id)));
      } catch {
        // Best-effort
      }
      removeItems(ids);
      setIsDeleting(false);
    },
    [removeItems],
  );

  const confirmDeleteSelected = useCallback(
    (selectedIds: Set<string>) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      Alert.alert(
        t('conversations.delete_confirm'),
        t('conversations.selected_count', { count: ids.length }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => void deleteBulk(ids),
          },
        ],
      );
    },
    [t, deleteBulk],
  );

  return {
    isSavedOnly,
    menuStatus,
    isDeleting,
    sortMode,
    savedSessionIds,
    toggleSortMode,
    toggleSavedFilter,
    shareDashboard,
    toggleSavedSession,
    confirmDeleteSingle,
    confirmDeleteSelected,
  };
}
