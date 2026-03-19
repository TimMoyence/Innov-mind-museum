import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ChatUiMessageMetadata } from '@/features/chat/application/useChatSession';
import { FollowUpButtons } from '@/features/chat/ui/FollowUpButtons';
import { RecommendationChips } from '@/features/chat/ui/RecommendationChips';
import { useTheme } from '@/shared/ui/ThemeContext';

interface MessageActionsProps {
  /** Metadata from the last assistant message. */
  metadata: ChatUiMessageMetadata | null | undefined;
  /** Called when a follow-up question is pressed (auto-sends). */
  onFollowUpPress: (text: string) => void;
  /** Called when a recommendation chip is pressed (populates input). */
  onRecommendationPress: (text: string) => void;
  /** Whether send actions should be disabled (e.g. during an active send). */
  isSendingDisabled: boolean;
}

/**
 * Renders action components that appear after the last assistant message:
 * follow-up question buttons, recommendation chips, deeper context collapsible,
 * and open question prompt chip.
 */
export const MessageActions = ({
  metadata,
  onFollowUpPress,
  onRecommendationPress,
  isSendingDisabled,
}: MessageActionsProps) => {
  const { theme } = useTheme();
  const [isDeeperContextExpanded, setIsDeeperContextExpanded] = useState(false);

  if (!metadata) {
    return null;
  }

  return (
    <View style={styles.container}>
      {metadata.followUpQuestions?.length ? (
        <FollowUpButtons
          questions={metadata.followUpQuestions}
          onPress={onFollowUpPress}
          disabled={isSendingDisabled}
        />
      ) : null}

      {metadata.recommendations?.length ? (
        <RecommendationChips
          recommendations={metadata.recommendations}
          onPress={onRecommendationPress}
          disabled={isSendingDisabled}
        />
      ) : null}

      {metadata.deeperContext ? (
        <View style={styles.deeperContextWrap}>
          <Pressable
            style={styles.deeperContextToggle}
            onPress={() => setIsDeeperContextExpanded((v) => !v)}
          >
            <Ionicons
              name={isDeeperContextExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.primary}
            />
            <Text style={[styles.deeperContextLabel, { color: theme.primary }]}>Learn more</Text>
          </Pressable>
          {isDeeperContextExpanded ? (
            <Text style={styles.deeperContextText}>{metadata.deeperContext}</Text>
          ) : null}
        </View>
      ) : null}

      {metadata.openQuestion ? (
        <Pressable
          style={[styles.openQuestionChip, isSendingDisabled && styles.disabledChip]}
          onPress={() => {
            if (!isSendingDisabled) {
              onRecommendationPress(metadata.openQuestion!);
            }
          }}
          disabled={isSendingDisabled}
        >
          <Ionicons name='bulb-outline' size={14} color={theme.primary} />
          <Text style={[styles.openQuestionText, { color: theme.primary }]} numberOfLines={2}>{metadata.openQuestion}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  deeperContextWrap: {
    marginTop: 4,
    maxWidth: '85%',
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(255,255,255,0.5)',
    padding: 10,
  },
  deeperContextToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deeperContextLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  deeperContextText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: '#334155',
  },
  openQuestionChip: {
    marginTop: 2,
    maxWidth: '85%',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(30, 64, 175, 0.2)',
    backgroundColor: 'rgba(30, 64, 175, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disabledChip: {
    opacity: 0.5,
  },
  openQuestionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
