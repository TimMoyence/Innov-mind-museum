import type { JSX } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from './ThemeContext';

/** Describes a single action item rendered inside a FloatingContextMenu. */
export interface ContextMenuAction {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}

interface FloatingContextMenuProps {
  actions: ContextMenuAction[];
}

/** Renders a blurred floating pill-shaped menu bar with icon-labeled action buttons. */
export const FloatingContextMenu = ({ actions }: FloatingContextMenuProps): JSX.Element => {
  const { theme } = useTheme();

  const handleAction = (action: ContextMenuAction): void => {
    void Haptics.selectionAsync();
    if (action.onPress) {
      action.onPress();
      return;
    }

    Alert.alert(action.label, `${action.label} action is available.`);
  };

  return (
    <BlurView
      intensity={58}
      tint={theme.blurTint}
      style={[
        styles.menuShell,
        { borderColor: theme.glassBorder, backgroundColor: theme.glassBackground },
      ]}
    >
      <View style={styles.menuRow}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            onPress={() => {
              handleAction(action);
            }}
            style={[
              styles.menuAction,
              { borderColor: theme.cardBorder, backgroundColor: theme.surface },
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Ionicons name={action.icon} size={16} color={theme.textPrimary} />
            <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  menuShell: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  menuLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
