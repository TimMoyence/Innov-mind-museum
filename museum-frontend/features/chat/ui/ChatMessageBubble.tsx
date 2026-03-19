import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { MarkdownBubble } from '@/features/chat/ui/MarkdownBubble';
import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';

interface ChatMessageBubbleProps {
  /** The message to render. */
  message: ChatUiMessage;
  /** Locale string for time formatting (e.g. 'en-US'). */
  locale: string;
  /** Called when an assistant message image fails to load, to trigger URL refresh. */
  onImageError: (messageId: string) => void;
  /** Called on long-press of an assistant message to report it. */
  onReport: (messageId: string) => void;
}

/**
 * Renders a single chat message bubble with user/assistant styling,
 * markdown support, image display, timestamp, artwork card, and report action.
 */
export const ChatMessageBubble = ({
  message,
  locale,
  onImageError,
  onReport,
}: ChatMessageBubbleProps) => {
  const isAssistant = message.role === 'assistant';

  const bubbleContent = (
    <>
      {isAssistant ? (
        <MarkdownBubble text={message.text} />
      ) : (
        <Text style={styles.userText}>{message.text}</Text>
      )}
      {message.image?.url ? (
        <Image
          source={{ uri: message.image.url }}
          style={styles.messageImage}
          resizeMode='cover'
          onError={() => onImageError(message.id)}
        />
      ) : null}
      <Text style={styles.timestamp}>
        {new Date(message.createdAt).toLocaleTimeString(locale || undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </>
  );

  return (
    <View>
      {isAssistant ? (
        <Pressable
          onLongPress={() => onReport(message.id)}
          style={[styles.bubble, styles.assistantBubble]}
        >
          {bubbleContent}
        </Pressable>
      ) : (
        <View style={[styles.bubble, styles.userBubble]}>
          {bubbleContent}
        </View>
      )}

      {isAssistant && message.metadata?.detectedArtwork?.title ? (
        <ArtworkCard
          title={message.metadata.detectedArtwork.title}
          artist={message.metadata.detectedArtwork.artist}
          museum={message.metadata.detectedArtwork.museum}
          room={message.metadata.detectedArtwork.room}
          confidence={message.metadata.detectedArtwork.confidence}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    borderRadius: 16,
    padding: 12,
    maxWidth: '85%',
    borderWidth: 1,
  },
  assistantBubble: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(148,163,184,0.22)',
    alignSelf: 'flex-start',
  },
  userBubble: {
    backgroundColor: 'rgba(30, 64, 175, 0.88)',
    borderColor: 'rgba(191, 219, 254, 0.6)',
    alignSelf: 'flex-end',
  },
  userText: {
    color: '#FFFFFF',
  },
  timestamp: {
    marginTop: 6,
    fontSize: 11,
    color: 'rgba(100,116,139,0.92)',
  },
  messageImage: {
    marginTop: 8,
    width: 220,
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(226,232,240,0.45)',
  },
});
