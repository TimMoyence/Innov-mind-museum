import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

import { museumMapViewStyles as styles } from './museumMapView.styles';

interface MuseumMapStatusOverlayProps {
  isEmpty: boolean;
  hasLoadError: boolean;
}

export const MuseumMapStatusOverlay = ({ isEmpty, hasLoadError }: MuseumMapStatusOverlayProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (hasLoadError) {
    return (
      <View style={styles.emptyOverlay} pointerEvents="box-none">
        <GlassCard style={styles.emptyCard} intensity={60}>
          <Text
            style={[styles.emptyText, { color: theme.textPrimary }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {t('museumDirectory.map_error')}
          </Text>
        </GlassCard>
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View style={styles.emptyOverlay} pointerEvents="box-none">
        <GlassCard style={styles.emptyCard} intensity={60}>
          <Text
            style={[styles.emptyText, { color: theme.textPrimary }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('a11y.museum.map_empty')}
          >
            {t('museumDirectory.map_empty')}
          </Text>
        </GlassCard>
      </View>
    );
  }

  return null;
};
