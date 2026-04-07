import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SkeletonChatBubble } from '@/shared/ui/SkeletonChatBubble';
import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useChatSession } from '@/features/chat/application/useChatSession';
import { buildVisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import { useAudioRecorder } from '@/features/chat/application/useAudioRecorder';
import { useImagePicker } from '@/features/chat/application/useImagePicker';
import { useAiConsent } from '@/features/chat/application/useAiConsent';
import { useAutoTts } from '@/features/chat/application/useAutoTts';
import { useAudioDescriptionMode } from '@/features/settings/application/useAudioDescriptionMode';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { ChatMessageList } from '@/features/chat/ui/ChatMessageList';
import { ChatInput } from '@/features/chat/ui/ChatInput';
import { ChatHeader } from '@/features/chat/ui/ChatHeader';
import { MediaAttachmentPanel } from '@/features/chat/ui/MediaAttachmentPanel';
import { ImagePreviewModal } from '@/features/chat/ui/ImagePreviewModal';
import { MessageContextMenu } from '@/features/chat/ui/MessageContextMenu';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';
import { AiConsentModal } from '@/features/chat/ui/AiConsentModal';
import { VisitSummaryModal } from '@/features/chat/ui/VisitSummaryModal';
import { useMessageActions } from '@/features/chat/application/useMessageActions';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Renders the chat session screen with message history, text/image/audio input, and assistant response display. */
export default function ChatSessionScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ sessionId: string; intent?: string }>();
  const sessionId = useMemo(() => params.sessionId || '', [params.sessionId]);
  const initialIntent = useMemo(() => {
    if (params.intent === 'camera' || params.intent === 'audio') return params.intent;
    return null;
  }, [params.intent]);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [text, setText] = useState('');
  const [isIntentHandled, setIsIntentHandled] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [contextMenuMessage, setContextMenuMessage] = useState<(typeof messages)[number] | null>(
    null,
  );
  const [showSummary, setShowSummary] = useState(false);
  const imageRefreshInFlightRef = useRef(new Set());

  // --- Hooks ---
  const { showAiConsent, setShowAiConsent, consentResolved, acceptAiConsent, recheckConsent } =
    useAiConsent();

  const {
    messages,
    isEmpty,
    isLoading,
    isSending,
    isStreaming,
    isOffline,
    pendingCount,
    error,
    clearError,
    sendMessage,
    retryMessage,
    refreshMessageImageUrl,
    locale,
    museumMode,
    sessionTitle,
    museumName,
  } = useChatSession(sessionId);

  const {
    isRecording,
    recordedAudioUri,
    recordedAudioBlob,
    isPlayingAudio,
    toggleRecording,
    playRecordedAudio,
    clearRecordedAudio,
  } = useAudioRecorder();

  const {
    selectedImage,
    pendingImage,
    onPickImage,
    onTakePicture,
    confirmPendingImage,
    cancelPendingImage,
    clearSelectedImage,
  } = useImagePicker();

  const { enabled: audioDescEnabled } = useAudioDescriptionMode();
  const [sessionAudioOverride, setSessionAudioOverride] = useState<boolean | null>(null);
  const effectiveAudioDesc = sessionAudioOverride ?? audioDescEnabled;

  useAutoTts({ messages, enabled: effectiveAudioDesc });

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);
  const expertiseLevel = lastAssistantMessage?.metadata?.expertiseSignal;

  const visitSummary = useMemo(
    () => buildVisitSummary(messages, sessionTitle),
    [messages, sessionTitle],
  );

  // --- Callbacks ---
  const clearMedia = useCallback(() => {
    clearSelectedImage();
    clearRecordedAudio();
  }, [clearSelectedImage, clearRecordedAudio]);

  const onSend = useCallback(
    async (overrideText?: string) => {
      const nextText = (overrideText ?? text).trim();
      if (!nextText && !selectedImage && !recordedAudioUri) return;

      // Clear input immediately for responsive UX
      const currentText = nextText;
      const currentImage = selectedImage;
      const currentAudioUri = recordedAudioUri;
      const currentAudioBlob = recordedAudioBlob;
      setText('');
      clearMedia();

      const sent = await sendMessage({
        text: currentText || undefined,
        imageUri: currentImage ?? undefined,
        audioUri: currentAudioUri ?? undefined,
        audioBlob: currentAudioBlob ?? undefined,
      });
      if (!sent) {
        setText(currentText);
      }
    },
    [text, selectedImage, recordedAudioUri, recordedAudioBlob, sendMessage, clearMedia],
  );

  const onFollowUpPress = useCallback(
    (questionText: string) => {
      void sendMessage({ text: questionText });
    },
    [sendMessage],
  );
  const onRecommendationPress = useCallback((recommendationText: string) => {
    setText(recommendationText);
  }, []);

  useEffect(() => {
    if (error) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [error]);

  useEffect(() => {
    if (isIntentHandled || !initialIntent) return;
    setIsIntentHandled(true);
    if (initialIntent === 'camera') {
      void onTakePicture();
      return;
    }
    // Delay audio recording to ensure screen is fully mounted (avoids silent failure on iOS)
    const timer = setTimeout(() => {
      void toggleRecording();
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  }, [initialIntent, isIntentHandled, onTakePicture, toggleRecording]);

  const onClose = async () => {
    if (isClosing) return;
    setIsClosing(true);
    try {
      if (isEmpty) await chatApi.deleteSessionIfEmpty(sessionId);
    } catch {
      /* resilient */
    } finally {
      setIsClosing(false);
    }
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/conversations');
  };

  const submitReport = useCallback(
    async (messageId: string, reason: 'offensive' | 'inaccurate' | 'inappropriate' | 'other') => {
      try {
        await chatApi.reportMessage({ messageId, reason });
        Alert.alert(t('chat.report_thanks_title'), t('chat.report_thanks_body'));
      } catch {
        Alert.alert(t('common.error'), t('chat.report_error_body'));
      }
    },
    [t],
  );

  const onReportMessage = useCallback(
    (messageId: string) => {
      Alert.alert(t('chat.report_title'), t('chat.report_body'), [
        {
          text: t('chat.report_offensive'),
          onPress: () => void submitReport(messageId, 'offensive'),
        },
        {
          text: t('chat.report_inaccurate'),
          onPress: () => void submitReport(messageId, 'inaccurate'),
        },
        {
          text: t('chat.report_inappropriate'),
          onPress: () => void submitReport(messageId, 'inappropriate'),
        },
        { text: t('chat.report_other'), onPress: () => void submitReport(messageId, 'other') },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    },
    [submitReport, t],
  );

  const { copyText, shareText } = useMessageActions({ onReport: onReportMessage });

  const onMessageLongPress = useCallback(
    (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (msg) setContextMenuMessage(msg);
    },
    [messages],
  );

  const onMessageImageError = useCallback(
    (messageId: string) => {
      if (imageRefreshInFlightRef.current.has(messageId)) return;
      imageRefreshInFlightRef.current.add(messageId);
      void refreshMessageImageUrl(messageId)
        .catch(() => {
          /* resilient */
        })
        .finally(() => {
          imageRefreshInFlightRef.current.delete(messageId);
        });
    },
    [refreshMessageImageUrl],
  );

  // --- Render ---
  return (
    <LiquidScreen
      background={pickMuseumBackground(4)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {isRecording ? (
            <Text style={[styles.recordingStatus, { color: theme.error }]}>
              {t('chat.recording_hint')}
            </Text>
          ) : null}

          <ChatHeader
            sessionTitle={sessionTitle}
            museumName={museumName}
            sessionId={sessionId}
            expertiseLevel={expertiseLevel}
            isClosing={isClosing}
            onClose={() => {
              void onClose();
            }}
            onSummary={() => {
              setShowSummary(true);
            }}
            audioDescriptionEnabled={effectiveAudioDesc}
            onToggleAudioDescription={() => {
              setSessionAudioOverride((prev) => !(prev ?? audioDescEnabled));
            }}
          />

          <OfflineBanner pendingCount={pendingCount} isOffline={isOffline} />
          {error ? <ErrorNotice message={error} onDismiss={clearError} /> : null}

          <GlassCard style={styles.chatSurface} intensity={42}>
            {isLoading ? (
              <View style={styles.skeletonChat}>
                <SkeletonChatBubble alignSelf="flex-start" />
                <SkeletonChatBubble alignSelf="flex-end" />
                <SkeletonChatBubble alignSelf="flex-start" />
              </View>
            ) : (
              <ChatMessageList
                messages={messages}
                isSending={isSending}
                isStreaming={isStreaming}
                locale={locale}
                museumMode={museumMode}
                onFollowUpPress={onFollowUpPress}
                onRecommendationPress={onRecommendationPress}
                onSuggestion={(suggestion) => void onSend(suggestion)}
                onCamera={() => void onTakePicture()}
                onImageError={onMessageImageError}
                onReport={onMessageLongPress}
                onRetry={retryMessage}
              />
            )}
          </GlassCard>

          <MediaAttachmentPanel
            selectedImage={selectedImage}
            onPickImage={() => void onPickImage()}
            clearSelectedImage={clearSelectedImage}
            recordedAudioUri={recordedAudioUri}
            isPlayingAudio={isPlayingAudio}
            isRecording={isRecording}
            playRecordedAudio={playRecordedAudio}
            clearMedia={clearMedia}
            onTakePicture={() => void onTakePicture()}
            toggleRecording={toggleRecording}
          />

          <ChatInput
            value={text}
            onChangeText={setText}
            onSend={() => void onSend()}
            isSending={isSending || !consentResolved || showAiConsent}
          />
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <ImagePreviewModal
        imageUri={pendingImage}
        onConfirm={confirmPendingImage}
        onCancel={cancelPendingImage}
      />

      <MessageContextMenu
        message={contextMenuMessage}
        onCopy={(msg) => void copyText(msg)}
        onShare={(msg) => void shareText(msg)}
        onReport={onReportMessage}
        onClose={() => {
          setContextMenuMessage(null);
        }}
      />

      <AiConsentModal
        visible={showAiConsent}
        onAccept={() => void acceptAiConsent()}
        onPrivacy={() => {
          setShowAiConsent(false);
          router.push('/(stack)/privacy');
          const unsub = navigation.addListener('focus', () => {
            unsub();
            recheckConsent();
          });
        }}
      />

      <VisitSummaryModal
        visible={showSummary}
        summary={visitSummary}
        onClose={() => {
          setShowSummary(false);
        }}
      />
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 14, paddingBottom: 12 },
  flex: { flex: 1 },
  recordingStatus: { marginBottom: 10, textAlign: 'center', fontWeight: '700', fontSize: 12 },
  chatSurface: { flex: 1, paddingHorizontal: 10, paddingVertical: 10 },
  skeletonChat: { flex: 1, justifyContent: 'flex-start', paddingTop: 12 },
});
