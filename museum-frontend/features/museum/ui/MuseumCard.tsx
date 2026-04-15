import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';
import { formatDistance } from '../application/formatDistance';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';

interface MuseumCardProps {
  museum: MuseumWithDistance;
  onPress: (museum: MuseumWithDistance) => void;
}

/** Pressable card displaying museum name, address, and distance badge. */
export const MuseumCard = ({ museum, onPress }: MuseumCardProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      style={[
        styles.card,
        { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
      ]}
      onPress={() => {
        onPress(museum);
      }}
      accessibilityRole="button"
      accessibilityLabel={museum.name}
    >
      <View style={styles.header}>
        <Ionicons name="business-outline" size={20} color={theme.primary} style={styles.icon} />
        <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
          {museum.name}
        </Text>
      </View>

      {museum.address ? (
        <Text style={[styles.address, { color: theme.textSecondary }]} numberOfLines={2}>
          {museum.address}
        </Text>
      ) : null}

      <View style={styles.footer}>
        {museum.distanceMeters !== null ? (
          <View style={[styles.distanceBadge, { backgroundColor: theme.primary + '1A' }]}>
            <Ionicons name="location-outline" size={14} color={theme.primary} />
            <Text style={[styles.distanceText, { color: theme.primary }]}>
              {formatDistance(museum.distanceMeters, t)}
            </Text>
          </View>
        ) : (
          <Text style={[styles.distanceUnknown, { color: theme.textSecondary }]}>
            {t('museumDirectory.distance_unknown')}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: semantic.card.paddingLarge,
    borderWidth: semantic.input.borderWidth,
    padding: space['3.5'],
    gap: space['1.5'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapSmall,
  },
  icon: {
    marginTop: 1,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '700',
    flex: 1,
  },
  address: {
    fontSize: semantic.form.labelSize,
    lineHeight: semantic.card.paddingLarge,
    paddingLeft: semantic.screen.paddingXL,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: semantic.screen.paddingXL,
    marginTop: space['0.5'],
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapTiny,
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingY,
    borderRadius: radius.DEFAULT,
  },
  distanceText: {
    fontSize: semantic.badge.fontSize,
    fontWeight: '700',
  },
  distanceUnknown: {
    fontSize: semantic.badge.fontSize,
  },
});
