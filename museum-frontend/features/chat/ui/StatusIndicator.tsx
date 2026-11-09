import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PHASE_I18N_KEY, type ChatPipelinePhase } from '@/features/chat/application/phases';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface StatusIndicatorProps {
  readonly phase: ChatPipelinePhase | null;
}

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
