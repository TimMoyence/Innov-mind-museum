import type { JSX } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

const SETTINGS_ROUTE = '/(stack)/settings' as const;

/** Small gear icon surfaced in the top-right corner of the Home hero, opens Settings. */
export const HeroSettingsButton = (): JSX.Element => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      testID="hero-settings-button"
      onPress={() => {
        router.push(SETTINGS_ROUTE);
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
        pressed && styles.buttonPressed,
      ]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.home.settings_gear')}
      accessibilityHint={t('a11y.home.settings_gear_hint')}
    >
      <Ionicons name="settings-outline" size={20} color={theme.textPrimary} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: space['3'],
    right: space['3'],
    width: space['10'],
    height: space['10'],
    borderRadius: semantic.badge.radiusFull,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
