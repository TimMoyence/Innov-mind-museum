import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface AskMoreChipProps {
  /** Single follow-up question text (LLM-generated, ≤80 chars effective). */
  readonly text: string;
  /** Invoked on tap with the (trimmed, sliced-to-80) question text. */
  readonly onPress: (text: string) => void;
  /** When true, the chip renders at half opacity and tap is a no-op. */
  readonly disabled?: boolean;
}

/**
 * Maximum visible characters for a follow-up question.
 *
 * Defence-in-depth slice mirroring `mainAssistantOutputSchema.suggestedFollowUp.max(80)`
 * on the BE — strings longer than this are sliced at the render boundary
 * before being passed to `onPress`. Spec: `docs/chat-ux-refonte/specs/B3.md`
 * §1.4 (R15) and AC14.
 */
const MAX_CHARS = 80;

/**
 * B3 — Atomic single-chip follow-up suggestion rendered under the last
 * assistant bubble.
 *
 * Singular by design: accepts ONE `text` string prop (never an array, never
 * a `string[]`). The doctrine "JAMAIS 3 boutons — référence un fact précis
 * ou rien" is encoded at the type level here (R16 / NFR13).
 *
 * Renders `null` when the trimmed text is empty (R22 — defence beyond
 * `<MessageActions>` parent guard).
 *
 * No animation on appear (R20 / WCAG 2.3.3) — disappearance is implicit,
 * driven by `<MessageActions>` unmounting on the next message.
 *
 * Spec: `docs/chat-ux-refonte/specs/B3.md` §1.4 (R13-R20), AC10-AC16.
 */
export const AskMoreChip = React.memo(function AskMoreChip({
  text,
  onPress,
  disabled = false,
}: AskMoreChipProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const safeText = trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;

  const handlePress = (): void => {
    if (disabled) return;
    onPress(safeText);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.chip,
        { borderColor: theme.primaryBorderSubtle, backgroundColor: theme.primaryTint },
        disabled ? styles.disabled : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('chat.askMore.a11y_label', { text: safeText })}
      accessibilityHint={t('chat.askMore.a11y_hint')}
      hitSlop={6}
    >
      <Ionicons name="arrow-forward-circle-outline" size={16} color={theme.primary} />
      <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.label, { color: theme.primary }]}>
        {safeText}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gap,
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: space['3'],
    paddingVertical: space['2'],
    maxWidth: '85%',
    alignSelf: 'flex-end',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    flexShrink: 1,
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
  },
});
