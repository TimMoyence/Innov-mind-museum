import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { formatDistance } from '@/features/museum/application/formatDistance';
import { formatOpeningHours } from '@/features/museum/application/opening-hours.formatter';
import { openInNativeMaps } from '@/features/museum/application/openInNativeMaps';
import { useMuseumEnrichment } from '@/features/museum/application/useMuseumEnrichment';
import { MuseumDetailEnrichment } from '@/features/museum/ui/MuseumDetailEnrichment';
import { ErrorState } from '@/shared/ui/ErrorState';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { styles } from './museum-detail.styles';

/** Renders the museum detail screen showing info and a "Start Chat Here" button. */
export default function MuseumDetailScreen() {
  const { t, i18n } = useTranslation();
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

  // Enrichment: only enabled for real DB-backed museums (positive numeric ids).
  // Synthetic OSM entries arrive without a usable id, so the hook stays idle.
  const parsedMuseumId = params.id ? parseInt(params.id, 10) : NaN;
  const enrichmentMuseumId =
    Number.isFinite(parsedMuseumId) && parsedMuseumId > 0 ? parsedMuseumId : null;
  const enrichment = useMuseumEnrichment(enrichmentMuseumId, i18n.language);
  const enriched = enrichment.data;

  const hoursDisplay = useMemo(
    () => (enriched ? formatOpeningHours(enriched.openingHours, t) : null),
    [enriched, t],
  );

  const hasRichContent =
    enriched !== null &&
    (enriched.imageUrl !== null ||
      enriched.summary !== null ||
      enriched.website !== null ||
      enriched.phone !== null ||
      hoursDisplay !== null);
  const showEnrichmentLoader = enrichment.status === 'loading' && !enriched;
  const showEmptyEnrichment = enrichment.status === 'ready' && enriched !== null && !hasRichContent;
  const showErrorAsEmpty = enrichment.status === 'error' && !hasRichContent;

  const handleOpenInMaps = () => {
    openInNativeMaps({
      latitude: params.latitude,
      longitude: params.longitude,
      name: params.name,
    });
  };

  const handleStartChat = () => {
    const lat = params.latitude ? Number(params.latitude) : undefined;
    const lng = params.longitude ? Number(params.longitude) : undefined;
    const coordinates =
      lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
        ? { lat, lng }
        : undefined;

    void startConversation({
      museumMode: true,
      museumId: Number.isFinite(parsedMuseumId) && parsedMuseumId > 0 ? parsedMuseumId : undefined,
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

        <MuseumDetailEnrichment
          museumName={params.name}
          enriched={enriched}
          hoursDisplay={hoursDisplay}
          showEnrichmentLoader={showEnrichmentLoader}
          showEmptyEnrichment={showEmptyEnrichment}
          showErrorAsEmpty={showErrorAsEmpty}
          styles={styles}
        />

        {error ? (
          <ErrorState
            variant="inline"
            title={error}
            onDismiss={() => {
              setError(null);
            }}
            testID="error-notice"
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
