import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';
import { mapSessionsToDashboardCards } from '@/features/chat/domain/dashboard-session';
import { ConversationSearchBar } from '@/features/conversation/ui/ConversationSearchBar';
import { SwipeableConversationCard } from '@/features/conversation/ui/SwipeableConversationCard';
import { useConversationsStore } from '@/features/conversation/infrastructure/conversationsStore';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { BrandMark } from '@/shared/ui/BrandMark';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { SkeletonConversationCard } from '@/shared/ui/SkeletonConversationCard';

/** Renders the dashboard screen listing recent chat sessions with sort, save, share, swipe-to-delete, and bulk delete capabilities. */
export default function ConversationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  // Zustand-persisted state
  const items = useConversationsStore((s) => s.items);
  const setItems = useConversationsStore((s) => s.setItems);
  const appendItems = useConversationsStore((s) => s.appendItems);
  const clearItems = useConversationsStore((s) => s.clearItems);
  const removeItems = useConversationsStore((s) => s.removeItems);
  const savedSessionIds = useConversationsStore((s) => s.savedSessionIds);
  const toggleSaved = useConversationsStore((s) => s.toggleSaved);
  const sortMode = useConversationsStore((s) => s.sortMode);
  const setSortMode = useConversationsStore((s) => s.setSortMode);
  const migrateLegacy = useConversationsStore((s) => s.migrateLegacySavedSessions);

  // Ephemeral local state
  const [isSavedOnly, setIsSavedOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [menuStatus, setMenuStatus] = useState('');

  // Edit (bulk-delete) mode
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [isDeleting, setIsDeleting] = useState(false);

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
        const settings = await loadRuntimeSettings();
        const response = await chatApi.listSessions({ limit: 20 });
        const mapped = mapSessionsToDashboardCards(response.sessions, settings.defaultLocale);
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
      const settings = await loadRuntimeSettings();
      const response = await chatApi.listSessions({ limit: 20, cursor: nextCursor });
      const mapped = mapSessionsToDashboardCards(response.sessions, settings.defaultLocale);
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

  const toggleSortMode = () => {
    const next = sortMode === 'recent' ? 'messages' : 'recent';
    setSortMode(next);
    setMenuStatus(
      next === 'recent'
        ? t('conversations.sorted_by_recency')
        : t('conversations.sorted_by_messages'),
    );
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
      setSelectedIds(new Set());
      setEditMode(false);
      setIsDeleting(false);
    },
    [removeItems],
  );

  const confirmDeleteSelected = useCallback(() => {
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
  }, [selectedIds, t, deleteBulk]);

  // ── Edit mode helpers ────────────────────────────────────────────────

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
    setSelectedIds(new Set(visibleItems.map((item) => item.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleItems reference intentionally excluded to avoid re-creating on each filter
  }, [items, isSavedOnly, savedSessionIds, sortMode, searchQuery]);

  // ── Render ────────────────────────────────────────────────────────────

  const renderConversationItem = useCallback(
    ({ item }: { item: DashboardSessionCard }) => {
      const cardContent = (
        <Pressable
          style={[
            styles.card,
            { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
          ]}
          onPress={() => {
            if (editMode) {
              toggleSelection(item.id);
            } else {
              router.push(`/(stack)/chat/${item.id}`);
            }
          }}
          onLongPress={() => {
            if (!editMode) {
              toggleSavedSession(item.id);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          accessibilityHint={editMode ? undefined : t('a11y.conversations.card_hint')}
        >
          <View style={styles.cardRow}>
            {editMode ? (
              <View style={styles.checkboxContainer}>
                <Ionicons
                  name={selectedIds.has(item.id) ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={selectedIds.has(item.id) ? theme.primary : theme.textSecondary}
                />
              </View>
            ) : null}
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{item.subtitle}</Text>
              <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                {item.timeLabel}
              </Text>
              <Text style={[styles.cardTags, { color: theme.primary }]}>
                {t('conversations.message_count', { count: item.messageCount })}
              </Text>
              <Text style={[styles.savedHint, { color: theme.timestamp }]}>
                {savedSessionIds.includes(item.id)
                  ? t('conversations.saved_hint')
                  : t('conversations.unsaved_hint')}
              </Text>
            </View>
          </View>
        </Pressable>
      );

      return (
        <SwipeableConversationCard
          editMode={editMode}
          onDelete={() => {
            confirmDeleteSingle(item.id);
          }}
        >
          {cardContent}
        </SwipeableConversationCard>
      );
    },
    [
      theme,
      savedSessionIds,
      t,
      toggleSavedSession,
      editMode,
      selectedIds,
      toggleSelection,
      confirmDeleteSingle,
    ],
  );

  const visibleItems = useMemo(() => {
    let filtered = isSavedOnly ? items.filter((item) => savedSessionIds.includes(item.id)) : items;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query),
      );
    }

    if (sortMode === 'recent') {
      return filtered;
    }

    return [...filtered].sort((left, right) => right.messageCount - left.messageCount);
  }, [isSavedOnly, items, savedSessionIds, sortMode, searchQuery]);

  return (
    <LiquidScreen
      background={pickMuseumBackground(2)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.menuRow}>
        <FloatingContextMenu
          actions={[
            {
              id: 'sort',
              icon: 'filter-outline',
              label: t('conversations.filter'),
              onPress: toggleSortMode,
            },
            {
              id: 'bookmark',
              icon: 'bookmark-outline',
              label: t('conversations.saved'),
              onPress: toggleSavedFilter,
            },
            {
              id: 'share',
              icon: 'share-social-outline',
              label: t('conversations.share'),
              onPress: () => void shareDashboard(),
            },
          ]}
        />
        <Pressable
          style={[styles.editButton, { borderColor: editMode ? theme.primary : theme.glassBorder }]}
          onPress={toggleEditMode}
          accessibilityRole="button"
          accessibilityLabel={t('conversations.edit')}
        >
          <Text
            style={[styles.editButtonText, { color: editMode ? theme.primary : theme.textPrimary }]}
          >
            {editMode ? t('common.cancel') : t('conversations.edit')}
          </Text>
        </Pressable>
      </View>

      <GlassCard style={styles.headerCard} intensity={60}>
        <BrandMark variant="header" style={styles.brand} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('conversations.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('conversations.subtitle')}
        </Text>
        <Text style={[styles.metaLine, { color: theme.primary }]}>
          {isSavedOnly ? t('conversations.saved_filter_on') : t('conversations.saved_filter_off')} •{' '}
          {t('conversations.sort_label', { sortMode })}
        </Text>
      </GlassCard>

      {menuStatus ? (
        <Text style={[styles.menuStatus, { color: theme.success }]}>{menuStatus}</Text>
      ) : null}

      {error ? (
        <ErrorNotice
          message={error}
          onDismiss={() => {
            setError(null);
          }}
        />
      ) : null}

      <ConversationSearchBar value={searchQuery} onChangeText={setSearchQuery} />

      <Pressable
        style={[
          styles.primaryButton,
          { backgroundColor: theme.primary, shadowColor: theme.primary },
        ]}
        onPress={() => {
          router.push('/(tabs)/home');
        }}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.conversations.start_new')}
      >
        <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
          {t('conversations.start_new')}
        </Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonConversationCard key={i} />
          ))}
        </View>
      ) : (
        <FlashList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          extraData={editMode ? selectedIds.size : 0}
          contentContainerStyle={styles.listContent}
          refreshing={isRefreshing}
          onRefresh={() => void loadDashboard(true)}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={isLoadingMore ? <SkeletonConversationCard /> : null}
          ListEmptyComponent={
            <GlassCard style={styles.emptyState} intensity={48}>
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                {t('conversations.empty_title')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                {isSavedOnly ? t('conversations.empty_saved') : t('conversations.empty_body')}
              </Text>
            </GlassCard>
          }
          ItemSeparatorComponent={ItemSeparator}
        />
      )}

      {editMode && selectedIds.size > 0 ? (
        <View
          style={[
            styles.bulkBar,
            { backgroundColor: theme.cardBackground, borderTopColor: theme.cardBorder },
          ]}
        >
          <Pressable
            style={[styles.bulkBarButton, { borderColor: theme.glassBorder }]}
            onPress={selectAll}
            accessibilityRole="button"
            accessibilityLabel={t('conversations.select_all')}
          >
            <Ionicons name="checkmark-done-outline" size={18} color={theme.textPrimary} />
            <Text style={[styles.bulkBarButtonText, { color: theme.textPrimary }]}>
              {t('conversations.select_all')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.bulkBarButton,
              { backgroundColor: theme.error, borderColor: theme.error },
            ]}
            onPress={confirmDeleteSelected}
            disabled={isDeleting}
            accessibilityRole="button"
            accessibilityLabel={t('conversations.delete_selected', { count: selectedIds.size })}
          >
            <Ionicons name="trash-outline" size={18} color={theme.primaryContrast} />
            <Text style={[styles.bulkBarButtonText, { color: theme.primaryContrast }]}>
              {t('conversations.delete_selected', { count: selectedIds.size })}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </LiquidScreen>
  );
}

const separatorStyle = { height: 10 } as const;
const ItemSeparator = () => <View style={separatorStyle} />;

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  editButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  brand: {
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: undefined, // theme.textPrimary applied inline
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    color: undefined, // theme.textSecondary applied inline
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  metaLine: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  menuStatus: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  skeletonList: {
    marginTop: 16,
    paddingBottom: 24,
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  emptyState: {
    marginTop: 28,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    marginTop: 6,
    lineHeight: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxContainer: {
    paddingTop: 2,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 13,
  },
  cardTags: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  savedHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
  },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  bulkBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  bulkBarButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
