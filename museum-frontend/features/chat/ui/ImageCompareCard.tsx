import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import type { components } from '@/shared/api/generated/openapi';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, radius, semantic, space } from '@/shared/ui/tokens';

type CompareMatch = components['schemas']['CompareMatch'];

interface ImageCompareCardProps {
  match: CompareMatch;
  locale: 'fr' | 'en';
  onPress: (qid: string) => void;
}

const CARD_WIDTH = 220;
const CARD_MIN_HEIGHT = 260;
const THUMB_HEIGHT = 140;

/**
 * Renders a single visual-similarity match (C3 / Phase 8) — thumbnail, title,
 * artist, rationale, and an attribution row when the source license requires
 * one (CC-BY-SA per spec.md). Distinct from the C2 `ImageCarousel` thumb
 * (D7 — different surface intent).
 *
 * Accessibility (D5 / UFR-008):
 *   - `accessibilityLabel` follows the localized template
 *     "Œuvre similaire : {title}, {artist}, {rationale}" (FR) /
 *     "Similar artwork: {title}, {artist}, {rationale}" (EN).
 *   - Pressable touch target ≥ 44×44pt (WCAG 2.5.5).
 */
export const ImageCompareCard = React.memo(({ match, locale, onPress }: ImageCompareCardProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const artist = match.facts.artist ?? '';
  const a11yLabel =
    locale === 'fr'
      ? `Œuvre similaire : ${match.title}, ${artist}, ${match.rationale}`
      : `Similar artwork: ${match.title}, ${artist}, ${match.rationale}`;

  const handlePress = () => {
    onPress(match.qid);
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={styles.pressable}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <GlassCard style={styles.card} intensity={44}>
        <View style={[styles.thumbContainer, { backgroundColor: theme.surface }]}>
          <Image
            source={{ uri: match.imageUrl }}
            style={styles.thumb}
            contentFit="cover"
            recyclingKey={match.qid}
            transition={150}
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
          />
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>
            {match.title}
          </Text>
          {artist.length > 0 ? (
            <Text style={[styles.artist, { color: theme.textTertiary }]} numberOfLines={1}>
              {artist}
            </Text>
          ) : null}
          <Text style={[styles.rationale, { color: theme.textSecondary }]} numberOfLines={3}>
            {match.rationale}
          </Text>
          {match.attribution ? (
            <View style={styles.attributionRow}>
              <Text
                style={[styles.attributionLabel, { color: theme.placeholderText }]}
                numberOfLines={1}
              >
                {t('chat.compare.attribution')}
              </Text>
              <Text
                style={[styles.attributionText, { color: theme.placeholderText }]}
                numberOfLines={2}
              >
                {match.attribution}
              </Text>
            </View>
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
});
ImageCompareCard.displayName = 'ImageCompareCard';

const styles = StyleSheet.create({
  pressable: {
    minWidth: CARD_WIDTH,
    minHeight: CARD_MIN_HEIGHT,
    marginRight: semantic.chat.gap,
  },
  card: {
    width: CARD_WIDTH,
    minHeight: CARD_MIN_HEIGHT,
    padding: 0,
    overflow: 'hidden',
  },
  thumbContainer: {
    width: '100%',
    height: THUMB_HEIGHT,
    overflow: 'hidden',
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  thumb: {
    width: '100%',
    height: THUMB_HEIGHT,
  },
  body: {
    paddingHorizontal: semantic.card.padding,
    paddingVertical: semantic.card.paddingCompact,
    gap: space['1'],
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  artist: {
    fontSize: fontSize.xs,
  },
  rationale: {
    fontSize: semantic.section.captionSize,
    lineHeight: space['4'],
    marginTop: space['1'],
  },
  attributionRow: {
    marginTop: space['1.5'],
    gap: space['0.5'],
  },
  attributionLabel: {
    fontSize: semantic.section.labelSize,
    fontWeight: '600',
  },
  attributionText: {
    fontSize: semantic.section.labelSize,
  },
});
