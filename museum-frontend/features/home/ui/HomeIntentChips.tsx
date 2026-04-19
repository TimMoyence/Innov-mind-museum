import type { JSX } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

export type HomeIntent = 'vocal' | 'camera' | 'walk';

interface HomeIntentChipsProps {
  onPress: (intent: HomeIntent) => void;
  disabled?: boolean;
}

interface ChipDefinition {
  readonly intent: HomeIntent;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly hint: string;
  readonly testID: string;
}

/** Renders the 3 vertical intent chips (vocal / camera / walk) surfaced on the Home screen. */
export const HomeIntentChips = ({
  onPress,
  disabled = false,
}: HomeIntentChipsProps): JSX.Element => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const chips: readonly ChipDefinition[] = [
    {
      intent: 'vocal',
      icon: 'mic-outline',
      label: t('home.chips.vocal.label'),
      hint: t('home.chips.vocal.hint'),
      testID: 'home-intent-chip-vocal',
    },
    {
      intent: 'camera',
      icon: 'camera-outline',
      label: t('home.chips.camera.label'),
      hint: t('home.chips.camera.hint'),
      testID: 'home-intent-chip-camera',
    },
    {
      intent: 'walk',
      icon: 'walk-outline',
      label: t('home.chips.walk.label'),
      hint: t('home.chips.walk.hint'),
      testID: 'home-intent-chip-walk',
    },
  ];

  const handlePress = (intent: HomeIntent): void => {
    void Haptics.selectionAsync();
    onPress(intent);
  };

  return (
    <View style={styles.container} testID="home-intent-chips">
      {chips.map(({ intent, icon, label, hint, testID }) => (
        <Pressable
          key={intent}
          testID={testID}
          onPress={() => {
            handlePress(intent);
          }}
          disabled={disabled}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: theme.cardBorder,
              backgroundColor: theme.surface,
              shadowColor: theme.shadowColor,
            },
            disabled && styles.chipDisabled,
            pressed && styles.chipPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={hint}
          accessibilityState={{ disabled }}
        >
          <View style={[styles.iconBadge, { backgroundColor: theme.primaryTint }]}>
            <Ionicons name={icon} size={20} color={theme.primary} />
          </View>
          <Text style={[styles.label, { color: theme.textPrimary }]} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: semantic.form.gap,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gap,
    paddingVertical: semantic.button.paddingY,
    paddingHorizontal: semantic.card.padding,
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipPressed: {
    opacity: 0.85,
  },
  iconBadge: {
    width: space['9'],
    height: space['9'],
    borderRadius: semantic.badge.radiusFull,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: semantic.button.fontSizeLarge,
    fontWeight: '600',
  },
});
