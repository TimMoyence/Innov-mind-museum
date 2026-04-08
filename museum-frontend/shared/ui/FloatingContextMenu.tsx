import type { JSX } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  /** When true the button is visually highlighted (e.g. active toggle). */
  active?: boolean;
}

interface FloatingContextMenuProps {
  actions: ContextMenuAction[];
  /**
   * When true, the pill is wrapped in a horizontal ScrollView so its content
   * can scroll horizontally if it exceeds the available width. Defaults to false
   * to preserve the existing layout for callers that rely on the static pill.
   */
  scrollable?: boolean;
}

/** Renders a blurred floating pill-shaped menu bar with icon-labeled action buttons. */
export const FloatingContextMenu = ({
  actions,
  scrollable = false,
}: FloatingContextMenuProps): JSX.Element => {
  const { theme } = useTheme();

  const handleAction = (action: ContextMenuAction): void => {
    void Haptics.selectionAsync();
    if (action.onPress) {
      action.onPress();
      return;
    }

    Alert.alert(action.label, `${action.label} action is available.`);
  };

  const pill = (
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
              {
                borderColor: action.active ? theme.primary : theme.cardBorder,
                backgroundColor: theme.surface,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Ionicons
              name={action.icon}
              size={16}
              color={action.active ? theme.primary : theme.textPrimary}
            />
            <Text
              style={[
                styles.menuLabel,
                { color: action.active ? theme.primary : theme.textPrimary },
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </BlurView>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {pill}
      </ScrollView>
    );
  }

  return pill;
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  menuLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
});
