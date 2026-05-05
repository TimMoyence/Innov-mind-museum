import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import type { OpeningHoursDisplay } from '@/features/museum/application/opening-hours.formatter';
import type { useMuseumEnrichment } from '@/features/museum/application/useMuseumEnrichment';

type Enriched = NonNullable<ReturnType<typeof useMuseumEnrichment>['data']>;

interface MuseumDetailEnrichmentProps {
  museumName: string;
  enriched: Enriched | null;
  hoursDisplay: OpeningHoursDisplay | null;
  showEnrichmentLoader: boolean;
  showEmptyEnrichment: boolean;
  showErrorAsEmpty: boolean;
  styles: {
    descCard: StyleProp<ViewStyle>;
    sectionTitle: StyleProp<TextStyle>;
    description: StyleProp<TextStyle>;
    heroImage: StyleProp<ImageStyle>;
    infoRow: StyleProp<ViewStyle>;
    hoursLabel: StyleProp<TextStyle>;
    weeklyLine: StyleProp<TextStyle>;
    contactRow: StyleProp<ViewStyle>;
    contactButton: StyleProp<ViewStyle>;
    contactButtonText: StyleProp<TextStyle>;
    loadingRow: StyleProp<ViewStyle>;
    placeholderText: StyleProp<TextStyle>;
  };
}

const extractHost = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const openExternalUrl = (url: string): void => {
  void Linking.openURL(url).catch(() => undefined);
};

/**
 * Renders the enrichment cards under the museum-detail hero: optional
 * Wikipedia-sourced image + summary, opening hours, contact buttons,
 * and loading / empty placeholders. Pulled out of
 * `app/(stack)/museum-detail.tsx` so the route file stays under the
 * 300 LOC sprint budget. Style tokens are passed in as a typed prop
 * to keep this component purely presentational.
 */
export const MuseumDetailEnrichment = ({
  museumName,
  enriched,
  hoursDisplay,
  showEnrichmentLoader,
  showEmptyEnrichment,
  showErrorAsEmpty,
  styles,
}: MuseumDetailEnrichmentProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const hoursToneColor =
    hoursDisplay?.tone === 'positive'
      ? theme.success
      : hoursDisplay?.tone === 'warning'
        ? theme.warningText
        : theme.textSecondary;

  return (
    <>
      {enriched?.imageUrl ? (
        <Image
          source={{ uri: enriched.imageUrl }}
          style={[styles.heroImage, { backgroundColor: theme.surface }]}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={museumName}
        />
      ) : null}

      {enriched?.summary ? (
        <GlassCard style={styles.descCard} intensity={52}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            {t('museum.about')}
          </Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {enriched.summary}
          </Text>
        </GlassCard>
      ) : null}

      {hoursDisplay ? (
        <GlassCard style={styles.descCard} intensity={52}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            {t('museum.opening_hours')}
          </Text>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={hoursToneColor} />
            <Text style={[styles.hoursLabel, { color: hoursToneColor }]}>
              {hoursDisplay.label}
            </Text>
          </View>
          {hoursDisplay.weeklyLines.map((line) => (
            <Text key={line} style={[styles.weeklyLine, { color: theme.textSecondary }]}>
              {line}
            </Text>
          ))}
        </GlassCard>
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
              accessibilityLabel={t('museum.website')}
            >
              <Ionicons name="globe-outline" size={16} color={theme.primary} />
              <Text style={[styles.contactButtonText, { color: theme.primary }]}>
                {extractHost(enriched.website)}
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
              accessibilityLabel={t('museum.phone')}
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
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.textSecondary} />
          <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
            {t('museum.loading_details')}
          </Text>
        </View>
      ) : null}

      {showEmptyEnrichment || showErrorAsEmpty ? (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          {t('museum.no_extra_info')}
        </Text>
      ) : null}
    </>
  );
};
