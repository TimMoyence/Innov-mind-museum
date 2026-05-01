import { useEffect, useMemo, useState } from 'react';
import { Animated as RNAnimated, Pressable, StyleSheet, Text, View } from 'react-native';
import ReAnimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { DailyArtwork } from '../infrastructure/dailyArtApi';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, lineHeightPx } from '@/shared/ui/tokens';

interface DailyArtCardProps {
  artwork: DailyArtwork;
  isSaved: boolean;
  onSave: () => void;
  onSkip: () => void;
  /** Optional shared value from parent ScrollView. When provided, the hero image
   *  translates up at 50% of scroll speed and scales 1.0 → 1.05 over 100 px. */
  scrollY?: SharedValue<number>;
}

/** Renders a glass card showcasing the daily artwork with save/skip actions and an expandable fun fact. */
export const DailyArtCard = ({ artwork, isSaved, onSave, onSkip, scrollY }: DailyArtCardProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [funFactExpanded, setFunFactExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const fadeAnim = useMemo(() => new RNAnimated.Value(reduceMotion ? 1 : 0), [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      // WCAG 2.3.3: skip the entrance fade.
      fadeAnim.setValue(1);
      return;
    }
    RNAnimated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, reduceMotion]);

  const imageAnimatedStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    const y = scrollY.value;
    return {
      transform: [
        { translateY: interpolate(y, [0, 200], [0, -100], Extrapolation.CLAMP) },
        { scale: interpolate(y, [0, 100], [1.0, 1.05], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <RNAnimated.View style={{ opacity: fadeAnim }}>
      <GlassCard style={styles.card} intensity={58}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {t('dailyArt.title')}
        </Text>

        {artwork.imageUrl && !imageError ? (
          <ReAnimated.Image
            source={{ uri: artwork.imageUrl }}
            style={[styles.image, imageAnimatedStyle]}
            resizeMode="cover"
            onError={() => {
              setImageError(true);
            }}
            accessibilityLabel={artwork.title}
          />
        ) : (
          <View style={[styles.imageFallback, { backgroundColor: theme.surface }]}>
            <Ionicons name="image-outline" size={40} color={theme.textTertiary} />
          </View>
        )}

        <Text style={[styles.title, { color: theme.textPrimary }]}>{artwork.title}</Text>
        <Text style={[styles.artist, { color: theme.textSecondary }]}>
          {t('dailyArt.by')} {artwork.artist}
          {artwork.year ? ` (${artwork.year})` : ''}
        </Text>

        {artwork.museum ? (
          <Text style={[styles.museum, { color: theme.textTertiary }]}>{artwork.museum}</Text>
        ) : null}

        {artwork.funFact ? (
          <Pressable
            style={styles.funFactToggle}
            onPress={() => {
              setFunFactExpanded((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: funFactExpanded }}
          >
            <Ionicons
              name={funFactExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={theme.primary}
            />
            <Text style={[styles.funFactLabel, { color: theme.primary }]}>
              {t('dailyArt.fun_fact')}
            </Text>
          </Pressable>
        ) : null}

        {funFactExpanded && artwork.funFact ? (
          <Text style={[styles.funFactText, { color: theme.textSecondary }]}>
            {artwork.funFact}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            style={[
              styles.actionButton,
              { borderColor: theme.inputBorder, backgroundColor: theme.surface },
            ]}
            onPress={onSave}
            disabled={isSaved}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? t('dailyArt.saved') : t('dailyArt.save')}
          >
            <Ionicons
              name={isSaved ? 'heart' : 'heart-outline'}
              size={16}
              color={isSaved ? theme.error : theme.textPrimary}
            />
            <Text style={[styles.actionText, { color: isSaved ? theme.error : theme.textPrimary }]}>
              {isSaved ? t('dailyArt.saved') : t('dailyArt.save')}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.actionButton,
              { borderColor: theme.inputBorder, backgroundColor: theme.surface },
            ]}
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={t('dailyArt.skip')}
          >
            <Ionicons name="close-outline" size={16} color={theme.textPrimary} />
            <Text style={[styles.actionText, { color: theme.textPrimary }]}>
              {t('dailyArt.skip')}
            </Text>
          </Pressable>
        </View>
      </GlassCard>
    </RNAnimated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  sectionTitle: {
    fontSize: semantic.card.captionSize,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: semantic.media.artworkHeight,
    borderRadius: semantic.card.radiusCompact,
  },
  imageFallback: {
    width: '100%',
    height: semantic.media.artworkHeight,
    borderRadius: semantic.card.radiusCompact,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: semantic.card.titleSize,
    fontWeight: '700',
    textAlign: 'center',
  },
  artist: {
    fontSize: semantic.card.bodySize,
    textAlign: 'center',
  },
  museum: {
    fontSize: semantic.card.captionSize,
    textAlign: 'center',
  },
  funFactToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: semantic.card.gapTiny,
    paddingVertical: space['1'],
  },
  funFactLabel: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  funFactText: {
    fontSize: semantic.form.labelSize,
    lineHeight: lineHeightPx['19'],
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: space['2.5'],
    marginTop: space['1'],
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['1.5'],
    borderWidth: semantic.input.borderWidth,
    borderRadius: semantic.card.radiusCompact,
    paddingVertical: space['2.5'],
  },
  actionText: {
    fontSize: semantic.button.fontSize,
    fontWeight: '600',
  },
});
