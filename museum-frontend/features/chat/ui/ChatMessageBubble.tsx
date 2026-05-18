import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import type { CitationFamily } from '@/features/chat/application/citations';
import { FAMILY_FOR_SOURCE_TYPE } from '@/features/chat/application/citations';
import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';
import { CitationChips } from '@/features/chat/ui/CitationChips';
import { ImageCarousel } from '@/features/chat/ui/ImageCarousel';
import { ImageCarouselSkeleton } from '@/features/chat/ui/ImageCarouselSkeleton';
import { ImageCompareCarousel } from '@/features/chat/ui/ImageCompareCarousel';
import { ImageFullscreenModal } from '@/features/chat/ui/ImageFullscreenModal';
import { SourceCitation } from '@/features/chat/ui/SourceCitation';
import { forceOpaque } from '@/shared/ui/colorUtils';
import { useReducedTransparency } from '@/shared/ui/hooks/useReducedTransparency';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

import { FeedbackSection, ImageSection, StreamingBody, TtsSection } from './bubbleSections';

/**
 * A3 — Local UI tuning value for the assistant bubble's frosted-glass effect.
 *
 * Chosen between `<GlassCard>` 52 (UI cards, low text density) and
 * `<FloatingContextMenu>` 64 (tactical overlay). The bubble is text-dense, so
 * we keep the blur lighter (42) to preserve readability. This is NOT a design
 * token — pure local UI constant, per spec §1.8 R27.
 */
export const ASSISTANT_BUBBLE_BLUR_INTENSITY = 42;

interface ChatMessageBubbleProps {
  message: ChatUiMessage;
  locale: string;
  isStreaming?: boolean;
  onImageError: (messageId: string) => void;
  onReport: (messageId: string) => void;
  ttsPlaying?: boolean;
  ttsLoading?: boolean;
  ttsFailed?: boolean;
  ttsSkippedLowData?: boolean;
  onLinkPress?: (url: string) => boolean;
  onToggleTts?: (messageId: string) => Promise<void>;
  onRetry?: (message: ChatUiMessage) => void;
  feedbackValue?: 'positive' | 'negative' | null;
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
  /**
   * C9.18 (2026-05-17) — B2B deep-link callback fired when the user taps the
   * detected-artwork chip. Parent owns the actual navigation (it knows the
   * session museumId). `detectedArtwork` payload (including `artworkId`) is
   * accessible via `message.metadata`.
   */
  onArtworkPress?: (message: ChatUiMessage) => void;
}

/**
 * Facade that composes the four NL-4.2 bubble sections — StreamingBody, ImageSection,
 * TtsSection, FeedbackSection — around a user/assistant bubble frame. Memoized to
 * skip re-renders when inputs are structurally identical; during streaming, only
 * text + isStreaming trigger a re-render.
 *
 * Sprint D rationale (2026-04-15): the comparator returns true (skip render) when
 * text is unchanged during streaming. Pre-fix, React.memo was unconditionally
 * bypassed during streaming, re-rendering on every flush (every 30ms) — visible
 * "clignotement" in the UI. Don't refactor this comparator without measuring
 * the streaming UX end-to-end.
 */
