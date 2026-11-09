import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

interface SottoVoceToggleProps {
  readonly enabled: boolean;
  readonly onToggle: () => void;
}

export const SottoVoceToggle = React.memo(({ enabled, onToggle }: SottoVoceToggleProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const handlePress = () => {
    console.debug('[chat.sottoVoce]', { next: !enabled });
    onToggle();
  };
  return (
    <Pressable
      testID="sotto-voce-toggle"
      onPress={handlePress}
      style={[
        styles.button,
        {
          borderColor: enabled ? theme.primary : theme.inputBorder,
          backgroundColor: theme.surface,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: enabled }}
      accessibilityLabel={t('chat.sottoVoce.a11y_label')}
      accessibilityHint={
        enabled ? t('chat.sottoVoce.a11y_hint_on') : t('chat.sottoVoce.a11y_hint_off')
      }
    >
      <Ionicons
        name={enabled ? 'mic-off' : 'mic-off-outline'}
        size={20}
        color={enabled ? theme.primary : theme.textSecondary}
      />
    </Pressable>
  );
});
SottoVoceToggle.displayName = 'SottoVoceToggle';

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.full,
    borderWidth: semantic.input.borderWidth,
    width: space['9'],
    height: space['9'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
