import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';
import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { useConversationsData } from '@/features/conversation/application/useConversationsData';
import { useConversationsActions } from '@/features/conversation/application/useConversationsActions';
import { useConversationsBulkMode } from '@/features/conversation/application/useConversationsBulkMode';
import { ConversationsHeader } from '@/features/conversation/ui/ConversationsHeader';
import { ConversationsBulkBar } from '@/features/conversation/ui/ConversationsBulkBar';
import { ConversationItem } from '@/features/conversation/ui/ConversationItem';
import { ConversationSearchBar } from '@/features/conversation/ui/ConversationSearchBar';
import { useConversationsStore } from '@/features/conversation/infrastructure/conversationsStore';
import { BrandMark } from '@/shared/ui/BrandMark';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { SkeletonConversationCard } from '@/shared/ui/SkeletonConversationCard';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, fontSize, radius } from '@/shared/ui/tokens.generated';

type ListRow =
  | { kind: 'sticky' }
  | { kind: 'session'; session: DashboardSessionCard }
  | { kind: 'skeleton'; key: string }
  | { kind: 'empty' };

/** Renders the dashboard screen listing recent chat sessions with sort, save, share, swipe-to-delete, and bulk delete capabilities. */
export default function ConversationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const { isCreating, error: createError, startConversation } = useStartConversation();

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

  const handleConfirmDeleteSelected = useCallback(() => {
    confirmDeleteSelected(selectedIds);
    resetSelection();
  }, [confirmDeleteSelected, selectedIds, resetSelection]);

  const listData = useMemo<ListRow[]>(() => {
    if (isLoading) {
      return [
        { kind: 'sticky' },
        ...Array.from(
          { length: 5 },
          (_, i): ListRow => ({ kind: 'skeleton', key: `skeleton-${String(i)}` }),
        ),
      ];
    }

    if (visibleItems.length === 0) {
      return [{ kind: 'sticky' }, { kind: 'empty' }];
    }

    return [
      { kind: 'sticky' },
      ...visibleItems.map((session): ListRow => ({ kind: 'session', session })),
    ];
  }, [isLoading, visibleItems]);

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.kind === 'sticky') {
        return (
          <View style={[styles.stickyBar, { backgroundColor: theme.cardBackground }]}>
            <ConversationSearchBar value={searchQuery} onChangeText={setSearchQuery} />
            <Pressable
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary, shadowColor: theme.primary },
                isCreating && styles.disabledOpacity,
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
          </View>
        );
      }

      if (item.kind === 'skeleton') {
        return <SkeletonConversationCard />;
      }

      if (item.kind === 'empty') {
        return (
          <GlassCard style={styles.emptyState} intensity={48}>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
              {t('conversations.empty_title')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {isSavedOnly ? t('conversations.empty_saved') : t('conversations.empty_body')}
            </Text>
            {!isSavedOnly ? (
              <Pressable
                style={[styles.emptyActionButton, { backgroundColor: theme.primary }]}
                onPress={() => void startConversation()}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.conversations.start_new')}
                testID="empty-state-start-button"
              >
                <Text style={[styles.emptyActionText, { color: theme.primaryContrast }]}>
                  {t('conversations.start_new')}
                </Text>
              </Pressable>
            ) : null}
          </GlassCard>
        );
      }

      return (
        <ConversationItem
          item={item.session}
          editMode={editMode}
          selectedIds={selectedIds}
          savedSessionIds={savedSessionIds}
          toggleSelection={toggleSelection}
          toggleSavedSession={toggleSavedSession}
          confirmDeleteSingle={confirmDeleteSingle}
        />
      );
    },
    [
      theme,
      searchQuery,
      isCreating,
      startConversation,
      t,
      isSavedOnly,
      editMode,
      selectedIds,
      savedSessionIds,
      toggleSelection,
      toggleSavedSession,
      confirmDeleteSingle,
    ],
  );

  const keyExtractor = useCallback((item: ListRow): string => {
    if (item.kind === 'sticky') return '__sticky__';
    if (item.kind === 'skeleton') return item.key;
    if (item.kind === 'empty') return '__empty__';
    return item.session.id;
  }, []);

  const getItemType = useCallback((item: ListRow): string => item.kind, []);

  const listHeader = (
    <View>
      <ConversationsHeader
        editMode={editMode}
        isSavedOnly={isSavedOnly}
        sortMode={sortMode}
        onToggleEdit={toggleEditMode}
        onToggleSortMode={toggleSortMode}
        onToggleSavedFilter={toggleSavedFilter}
        onShareDashboard={shareDashboard}
      />

      {menuStatus ? (
        <Text style={[styles.menuStatus, { color: theme.success }]}>{menuStatus}</Text>
      ) : null}

      {(error ?? createError) ? (
        <ErrorNotice
          message={error ?? createError ?? ''}
          onDismiss={() => {
            setError(null);
          }}
        />
      ) : null}

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
    </View>
  );

  return (
    <LiquidScreen
      background={pickMuseumBackground(2)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.gapSmall }]}
    >
      <FlashList
        testID="conversation-list"
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        getItemType={getItemType}
        stickyHeaderIndices={[1]}
        ListHeaderComponent={listHeader}
        extraData={editMode ? selectedIds.size : 0}
        contentContainerStyle={{
          ...styles.listContent,
          paddingBottom: insets.bottom + semantic.section.marginBottom,
        }}
        refreshing={isRefreshing}
        onRefresh={() => void loadDashboard(true)}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.3}
        ListFooterComponent={isLoadingMore ? <SkeletonConversationCard /> : null}
        ItemSeparatorComponent={ItemSeparator}
      />

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

const separatorStyle = { height: semantic.form.gap } as const;
const ItemSeparator = () => <View style={separatorStyle} />;

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.card.paddingLarge,
  },
  menuStatus: {
    marginTop: semantic.card.gapSmall,
    marginBottom: semantic.card.gapTiny,
    fontSize: semantic.card.captionSize,
    fontWeight: '700',
  },
  listContent: {
    paddingTop: semantic.screen.padding,
  },
  stickyBar: {
    paddingVertical: semantic.list.itemPaddingYCompact,
  },
  primaryButton: {
    marginTop: semantic.form.gapLarge,
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingY,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  disabledOpacity: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
  headerCard: {
    marginTop: semantic.card.gap,
    paddingHorizontal: semantic.card.padding,
    paddingVertical: semantic.card.padding,
    alignItems: 'center',
  },
  brand: {
    marginBottom: semantic.section.gapTight,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: semantic.section.gapTight,
    fontSize: semantic.card.bodySize,
    lineHeight: space['5'],
    textAlign: 'center',
  },
  metaLine: {
    marginTop: semantic.section.gapTight,
    fontSize: semantic.card.captionSize,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyState: {
    marginTop: space['7'],
    padding: semantic.card.padding,
  },
  emptyTitle: {
    fontSize: semantic.section.subtitleSize,
    fontWeight: '700',
  },
  emptySubtitle: {
    marginTop: semantic.section.gapTight,
    lineHeight: space['5'],
  },
  emptyActionButton: {
    marginTop: semantic.card.gap,
    borderRadius: radius.DEFAULT,
    paddingVertical: semantic.list.itemPaddingYCompact,
    alignItems: 'center',
  },
  emptyActionText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
});
