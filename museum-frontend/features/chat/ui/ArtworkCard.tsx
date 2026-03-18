import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { liquidColors } from '@/shared/ui/liquidTheme';

interface ArtworkCardProps {
  title: string;
  artist?: string;
  museum?: string;
  room?: string;
  confidence?: number;
}

const confidenceLabel = (value?: number): string | null => {
  if (value === undefined || value === null) return null;
  if (value >= 0.8) return 'High';
  if (value >= 0.5) return 'Medium';
  return 'Low';
};

/** Displays a card with detected artwork metadata including title, artist, museum location, and recognition confidence level. */
export const ArtworkCard = ({ title, artist, museum, room, confidence }: ArtworkCardProps) => {
  const badge = confidenceLabel(confidence);

  return (
    <GlassCard style={styles.card} intensity={44}>
      <View style={styles.row}>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {artist ? <Text style={styles.detail} numberOfLines={1}>{artist}</Text> : null}
          {museum || room ? (
            <Text style={styles.location} numberOfLines={1}>
              {[museum, room].filter(Boolean).join(' — ')}
            </Text>
          ) : null}
        </View>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: liquidColors.textPrimary,
  },
  detail: {
    marginTop: 2,
    fontSize: 12,
    color: '#475569',
  },
  location: {
    marginTop: 2,
    fontSize: 11,
    color: '#64748B',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(30, 64, 175, 0.12)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: liquidColors.primary,
  },
});
