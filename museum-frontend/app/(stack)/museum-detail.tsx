import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Renders the museum detail screen showing info and a "Start Chat Here" button. */
export default function MuseumDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const params = useLocalSearchParams<{
    id: string;
    name: string;
    slug: string;
    address: string;
    description: string;
    latitude: string;
    longitude: string;
    distance: string;
  }>();

  const { isCreating, error, setError, startConversation } = useStartConversation();

  const hasCoordinates = Boolean(params.latitude && params.longitude);

  const handleOpenInMaps = () => {
    if (!params.latitude || !params.longitude) return;
    const lat = Number(params.latitude);
    const lng = Number(params.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const name = encodeURIComponent(params.name);
    const url =
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?ll=${String(lat)},${String(lng)}&q=${name}`
        : `https://www.google.com/maps/search/?api=1&query=${String(lat)},${String(lng)}`;
    void Linking.openURL(url);
  };

  const handleStartChat = () => {
    const museumId = parseInt(params.id, 10);
    void startConversation({
      museumMode: true,
      museumId: isNaN(museumId) ? undefined : museumId,
      skipSettings: true,
    });
  };

  return (
    <LiquidScreen
      background={pickMuseumBackground(5)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}
    >
      <Pressable
        style={styles.backButton}
        onPress={() => {
          router.back();
        }}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.heroCard} intensity={60}>
          <Ionicons name="business" size={40} color={theme.primary} style={styles.heroIcon} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>{params.name}</Text>

          {params.address ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                {params.address}
              </Text>
            </View>
          ) : null}

          {params.distance ? (
            <View style={[styles.distanceBadge, { backgroundColor: theme.primary + '1A' }]}>
              <Ionicons name="navigate-outline" size={14} color={theme.primary} />
              <Text style={[styles.distanceText, { color: theme.primary }]}>
                {t('museumDirectory.distance_km', { distance: params.distance })}
              </Text>
            </View>
          ) : null}

          {hasCoordinates ? (
            <Pressable
              style={[
                styles.mapsButton,
                { borderColor: theme.inputBorder, backgroundColor: theme.surface },
              ]}
              onPress={handleOpenInMaps}
              accessibilityRole="button"
              accessibilityLabel={t('museumDirectory.open_in_maps')}
            >
              <Ionicons name="navigate-outline" size={16} color={theme.primary} />
              <Text style={[styles.mapsButtonText, { color: theme.primary }]}>
                {t('museumDirectory.open_in_maps')}
              </Text>
            </Pressable>
          ) : null}
        </GlassCard>

        {params.description ? (
          <GlassCard style={styles.descCard} intensity={52}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
              {t('museumDirectory.detail_title')}
            </Text>
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {params.description}
            </Text>
          </GlassCard>
        ) : null}

        {error ? (
          <ErrorNotice
            message={error}
            onDismiss={() => {
              setError(null);
            }}
          />
        ) : null}

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: theme.primary, shadowColor: theme.shadowColor },
          ]}
          onPress={handleStartChat}
          disabled={isCreating}
          accessibilityRole="button"
          accessibilityLabel={t('museumDirectory.start_chat')}
        >
          {isCreating ? (
            <ActivityIndicator color={theme.primaryContrast} />
          ) : (
            <>
              <Ionicons name="chatbubble-outline" size={18} color={theme.primaryContrast} />
              <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
                {t('museumDirectory.start_chat')}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  backButton: {
    marginBottom: 8,
    alignSelf: 'flex-start',
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 22,
  },
  heroCard: {
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  heroIcon: {
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '700',
  },
  descCard: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  mapsButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
