import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { components } from '@/shared/api/generated/openapi';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

import { ImageCompareCard } from './ImageCompareCard';

type CompareMatch = components['schemas']['CompareMatch'];

interface ImageCompareCarouselProps {
  matches: CompareMatch[];
  onMatchPress: (qid: string) => void;
}

const SNAP_INTERVAL = 220 + 8;

export const ImageCompareCarousel = React.memo(
  ({ matches, onMatchPress }: ImageCompareCarouselProps) => {
    const { theme } = useTheme();
    const { t } = useTranslation();

    const renderItem: ListRenderItem<CompareMatch> = useCallback(
      ({ item }) => <ImageCompareCard match={item} onPress={onMatchPress} />,
      [onMatchPress],
    );

    const keyExtractor = useCallback((m: CompareMatch) => m.qid, []);

    return (
      <View style={styles.container}>
        <Text style={[styles.header, { color: theme.textPrimary }]} accessibilityRole="header">
          {t('chat.compare.title')}
        </Text>
        {matches.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]} numberOfLines={3}>
              {t('chat.compare.empty')}
            </Text>
          </View>
        ) : (
          <FlatList
            horizontal
            data={matches}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP_INTERVAL}
            decelerationRate="fast"
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    );
  },
);
ImageCompareCarousel.displayName = 'ImageCompareCarousel';

const styles = StyleSheet.create({
  container: {
    marginTop: semantic.chat.gap,
    marginBottom: semantic.chat.gap,
  },
  header: {
    fontSize: fontSize.base,
    fontWeight: '700',
    marginBottom: semantic.chat.gapSmall,
    paddingHorizontal: space['1'],
  },
  emptyContainer: {
    paddingHorizontal: semantic.card.padding,
    paddingVertical: semantic.card.paddingCompact,
  },
  emptyText: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
  },
  listContent: {
    flexDirection: 'row',
  },
});
