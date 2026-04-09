import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessageMetadata } from '@/features/chat/application/useChatSession';
import { FollowUpButtons } from '@/features/chat/ui/FollowUpButtons';
import { RecommendationChips } from '@/features/chat/ui/RecommendationChips';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, lineHeightPx } from '@/shared/ui/tokens.generated';

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
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [isDeeperContextExpanded, setIsDeeperContextExpanded] = useState(false);

  if (!metadata) {
    return null;
  }

  const { openQuestion } = metadata;

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
        <View
          style={[
            styles.deeperContextWrap,
            { borderColor: theme.assistantBubbleBorder, backgroundColor: theme.glassBackground },
          ]}
        >
          <Pressable
            style={styles.deeperContextToggle}
            onPress={() => {
              setIsDeeperContextExpanded((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.chat.long_press_hint' as 'common.close', {
              defaultValue: 'Toggle deeper context',
            })}
            accessibilityState={{ expanded: isDeeperContextExpanded }}
          >
            <Ionicons
              name={isDeeperContextExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.primary}
            />
            <Text style={[styles.deeperContextLabel, { color: theme.primary }]}>
              {t('messageActions.learn_more')}
            </Text>
          </Pressable>
          {isDeeperContextExpanded ? (
            <Text style={[styles.deeperContextText, { color: theme.textSecondary }]}>
              {metadata.deeperContext}
            </Text>
          ) : null}
        </View>
      ) : null}

      {openQuestion ? (
        <Pressable
          style={[
            styles.openQuestionChip,
            { borderColor: theme.primaryBorderSubtle, backgroundColor: theme.primaryTint },
            isSendingDisabled && styles.disabledChip,
          ]}
          accessibilityRole="button"
          accessibilityLabel={openQuestion}
          accessibilityHint={t('a11y.chat.recommendation_hint')}
          onPress={() => {
            if (!isSendingDisabled) {
              onRecommendationPress(openQuestion);
            }
          }}
          disabled={isSendingDisabled}
        >
          <Ionicons name="bulb-outline" size={14} color={theme.primary} />
          <Text style={[styles.openQuestionText, { color: theme.primary }]} numberOfLines={2}>
            {openQuestion}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: semantic.chat.gapSmall,
    alignItems: 'flex-end',
  },
  deeperContextWrap: {
    marginTop: space['1'],
    maxWidth: '85%',
    alignSelf: 'flex-end',
    borderRadius: semantic.card.radiusCompact,
    borderWidth: semantic.input.borderWidth,
    padding: space['2.5'],
  },
  deeperContextToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gapSmall,
  },
  deeperContextLabel: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  deeperContextText: {
    marginTop: semantic.chat.gap,
    fontSize: semantic.form.labelSize,
    lineHeight: lineHeightPx['19'],
  },
  openQuestionChip: {
    marginTop: space['0.5'],
    maxWidth: '85%',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gap,
    borderRadius: semantic.card.radiusCompact,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: semantic.badge.paddingX,
  },
  disabledChip: {
    opacity: 0.5,
  },
  openQuestionText: {
    flex: 1,
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
  },
});
