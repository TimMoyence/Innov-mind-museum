import { useEffect, useMemo, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { DailyArtwork } from '../infrastructure/dailyArtApi';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface DailyArtCardProps {
  artwork: DailyArtwork;
  isSaved: boolean;
  onSave: () => void;
  onSkip: () => void;
}

/** Renders a glass card showcasing the daily artwork with save/skip actions and an expandable fun fact. */
export const DailyArtCard = ({ artwork, isSaved, onSave, onSkip }: DailyArtCardProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [funFactExpanded, setFunFactExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const fadeAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <GlassCard style={styles.card} intensity={58}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {t('dailyArt.title')}
        </Text>

        {artwork.imageUrl && !imageError ? (
          <Image
            source={{ uri: artwork.imageUrl }}
            style={styles.image}
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  imageFallback: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  artist: {
    fontSize: 14,
    textAlign: 'center',
  },
  museum: {
    fontSize: 12,
    textAlign: 'center',
  },
  funFactToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  funFactLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  funFactText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
