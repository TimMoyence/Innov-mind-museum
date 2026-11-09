import type { JSX } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { HorizontalStrip } from './HorizontalStrip';
import { useTheme } from './ThemeContext';
import { semantic, space } from './tokens';

export interface ContextMenuAction {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  active?: boolean;
  iconOnly?: boolean;
}

interface FloatingContextMenuProps {
  actions: ContextMenuAction[];
  scrollable?: boolean;
}

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
              action.iconOnly && styles.menuActionIconOnly,
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
            {action.iconOnly ? null : (
              <Text
                style={[
                  styles.menuLabel,
                  { color: action.active ? theme.primary : theme.textPrimary },
                ]}
              >
                {action.label}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </BlurView>
  );

  if (scrollable) {
    return <HorizontalStrip contentContainerStyle={styles.scrollContent}>{pill}</HorizontalStrip>;
  }

  return pill;
};

const styles = StyleSheet.create({
  menuShell: {
    borderRadius: semantic.badge.radiusFull,
    borderWidth: semantic.input.borderWidth,
    overflow: 'hidden',
    paddingHorizontal: space['2.5'],
    paddingVertical: semantic.badge.paddingX,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapSmall,
  },
  menuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapTiny,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: semantic.badge.paddingX,
    borderRadius: semantic.badge.radiusFull,
    borderWidth: semantic.input.borderWidth,
  },
  menuActionIconOnly: {
    paddingHorizontal: semantic.badge.paddingX,
  },
  menuLabel: {
    fontSize: semantic.badge.fontSizeSmall,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: space['1'],
  },
});
