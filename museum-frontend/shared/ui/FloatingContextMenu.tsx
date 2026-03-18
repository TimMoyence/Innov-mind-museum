import type { JSX } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { liquidColors } from './liquidTheme';

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
export const FloatingContextMenu = ({
  actions,
}: FloatingContextMenuProps): JSX.Element => {
  const handleAction = (action: ContextMenuAction): void => {
    if (action.onPress) {
      action.onPress();
      return;
    }

    Alert.alert(action.label, `${action.label} action is available.`);
  };

  return (
    <BlurView intensity={58} tint='light' style={styles.menuShell}>
      <View style={styles.menuRow}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            onPress={() => handleAction(action)}
            style={styles.menuAction}
          >
            <Ionicons name={action.icon} size={16} color={liquidColors.textPrimary} />
            <Text style={styles.menuLabel}>{action.label}</Text>
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
    borderColor: 'rgba(255,255,255,0.62)',
    backgroundColor: 'rgba(255,255,255,0.42)',
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
    borderColor: 'rgba(148,163,184,0.42)',
    backgroundColor: 'rgba(255,255,255,0.64)',
  },
  menuLabel: {
    fontSize: 11,
    color: liquidColors.textPrimary,
    fontWeight: '600',
  },
});