export const ChatMessageBubble = React.memo(
  ({
    message,
    locale,
    isStreaming = false,
    onImageError,
    onReport,
    ttsPlaying = false,
    ttsLoading = false,
    ttsFailed = false,
    ttsSkippedLowData = false,
    onLinkPress,
    onToggleTts,
    onRetry,
    feedbackValue,
    onFeedback,
    onArtworkPress,
  }: ChatMessageBubbleProps) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const reduceTransparency = useReducedTransparency();
    const isAssistant = message.role === 'assistant';
    const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);

    // C2 v2 (2026-05) — Q1 RESOLVED option (b): show a skeleton placeholder
    // above the streaming body while we wait for image enrichment to land,
    // then swap to the real carousel once `metadata.images` hydrates.
    const hasImages = (message.metadata?.images?.length ?? 0) > 0;
    const showSkeleton = isStreaming && !hasImages;
    const sources = message.metadata?.sources;
    const hasSources = (sources?.length ?? 0) > 0;

    /**
     * A6 — tap on a provenance chip opens the FIRST source of that family
     * via `Linking.openURL` (Q1 option (a) in spec). `ai-knowledge` is a
     * synthetic family with no source → NO-OP. The confidence chip is also
     * a NO-OP in V1 (the disclosure popover is deferred per Q5 / §2.7).
     */
    const onProvenancePress = useCallback(
      (family: CitationFamily) => {
        if (family === 'ai-knowledge') return;
        const match = sources?.find((s) => FAMILY_FOR_SOURCE_TYPE[s.type] === family);
        if (match?.url) {
          void Linking.openURL(match.url);
        }
      },
      [sources],
    );

    const bubbleContent = (
      <>
        {isAssistant ? (
          <View>
            {showSkeleton ? <ImageCarouselSkeleton /> : null}
            {!isStreaming && hasImages && message.metadata?.images ? (
              <ImageCarousel
                images={message.metadata.images}
                onImagePress={(index) => {
                  setFullscreenIndex(index);
                }}
              />
            ) : null}
            <StreamingBody
              text={message.text}
              isStreaming={isStreaming}
              onLinkPress={onLinkPress}
            />
            {!isStreaming && hasSources && sources ? (
              <View style={styles.sourcesRow}>
                {sources.map((s, i) => (
                  <SourceCitation key={`${s.url}-${String(i)}`} source={s} index={i + 1} />
                ))}
              </View>
            ) : null}
            {!isStreaming ? (
              <CitationChips metadata={message.metadata} onProvenancePress={onProvenancePress} />
            ) : null}
          </View>
        ) : (
          <Text style={{ color: theme.primaryContrast }}>{message.text}</Text>
        )}
        {!isStreaming && message.image?.url ? (
          <ImageSection
            messageId={message.id}
            url={message.image.url}
            expiresAt={message.image.expiresAt}
            onImageError={onImageError}
          />
        ) : null}
        {!isStreaming ? (
          <TtsSection
            messageId={message.id}
            createdAt={message.createdAt}
            locale={locale}
            isAssistant={isAssistant}
            ttsPlaying={ttsPlaying}
            ttsLoading={ttsLoading}
            ttsFailed={ttsFailed}
            ttsSkippedLowData={ttsSkippedLowData}
            onToggleTts={onToggleTts}
            onReport={onReport}
            feedbackValue={feedbackValue}
            onFeedback={onFeedback}
          />
        ) : null}
      </>
    );

    return (
      <View>
        {isAssistant ? (
          <Pressable
            onLongPress={() => {
              if (isStreaming) return;
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onReport(message.id);
            }}
            accessibilityRole="text"
            accessibilityLabel={t('a11y.chat.assistant_message')}
            accessibilityHint={t('a11y.chat.long_press_hint')}
          >
            {reduceTransparency ? (
              <View
                testID="chat-bubble-assistant"
                style={[
                  styles.bubble,
                  styles.bubbleAssistantOpaque,
                  {
                    backgroundColor: forceOpaque(theme.assistantBubble),
                    borderColor: theme.assistantBubbleBorder,
                  },
                ]}
              >
                {bubbleContent}
              </View>
            ) : (
              <BlurView
                testID="chat-bubble-assistant"
                intensity={ASSISTANT_BUBBLE_BLUR_INTENSITY}
                tint={theme.blurTint}
                style={[
                  styles.bubble,
                  styles.bubbleAssistantBlur,
                  {
                    backgroundColor: theme.assistantBubble,
                    borderColor: theme.assistantBubbleBorder,
                  },
                ]}
              >
                {bubbleContent}
              </BlurView>
            )}
          </Pressable>
        ) : (
          <View
            testID="chat-bubble-user"
            style={[
              styles.bubble,
              styles.bubbleUser,
              {
                backgroundColor: forceOpaque(theme.userBubble),
                borderColor: theme.userBubbleBorder,
              },
            ]}
            accessibilityRole="text"
            accessibilityLabel={t('a11y.chat.user_message')}
          >
            {bubbleContent}
          </View>
        )}

        <FeedbackSection
          message={message}
          isAssistant={isAssistant}
          isStreaming={isStreaming}
          onRetry={onRetry}
        />

        {!isStreaming && isAssistant && message.metadata?.detectedArtwork?.title ? (
          <ArtworkCard
            title={message.metadata.detectedArtwork.title}
            artist={message.metadata.detectedArtwork.artist}
            museum={message.metadata.detectedArtwork.museum}
            room={message.metadata.detectedArtwork.room}
            confidence={message.metadata.detectedArtwork.confidence}
            artworkId={message.metadata.detectedArtwork.artworkId}
            onPress={
              onArtworkPress
                ? () => {
                    onArtworkPress(message);
                  }
                : undefined
            }
          />
        ) : null}

        {/*
          C3 visual-similarity carousel (Phase 8 / T8.5). Mounts whenever
          `compareResults` metadata is present, even when `matches` is empty —
          the carousel owns its own empty-state UX (driven by `fallbackReason`).
          `locale` is parsed defensively: the bubble receives a BCP-47 string
          (e.g. `'fr-FR'`); the carousel only knows about `'fr' | 'en'`.
        */}
        {!isStreaming && isAssistant && message.metadata?.compareResults ? (
          <ImageCompareCarousel
            matches={message.metadata.compareResults.matches}
            locale={locale.toLowerCase().startsWith('fr') ? 'fr' : 'en'}
            onMatchPress={() => undefined}
          />
        ) : null}

        {fullscreenIndex !== null && message.metadata?.images ? (
          <ImageFullscreenModal
            images={message.metadata.images}
            initialIndex={fullscreenIndex}
            visible
            onClose={() => {
              setFullscreenIndex(null);
            }}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) => {
    // During streaming: only re-render when text changes OR isStreaming flips.
    // Prevents flicker from unrelated prop churn (TTS/feedback) during streaming.
    if (prev.isStreaming || next.isStreaming) {
      return prev.message.text === next.message.text && prev.isStreaming === next.isStreaming;
    }
    return (
      prev.message.id === next.message.id &&
      prev.message.text === next.message.text &&
      prev.message.image?.url === next.message.image?.url &&
      prev.message.sendFailed === next.message.sendFailed &&
      prev.message.cached === next.message.cached &&
      prev.locale === next.locale &&
      prev.ttsPlaying === next.ttsPlaying &&
      prev.ttsLoading === next.ttsLoading &&
      prev.ttsFailed === next.ttsFailed &&
      prev.ttsSkippedLowData === next.ttsSkippedLowData &&
      prev.feedbackValue === next.feedbackValue
    );
  },
);
ChatMessageBubble.displayName = 'ChatMessageBubble';

const styles = StyleSheet.create({
  bubble: {
    borderRadius: semantic.chat.bubbleRadius,
    padding: semantic.chat.bubblePadding,
    maxWidth: '85%',
    borderWidth: semantic.input.borderWidth,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
  },
  bubbleAssistantOpaque: {
    alignSelf: 'flex-start',
  },
  bubbleAssistantBlur: {
    alignSelf: 'flex-start',
    // Required to clip the frosted-glass effect to the bubble's borderRadius.
    overflow: 'hidden',
  },
  sourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: semantic.chat.gapSmall,
    columnGap: semantic.chat.gapSmall,
  },
});
