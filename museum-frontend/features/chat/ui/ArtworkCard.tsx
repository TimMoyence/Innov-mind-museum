import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, fontSize } from '@/shared/ui/tokens';

interface ArtworkCardProps {
  title: string;
  artist?: string;
  museum?: string;
  room?: string;
  confidence?: number;
}

const confidenceKey = (value?: number): 'high' | 'medium' | 'low' | null => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive null check
  if (value === undefined || value === null) return null;
  if (value >= 0.8) return 'high';
  if (value >= 0.5) return 'medium';
  return 'low';
};

/** Displays a card with detected artwork metadata including title, artist, museum location, and recognition confidence level. */
export const ArtworkCard = ({ title, artist, museum, room, confidence }: ArtworkCardProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const badgeKey = confidenceKey(confidence);
  const badge = badgeKey ? t(`artworkCard.confidence.${badgeKey}`) : null;

  return (
    <GlassCard style={styles.card} intensity={44}>
      <View style={styles.row}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          {artist ? (
            <Text style={[styles.detail, { color: theme.textTertiary }]} numberOfLines={1}>
              {artist}
            </Text>
          ) : null}
          {museum || room ? (
            <Text style={[styles.location, { color: theme.placeholderText }]} numberOfLines={1}>
              {[museum, room].filter(Boolean).join(' — ')}
            </Text>
          ) : null}
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: theme.primaryTint }]}>
            <Text style={[styles.badgeText, { color: theme.primary }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: semantic.chat.bubblePaddingX,
    paddingVertical: semantic.list.itemPaddingYCompact,
    marginTop: semantic.chat.gapSmall,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2.5'],
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  detail: {
    marginTop: space['0.5'],
    fontSize: fontSize.xs,
  },
  location: {
    marginTop: space['0.5'],
    fontSize: semantic.section.labelSize,
  },
  badge: {
    borderRadius: semantic.badge.radius,
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingYTight,
  },
  badgeText: {
    fontSize: space['2.5'],
    fontWeight: '700',
  },
});
