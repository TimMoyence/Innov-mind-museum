import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
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
        {museum.distance !== null ? (
          <View style={[styles.distanceBadge, { backgroundColor: theme.primary + '1A' }]}>
            <Ionicons name="location-outline" size={14} color={theme.primary} />
            <Text style={[styles.distanceText, { color: theme.primary }]}>
              {t('museumDirectory.distance_km', { distance: museum.distance })}
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
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    marginTop: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  address: {
    fontSize: 13,
    lineHeight: 18,
    paddingLeft: 28,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 28,
    marginTop: 2,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  distanceUnknown: {
    fontSize: 12,
  },
});
