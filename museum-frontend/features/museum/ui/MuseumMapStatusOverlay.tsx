import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

import { museumMapViewStyles as styles } from './museumMapView.styles';

interface MuseumMapStatusOverlayProps {
  /** Empty state takes priority over the map UI when true and no error is showing. */
  isEmpty: boolean;
  hasLoadError: boolean;
}

/**
 * Renders the optional empty / error overlays for `MuseumMapView`. Extracted
 * from the component shell so the view file stays under the 300 LOC budget;
 * a11y roles + live-region semantics are preserved verbatim so the existing
 * test suite continues to pass without edits.
 */
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
