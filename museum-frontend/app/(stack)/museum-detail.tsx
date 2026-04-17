import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { formatDistance } from '@/features/museum/application/formatDistance';
import { openInNativeMaps } from '@/features/museum/application/openInNativeMaps';
import { semantic, space, fontSize, radius } from '@/shared/ui/tokens';
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
    distanceMeters: string;
  }>();

  const parsedDistanceMeters = params.distanceMeters ? Number(params.distanceMeters) : NaN;
  const hasDistance = !Number.isNaN(parsedDistanceMeters);

  const { isCreating, error, setError, startConversation } = useStartConversation();

  const hasCoordinates = Boolean(params.latitude && params.longitude);

  const handleOpenInMaps = () => {
    openInNativeMaps({
      latitude: params.latitude,
      longitude: params.longitude,
      name: params.name,
    });
  };

  const handleStartChat = () => {
    const museumId = parseInt(params.id, 10);
    const lat = params.latitude ? Number(params.latitude) : undefined;
    const lng = params.longitude ? Number(params.longitude) : undefined;
    const coordinates =
      lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
        ? { lat, lng }
        : undefined;

    void startConversation({
      museumMode: true,
      museumId: isNaN(museumId) || museumId <= 0 ? undefined : museumId,
      museumName: params.name || undefined,
      museumAddress: params.address || undefined,
      coordinates,
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

          {hasDistance ? (
            <View style={[styles.distanceBadge, { backgroundColor: theme.primary + '1A' }]}>
              <Ionicons name="navigate-outline" size={14} color={theme.primary} />
              <Text style={[styles.distanceText, { color: theme.primary }]}>
                {formatDistance(parsedDistanceMeters, t)}
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
    paddingHorizontal: space['4.5'],
    paddingBottom: semantic.screen.padding,
  },
  backButton: {
    marginBottom: semantic.card.gapSmall,
    alignSelf: 'flex-start',
    padding: space['1'],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: semantic.screen.gapSmall,
    paddingBottom: space['5.5'],
  },
  heroCard: {
    padding: semantic.modal.padding,
    alignItems: 'center',
    gap: space['2.5'],
  },
  heroIcon: {
    marginBottom: space['1'],
  },
  title: {
    fontSize: fontSize['2xl+'],
    fontWeight: '700',
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.section.gapTight,
  },
  infoText: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
    flex: 1,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapTiny,
    paddingHorizontal: space['2.5'],
    paddingVertical: space['1'],
    borderRadius: radius.DEFAULT,
  },
  distanceText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '700',
  },
  descCard: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  sectionTitle: {
    fontSize: fontSize['lg-'],
    fontWeight: '700',
  },
  description: {
    fontSize: fontSize.sm,
    lineHeight: space['5.5'],
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: semantic.section.gapTight,
    borderWidth: semantic.input.borderWidth,
    borderRadius: radius.DEFAULT,
    paddingHorizontal: space['3.5'],
    paddingVertical: space['2'],
  },
  mapsButtonText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: space['1'],
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingYCompact,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: semantic.card.gapSmall,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
});
