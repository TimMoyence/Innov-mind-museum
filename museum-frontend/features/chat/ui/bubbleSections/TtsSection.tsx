import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AssistantMetaActions } from '@/features/chat/ui/AssistantMetaActions';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

interface TtsSectionProps {
  messageId: string;
  createdAt: string;
  locale: string;
  isAssistant: boolean;
  ttsPlaying?: boolean;
  ttsLoading?: boolean;
  ttsFailed?: boolean;
  onToggleTts?: (messageId: string) => Promise<void>;
  onReport: (messageId: string) => void;
  feedbackValue?: 'positive' | 'negative' | null;
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
}

/**
 * Bottom meta row of a non-streaming bubble: timestamp + assistant-only
 * meta actions (TTS playback, feedback thumbs, report). Name reflects the
 * TTS-centric user journey (voice playback is the primary action here).
 */
export const TtsSection = memo(function TtsSection({
  messageId,
  createdAt,
  locale,
  isAssistant,
  ttsPlaying = false,
  ttsLoading = false,
  ttsFailed = false,
  onToggleTts,
  onReport,
  feedbackValue,
  onFeedback,
}: TtsSectionProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.metaRow}>
      <Text style={[styles.timestamp, { color: theme.timestamp }]}>
        {new Date(createdAt).toLocaleTimeString(locale || undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
      {isAssistant ? (
        <AssistantMetaActions
          messageId={messageId}
          feedbackValue={feedbackValue}
          onFeedback={onFeedback}
          ttsPlaying={ttsPlaying}
          ttsLoading={ttsLoading}
          ttsFailed={ttsFailed}
          onToggleTts={onToggleTts}
          onReport={onReport}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: semantic.chat.gapSmall,
  },
  timestamp: {
    fontSize: semantic.section.labelSize,
  },
});
