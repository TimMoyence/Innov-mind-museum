import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/ui/ErrorState';
import { useTheme } from '@/shared/ui/ThemeContext';

import { formatDistance } from '../application/formatDistance';
import type { OpeningHoursDisplay } from '../application/opening-hours.formatter';
import type { UseMuseumEnrichmentResult } from '../application/useMuseumEnrichment';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import { styles } from './museumSheet.styles';

const DESCRIPTION_MAX_CHARS = 140;
const SUMMARY_MAX_LINES = 5;

const truncate = (text: string | null | undefined, max: number): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
};

const openExternalUrl = (url: string): void => {
  void Linking.openURL(url).catch(() => undefined);
};

interface MuseumSheetEnrichmentBodyProps {
  museum: MuseumWithDistance;
  enrichment: UseMuseumEnrichmentResult;
  enriched: UseMuseumEnrichmentResult['data'];
  hoursDisplay: OpeningHoursDisplay | null;
  hasRichContent: boolean;
  showEnrichmentLoader: boolean;
  hoursToneColor: string;
}

export const MuseumSheetEnrichmentBody = ({
  museum,
  enrichment,
  enriched,
  hoursDisplay,
  hasRichContent,
  showEnrichmentLoader,
  hoursToneColor,
}: MuseumSheetEnrichmentBodyProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const description = truncate(museum.description, DESCRIPTION_MAX_CHARS);
  const distanceMeters = museum.distanceMeters;

  return (
    <>
      {enriched?.imageUrl ? (
        <Image
          source={{ uri: enriched.imageUrl }}
          style={[styles.heroImage, { backgroundColor: theme.surface }]}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={museum.name}
        />
      ) : null}

      {museum.address ? (
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.addressText, { color: theme.textSecondary }]} numberOfLines={2}>
            {museum.address}
          </Text>
        </View>
      ) : null}

      {distanceMeters !== null ? (
        <View style={styles.infoRow}>
          <Ionicons name="navigate-outline" size={16} color={theme.primary} />
          <Text style={[styles.distanceText, { color: theme.primary }]}>
            {formatDistance(distanceMeters, t)}
          </Text>
        </View>
      ) : null}

      {hoursDisplay ? (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
            {t('museumDirectory.enrichment.hours_heading')}
          </Text>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={hoursToneColor} />
            <Text style={[styles.hoursLabel, { color: hoursToneColor }]}>{hoursDisplay.label}</Text>
          </View>
          {hoursDisplay.weeklyLines.map((line) => (
            <Text key={line} style={[styles.weeklyLine, { color: theme.textSecondary }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {enriched?.summary ? (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
            {t('museumDirectory.enrichment.summary_heading')}
          </Text>
          <Text
            style={[styles.summaryText, { color: theme.textSecondary }]}
            numberOfLines={SUMMARY_MAX_LINES}
          >
            {enriched.summary}
          </Text>
        </View>
      ) : description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={3}>
          {description}
        </Text>
      ) : null}

      {enriched?.website || enriched?.phone ? (
        <View style={styles.contactRow}>
          {enriched.website ? (
            <Pressable
              style={[
                styles.contactButton,
                { borderColor: theme.inputBorder, backgroundColor: theme.surface },
              ]}
              onPress={() => {
                openExternalUrl(enriched.website ?? '');
              }}
              accessibilityRole="link"
              accessibilityLabel={t('museumDirectory.enrichment.website')}
            >
              <Ionicons name="globe-outline" size={16} color={theme.primary} />
              <Text style={[styles.contactButtonText, { color: theme.primary }]}>
                {t('museumDirectory.enrichment.website')}
              </Text>
            </Pressable>
          ) : null}
          {enriched.phone ? (
            <Pressable
              style={[
                styles.contactButton,
                { borderColor: theme.inputBorder, backgroundColor: theme.surface },
              ]}
              onPress={() => {
                openExternalUrl(`tel:${enriched.phone ?? ''}`);
              }}
              accessibilityRole="link"
              accessibilityLabel={t('museumDirectory.enrichment.phone')}
            >
              <Ionicons name="call-outline" size={16} color={theme.primary} />
              <Text style={[styles.contactButtonText, { color: theme.primary }]}>
                {enriched.phone}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showEnrichmentLoader ? (
        <View style={styles.infoRow}>
          <ActivityIndicator size="small" color={theme.textSecondary} />
          <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
            {t('museumDirectory.enrichment.loading')}
          </Text>
        </View>
      ) : null}

      {enrichment.status === 'error' && !hasRichContent ? (
        <ErrorState
          variant="inline"
          title={t('museumDirectory.enrichment.failed_title')}
          onRetry={enrichment.refresh}
          retryLabel={t('common.retry')}
          testID="error-notice"
        />
      ) : null}

      {enrichment.status === 'ready' && !hasRichContent && enrichment.data === null ? (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          {t('museumDirectory.enrichment.additional_info_unavailable')}
        </Text>
      ) : null}
    </>
  );
};
