import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

type ViewMode = 'list' | 'map';

interface ViewModeToggleProps {
  mode: ViewMode;
  onToggle: (mode: ViewMode) => void;
}

/**
 * Compact two-button toggle for switching between list and map views.
 * Uses Ionicons list-outline / map-outline with themed active/inactive states.
 */
export const ViewModeToggle = ({ mode, onToggle }: ViewModeToggleProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
      ]}
      accessibilityRole="radiogroup"
    >
      <Pressable
        style={[styles.button, mode === 'list' && { backgroundColor: theme.primary }]}
        onPress={() => {
          onToggle('list');
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected: mode === 'list' }}
        accessibilityLabel={t('a11y.museum.list_view')}
      >
        <Ionicons
          name="list-outline"
          size={18}
          color={mode === 'list' ? theme.primaryContrast : theme.textSecondary}
        />
      </Pressable>

      <Pressable
        style={[styles.button, mode === 'map' && { backgroundColor: theme.primary }]}
        onPress={() => {
          onToggle('map');
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected: mode === 'map' }}
        accessibilityLabel={t('a11y.museum.map_view')}
      >
        <Ionicons
          name="map-outline"
          size={18}
          color={mode === 'map' ? theme.primaryContrast : theme.textSecondary}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: semantic.card.radiusCompact,
    borderWidth: semantic.input.borderWidth,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  button: {
    paddingHorizontal: space['3.5'],
    paddingVertical: semantic.card.gapSmall,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
