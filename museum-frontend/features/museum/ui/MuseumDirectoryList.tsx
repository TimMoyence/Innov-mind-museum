import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
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
}: MuseumDirectoryListProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (isLoading) {
    return (
      <View style={styles.skeletonList}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonConversationCard key={i} />
        ))}
      </View>
    );
  }

  return (
    <>
      <View style={[styles.searchBar, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}>
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder={t('museumDirectory.search_placeholder')}
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <FlashList
        data={museums}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <MuseumCard museum={item} onPress={onMuseumPress} />
        )}
        contentContainerStyle={styles.listContent}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <GlassCard style={styles.emptyState} intensity={48}>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
              {t('museumDirectory.no_results')}
            </Text>
          </GlassCard>
        }
        ItemSeparatorComponent={ItemSeparator}
      />
    </>
  );
};

const ItemSeparator = () => <View style={{ height: 10 }} />;

const styles = StyleSheet.create({
  searchBar: {
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    fontSize: 15,
  },
  skeletonList: {
    marginTop: 16,
    paddingBottom: 24,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyState: {
    marginTop: 28,
    padding: 16,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});
