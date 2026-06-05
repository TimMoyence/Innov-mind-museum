import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
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
 * Turns a camelCase / snake_case record key into a human-readable label
 * (e.g. `wheelchairAccess` -> `Wheelchair access`). Pure presentational —
 * the keys are free-form backend data with no guaranteed vocabulary, so they
 * are not run through i18n.
 */
const humanizeKey = (key: string): string => {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (spaced.length === 0) {
    return key;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/**
 * Flattens a free-form rich JSONB record into readable `key : value` lines.
 * Recurses into nested objects, joins arrays with commas, and stringifies
 * primitives — guaranteeing the raw `[object Object]` string is never rendered.
 */
const flattenRecordToLines = (record: Record<string, unknown>): string[] => {
  const renderValue = (value: unknown): string | null => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      const parts = value
        .map((item) => renderValue(item))
        .filter((part): part is string => part !== null && part.length > 0);
      return parts.length > 0 ? parts.join(', ') : null;
    }
    if (typeof value === 'object') {
      const parts = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => {
          const rendered = renderValue(v);
          return rendered !== null && rendered.length > 0
            ? `${humanizeKey(k)} : ${rendered}`
            : null;
        })
        .filter((part): part is string => part !== null);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    return null;
  };

  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    const rendered = renderValue(value);
    if (rendered !== null && rendered.length > 0) {
      lines.push(`${humanizeKey(key)} : ${rendered}`);
    }
  }
  return lines;
};

/** A non-null record carrying at least one entry — the precondition to render a rich section. */
const isPopulatedRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value as Record<string, unknown>).length > 0;

/**
 * Renders the enrichment cards under the museum-detail hero: optional
 * Wikipedia-sourced image + summary, opening hours, contact buttons, the four
 * rich JSONB sections (admission / collections / exhibitions / accessibility),
 * and loading-skeleton / graceful-empty placeholders. Pulled out of
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

  /** The four rich sections, in display order. Hidden when the field is null/empty. */
  const richSections: { key: string; title: string; record: Record<string, unknown> }[] = [];
  if (isPopulatedRecord(enriched?.admissionFees)) {
    richSections.push({
      key: 'admission',
      title: t('museum.admission'),
      record: enriched.admissionFees,
    });
  }
  if (isPopulatedRecord(enriched?.collections)) {
    richSections.push({
      key: 'collections',
      title: t('museum.collections'),
      record: enriched.collections,
    });
  }
  if (isPopulatedRecord(enriched?.currentExhibitions)) {
    richSections.push({
      key: 'exhibitions',
      title: t('museum.exhibitions'),
      record: enriched.currentExhibitions,
    });
  }
  if (isPopulatedRecord(enriched?.accessibility)) {
    richSections.push({
      key: 'accessibility',
      title: t('museum.accessibility'),
      record: enriched.accessibility,
    });
  }

  const showSkeleton = showEnrichmentLoader && !enriched;

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
            <Text style={[styles.hoursLabel, { color: hoursToneColor }]}>{hoursDisplay.label}</Text>
          </View>
          {hoursDisplay.weeklyLines.map((line) => (
            <Text key={line} style={[styles.weeklyLine, { color: theme.textSecondary }]}>
              {line}
            </Text>
          ))}
        </GlassCard>
      ) : null}

      {richSections.map((section) => (
        <GlassCard key={section.key} style={styles.descCard} intensity={52}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{section.title}</Text>
          {flattenRecordToLines(section.record).map((line) => (
            <Text key={line} style={[styles.description, { color: theme.textSecondary }]}>
              {line}
            </Text>
          ))}
        </GlassCard>
      ))}

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

      {showSkeleton ? (
        <View
          testID="museum-detail-skeleton"
          accessibilityRole="progressbar"
          accessibilityLabel={t('museum.loading_details')}
        >
          <View style={[skeletonStyles.titleBar, { backgroundColor: theme.surface }]} />
          <View style={[skeletonStyles.lineFull, { backgroundColor: theme.surface }]} />
          <View style={[skeletonStyles.lineWide, { backgroundColor: theme.surface }]} />
          <View style={[skeletonStyles.lineShort, { backgroundColor: theme.surface }]} />
        </View>
      ) : null}

      {showEmptyEnrichment || showErrorAsEmpty ? (
        <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
          {t('museum.info_coming_soon')}
        </Text>
      ) : null}
    </>
  );
};

/**
 * Skeleton placeholder bars shown while enrichment loads. Backgrounds are
 * applied inline from the theme (`theme.surface`) since the colour is
 * runtime-themed; the static geometry lives here to keep the JSX clean.
 */
const skeletonStyles = StyleSheet.create({
  titleBar: { height: 18, width: '40%', borderRadius: 6, marginBottom: 12 },
  lineFull: { height: 12, width: '100%', borderRadius: 6, marginBottom: 8 },
  lineWide: { height: 12, width: '85%', borderRadius: 6, marginBottom: 8 },
  lineShort: { height: 12, width: '60%', borderRadius: 6 },
});
