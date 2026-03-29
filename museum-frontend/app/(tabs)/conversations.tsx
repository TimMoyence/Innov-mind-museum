import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';
import { useConversationsData } from '@/features/conversation/application/useConversationsData';
import { useConversationsActions } from '@/features/conversation/application/useConversationsActions';
import { useConversationsBulkMode } from '@/features/conversation/application/useConversationsBulkMode';
import { ConversationsHeader } from '@/features/conversation/ui/ConversationsHeader';
import { ConversationsBulkBar } from '@/features/conversation/ui/ConversationsBulkBar';
import { ConversationSearchBar } from '@/features/conversation/ui/ConversationSearchBar';
import { SwipeableConversationCard } from '@/features/conversation/ui/SwipeableConversationCard';
import { useConversationsStore } from '@/features/conversation/infrastructure/conversationsStore';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const items = useConversationsStore((s) => s.items);

  const { isLoading, isRefreshing, isLoadingMore, error, setError, loadDashboard, loadMore } =
    useConversationsData();

  const {
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
  } = useConversationsActions();

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

  const { editMode, selectedIds, toggleEditMode, toggleSelection, selectAll, resetSelection } =
    useConversationsBulkMode({
      items,
      isSavedOnly,
      savedSessionIds,
      sortMode,
      searchQuery,
      getVisibleItems: () => visibleItems,
    });

  const startConversation = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const settings = await loadRuntimeSettings();
      const response = await chatApi.createSession({
        locale: settings.defaultLocale,
        museumMode: settings.defaultMuseumMode,
      });
      router.push(`/(stack)/chat/${response.session.id}`);
    } catch (createError) {
      setError(String(createError instanceof Error ? createError.message : createError));
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, setError]);

  const handleConfirmDeleteSelected = useCallback(() => {
    confirmDeleteSelected(selectedIds);
    resetSelection();
  }, [confirmDeleteSelected, selectedIds, resetSelection]);

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

  return (
    <LiquidScreen
      background={pickMuseumBackground(2)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
    >
      <ConversationsHeader
        editMode={editMode}
        onToggleEdit={toggleEditMode}
        onToggleSortMode={toggleSortMode}
        onToggleSavedFilter={toggleSavedFilter}
        onShareDashboard={shareDashboard}
        isSavedOnly={isSavedOnly}
        sortMode={sortMode}
      />

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
          isCreating && { opacity: 0.7 },
        ]}
        onPress={() => void startConversation()}
        disabled={isCreating}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.conversations.start_new')}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color={theme.primaryContrast} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
            {t('conversations.start_new')}
          </Text>
        )}
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
          estimatedItemSize={80}
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
        <ConversationsBulkBar
          selectedCount={selectedIds.size}
          onSelectAll={selectAll}
          onDeleteSelected={handleConfirmDeleteSelected}
          isDeleting={isDeleting}
        />
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
});
