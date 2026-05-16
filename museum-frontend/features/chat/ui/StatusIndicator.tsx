/**
 * A5 — `<StatusIndicator>` : single-line, a11y-aware status text rendered in
 * place of the legacy 3-dots `<TypingIndicator>` while the chat assistant
 * is producing a response.
 *
 * Spec : `docs/chat-ux-refonte/specs/A5.md` §1.2 (R10-R21) + §2.6 (a11y).
 */

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PHASE_I18N_KEY, type ChatPipelinePhase } from '@/features/chat/application/phases';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface StatusIndicatorProps {
  /**
   * Current phase to display. `null` or `'done'` → component unmounts
   * (silence-is-success — R17).
   */
  readonly phase: ChatPipelinePhase | null;
}

/**
 * Renders the current pipeline phase as a single localised line with a
 * polite live region so screen readers announce phase changes without
 * interrupting other speech (WCAG 4.1.3 — R19/R20).
 *
 * No animation : the component snaps in / out — `useReducedMotion()` is
 * therefore a no-op here. The decision is documented in spec §2.7 ; the
 * legacy `<TypingIndicator>` 3-dot pulse is removed by the same chantier
 * (doctrine `feedback_bury_dead_code`).
 */
const StatusIndicatorBase = ({ phase }: StatusIndicatorProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (phase === null || phase === 'done') return null;

  const label = t(PHASE_I18N_KEY[phase]);

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.container, { backgroundColor: theme.assistantBubble }]}
    >
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
};

export const StatusIndicator = memo(StatusIndicatorBase);

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    borderRadius: semantic.chat.bubbleRadius,
    paddingHorizontal: semantic.chat.bubblePaddingX,
    paddingVertical: space['2'],
  },
  label: {
    fontSize: semantic.section.labelSize,
    fontWeight: '500',
  },
});
