import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/shared/ui/ThemeContext';

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
        accessibilityLabel="List view"
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
        accessibilityLabel="Map view"
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
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
