import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { City } from '@/features/museum/infrastructure/cityCatalog';
import type { CityPackState } from '@/features/museum/application/useOfflinePacks';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface CityPackRowProps {
  city: City;
  state: CityPackState;
  onDownload: (city: City) => void;
  onDelete: (city: City) => void;
}

const ONE_MB = 1024 * 1024;
const formatBytes = (bytes: number): string =>
  bytes < ONE_MB
    ? `${Math.round(bytes / 1024).toString()} KB`
    : `${(bytes / ONE_MB).toFixed(1)} MB`;

/**
 * Single-city row for the Offline Maps settings screen. Renders the city
 * name, current download state (absent, downloading with percentage, or
 * ready with bytes on disk), and the primary action (Download or Delete)
 * wrapped in a GlassCard so it sits within the visual system used elsewhere
 * in the app.
 */
export const CityPackRow = ({ city, state, onDownload, onDelete }: CityPackRowProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const renderAction = () => {
    if (state.status === 'active') {
      return (
        <View style={styles.actionPlaceholder}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.percentage, { color: theme.textSecondary }]}>
            {`${Math.round(state.percentage).toString()}%`}
          </Text>
        </View>
      );
    }
    if (state.status === 'complete') {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('offlineMaps.delete_a11y', { city: city.name })}
          style={[styles.button, { borderColor: theme.cardBorder }]}
          onPress={() => {
            onDelete(city);
          }}
        >
          <Text style={[styles.buttonText, { color: theme.textPrimary }]}>
            {t('offlineMaps.delete')}
          </Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('offlineMaps.download_a11y', { city: city.name })}
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={() => {
          onDownload(city);
        }}
      >
        <Text style={[styles.buttonText, { color: theme.primaryContrast }]}>
          {t('offlineMaps.download')}
        </Text>
      </Pressable>
    );
  };

  return (
    <GlassCard style={styles.card} intensity={56}>
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.textPrimary }]}>{city.name}</Text>
        {state.status === 'complete' ? (
          <Text style={[styles.detail, { color: theme.textSecondary }]}>
            {t('offlineMaps.ready_size', { size: formatBytes(state.bytesOnDisk) })}
          </Text>
        ) : null}
        {state.status === 'active' ? (
          <Text style={[styles.detail, { color: theme.textSecondary }]}>
            {t('offlineMaps.downloading')}
          </Text>
        ) : null}
        {state.status === 'absent' ? (
          <Text style={[styles.detail, { color: theme.textSecondary }]}>
            {t('offlineMaps.absent')}
          </Text>
        ) : null}
      </View>
      {renderAction()}
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: semantic.card.padding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['2'],
  },
  info: {
    flex: 1,
    gap: space['0.5'],
  },
  name: {
    fontWeight: '700',
    fontSize: semantic.card.bodySize,
  },
  detail: {
    fontSize: semantic.card.captionSize,
  },
  actionPlaceholder: {
    alignItems: 'center',
    gap: space['0.5'],
  },
  percentage: {
    fontSize: semantic.card.captionSize,
    fontVariant: ['tabular-nums'],
  },
  button: {
    paddingVertical: semantic.button.paddingYCompact,
    paddingHorizontal: semantic.button.paddingX,
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: semantic.button.fontSize,
  },
});
