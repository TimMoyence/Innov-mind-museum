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

/**
 * B5 — Atomic icon toggle for sotto-voce (silent-room) mode. Renders inside
 * `<ChatHeader>` header actions. Tapping flips the global sotto-voce
 * preference (managed by `useSottoVoce`), which the screen uses to gate
 * `useAutoTts.enabled = (...) && !sottoVoce`.
 *
 * - `accessibilityRole="button"` (convention RN Pressable bascule, not
 *   `switch` which is reserved for `<Switch>` native).
 * - `accessibilityState.selected` reflects current state.
 * - Icon `mic-off-outline` (off) / `mic-off` (on).
 * - Telemetry : console.debug only (parity A3-A6, Open Q3 deferred V1.1+).
 *
 * Spec : `docs/chat-ux-refonte/specs/B5.md` §1.2 (R9-R17) + §2.3.
 */
export const SottoVoceToggle = React.memo(({ enabled, onToggle }: SottoVoceToggleProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const handlePress = () => {
    // B5 telemetry — same pattern as A3/A6 (console.debug only, no Sentry V1).
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
