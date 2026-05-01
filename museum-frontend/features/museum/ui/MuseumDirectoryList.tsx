import { useCallback } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/ui/EmptyState';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, fontSize } from '@/shared/ui/tokens';
import { SkeletonConversationCard } from '@/shared/ui/SkeletonConversationCard';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import { MuseumCard } from './MuseumCard';

interface MuseumDirectoryListProps {
  museums: MuseumWithDistance[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onMuseumPress: (museum: MuseumWithDistance) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onRefreshAction?: () => void;
}

/** Scrollable list of MuseumCards with search bar header, pull-to-refresh, and empty state. */
export const MuseumDirectoryList = ({
  museums,
  isLoading,
  searchQuery,
  onSearchChange,
  onMuseumPress,
  onRefresh,
  isRefreshing = false,
  onRefreshAction,
}: MuseumDirectoryListProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const renderItem = useCallback(
    ({ item }: { item: MuseumWithDistance }) => (
      <MuseumCard museum={item} onPress={onMuseumPress} />
    ),
    [onMuseumPress],
  );

  if (isLoading) {
    return (
      <View
        style={styles.skeletonList}
        accessibilityRole="progressbar"
        accessibilityLabel={t('a11y.museum.skeleton_loading')}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonConversationCard key={i} />
        ))}
      </View>
    );
  }

  return (
    <>
      <View
        style={[
          styles.searchBar,
          { borderColor: theme.cardBorder, backgroundColor: theme.surface },
        ]}
      >
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder={t('museumDirectory.search_placeholder')}
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel={t('a11y.museum.search_input')}
        />
      </View>

      <FlashList
        data={museums}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <EmptyState
            variant="museums"
            title={t('empty.museums.title')}
            description={t('empty.museums.description')}
            primaryAction={
              onRefreshAction !== undefined
                ? {
                    label: t('empty.museums.actionLabel'),
                    onPress: onRefreshAction,
                    iconName: 'refresh-outline',
                  }
                : undefined
            }
            testID="museums-empty-state"
          />
        }
        ItemSeparatorComponent={ItemSeparator}
      />
    </>
  );
};

const separatorStyle = { height: space['2.5'] } as const;
const ItemSeparator = () => <View style={separatorStyle} />;

const styles = StyleSheet.create({
  searchBar: {
    marginBottom: semantic.screen.gapSmall,
    borderRadius: semantic.input.radius,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: space['3.5'],
    paddingVertical: semantic.list.itemPaddingYCompact,
  },
  searchInput: {
    fontSize: fontSize.base,
  },
  skeletonList: {
    marginTop: semantic.screen.gap,
    paddingBottom: semantic.screen.paddingLarge,
  },
  listContent: {
    paddingBottom: semantic.screen.paddingLarge,
  },
});
