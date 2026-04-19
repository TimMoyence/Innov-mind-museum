import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useOfflinePacks } from '@/features/museum/application/useOfflinePacks';
import type { City } from '@/features/museum/infrastructure/cityCatalog';
import { CITY_CATALOG } from '@/features/museum/infrastructure/cityCatalog';
import { useAutoPreCachePreference } from '@/features/settings/application/useAutoPreCachePreference';
import { reportError } from '@/shared/observability/errorReporting';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

import { CityPackRow } from './CityPackRow';

/**
 * Settings surface that lists the catalog cities alongside their offline
 * pack status and exposes the auto pre-cache opt-in toggle. Download and
 * delete mutations flow through the `useOfflinePacks` hook; the toggle is
 * persisted via `expo-secure-store`. Geofence auto pre-cache wiring lives
 * in a separate hook (useGeofencePreCache) that consumes the same
 * preference.
 */
export const OfflineMapsSettings = () => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { packsByCity, isLoading, download, remove } = useOfflinePacks();
  const {
    enabled: autoPreCacheEnabled,
    isLoading: isAutoPreCacheLoading,
    setEnabled: setAutoPreCacheEnabled,
  } = useAutoPreCachePreference();

  const handleDownload = useCallback(
    (city: City) => {
      void download(city).catch((error: unknown) => {
        reportError(error, {
          component: 'OfflineMapsSettings',
          action: 'download',
          cityId: city.id,
        });
      });
    },
    [download],
  );

  const handleDelete = useCallback(
    (city: City) => {
      void remove(city.id).catch((error: unknown) => {
        reportError(error, {
          component: 'OfflineMapsSettings',
          action: 'remove',
          cityId: city.id,
        });
      });
    },
    [remove],
  );

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{t('offlineMaps.title')}</Text>
      <Text style={[styles.intro, { color: theme.textSecondary }]}>{t('offlineMaps.intro')}</Text>

      <GlassCard style={styles.toggleCard} intensity={56}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>
              {t('offlineMaps.auto_precache')}
            </Text>
            <Text style={[styles.toggleHint, { color: theme.textSecondary }]}>
              {t('offlineMaps.auto_precache_hint')}
            </Text>
          </View>
          {isAutoPreCacheLoading ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <Switch
              accessibilityLabel={t('offlineMaps.auto_precache')}
              value={autoPreCacheEnabled}
              onValueChange={(next) => {
                void setAutoPreCacheEnabled(next);
              }}
              trackColor={{ false: theme.cardBorder, true: theme.primary }}
            />
          )}
        </View>
      </GlassCard>

      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {CITY_CATALOG.map((city) => (
            <CityPackRow
              key={city.id}
              city={city}
              state={packsByCity[city.id] ?? { status: 'absent' }}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: semantic.screen.paddingLarge,
    gap: space['3'],
  },
  title: {
    fontSize: semantic.card.titleSize,
    fontWeight: '700',
  },
  intro: {
    fontSize: semantic.card.bodySize,
    lineHeight: semantic.card.bodySize * 1.4,
  },
  toggleCard: {
    padding: semantic.card.padding,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    gap: space['0.5'],
  },
  toggleLabel: {
    fontWeight: '600',
    fontSize: semantic.card.bodySize,
  },
  toggleHint: {
    fontSize: semantic.card.captionSize,
  },
  list: {
    gap: space['2'],
  },
  loader: {
    marginVertical: space['4'],
  },
});
