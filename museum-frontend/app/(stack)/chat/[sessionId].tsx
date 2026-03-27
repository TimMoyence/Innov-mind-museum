import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SkeletonChatBubble } from '@/shared/ui/SkeletonChatBubble';
import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CustomCameraView } from '@/components/CameraView';
import { useChatSession } from '@/features/chat/application/useChatSession';
import { useAudioRecorder } from '@/features/chat/application/useAudioRecorder';
import { useImagePicker } from '@/features/chat/application/useImagePicker';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { ChatMessageList } from '@/features/chat/ui/ChatMessageList';
import { ChatInput } from '@/features/chat/ui/ChatInput';
import { ExpertiseBadge } from '@/features/chat/ui/ExpertiseBadge';
import { ImagePreviewModal } from '@/features/chat/ui/ImagePreviewModal';
import { MessageContextMenu } from '@/features/chat/ui/MessageContextMenu';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';
import { AiConsentModal } from '@/features/chat/ui/AiConsentModal';
import { useMessageActions } from '@/features/chat/application/useMessageActions';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Renders the chat session screen with message history, text/image/audio input, and assistant response display. */
export default function ChatSessionScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ sessionId: string; intent?: string }>();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- params may be string[]
  const sessionId = useMemo(() => String(params.sessionId || ''), [params.sessionId]);
  const initialIntent = useMemo(() => {
    if (params.intent === 'camera' || params.intent === 'audio') {
      return params.intent;
    }
    return null;
  }, [params.intent]);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [text, setText] = useState('');
  const [isIntentHandled, setIsIntentHandled] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('consent.ai_accepted')
      .then((v) => {
        if (v !== 'true') setShowAiConsent(true);
      })
      .catch(() => {
        setShowAiConsent(true);
      });
  }, []);

  const acceptAiConsent = useCallback(() => {
    setShowAiConsent(false);
    void AsyncStorage.setItem('consent.ai_accepted', 'true');
  }, []);
  const [contextMenuMessage, setContextMenuMessage] = useState<(typeof messages)[number] | null>(
    null,
  );
  const imageRefreshInFlightRef = useRef(new Set());

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
    isCameraOpen,
    setIsCameraOpen,
    onPickImage,
    onTakePicture,
    onCameraCapture,
    confirmPendingImage,
    cancelPendingImage,
    clearSelectedImage,
  } = useImagePicker();

  // Derive last assistant metadata for expertise badge
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  const expertiseLevel = lastAssistantMessage?.metadata?.expertiseSignal;

  const clearMedia = useCallback(() => {
    clearSelectedImage();
    clearRecordedAudio();
  }, [clearSelectedImage, clearRecordedAudio]);

  const onSend = useCallback(
    async (overrideText?: string) => {
      const nextText = (overrideText ?? text).trim();
      if (!nextText && !selectedImage && !recordedAudioUri) {
        return;
      }

      const sent = await sendMessage({
        text: nextText || undefined,
        imageUri: selectedImage ?? undefined,
        audioUri: recordedAudioUri ?? undefined,
        audioBlob: recordedAudioBlob ?? undefined,
      });

      if (sent) {
        setText('');
        clearMedia();
      }
    },
    [text, selectedImage, recordedAudioUri, recordedAudioBlob, sendMessage, clearMedia],
  );

  // F3.1: Follow-up buttons send ONLY text, no attached media
  const onFollowUpPress = useCallback(
    (questionText: string) => {
      void sendMessage({ text: questionText });
    },
    [sendMessage],
  );

  const onRecommendationPress = useCallback((recommendationText: string) => {
    setText(recommendationText);
  }, []);

  // Haptic feedback on error
  useEffect(() => {
    if (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [error]);

  // Handle initial intent (camera or audio)
  useEffect(() => {
    if (isIntentHandled || !initialIntent) {
      return;
    }

    setIsIntentHandled(true);
    if (initialIntent === 'camera') {
      onTakePicture();
      return;
    }

    void toggleRecording();
  }, [initialIntent, isIntentHandled, onTakePicture, toggleRecording]);

  const onClose = async () => {
    if (isClosing) {
      return;
    }

    setIsClosing(true);
    try {
      if (isEmpty) {
        await chatApi.deleteSessionIfEmpty(sessionId);
      }
    } catch {
      // keep close action resilient even when network fails
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
      if (imageRefreshInFlightRef.current.has(messageId)) {
        return;
      }

      imageRefreshInFlightRef.current.add(messageId);
      void refreshMessageImageUrl(messageId)
        .catch(() => {
          // Keep rendering resilient if refresh fails.
        })
        .finally(() => {
          imageRefreshInFlightRef.current.delete(messageId);
        });
    },
    [refreshMessageImageUrl],
  );

  if (isCameraOpen) {
    return (
      <CustomCameraView
        onClose={() => {
          setIsCameraOpen(false);
        }}
        onCapture={onCameraCapture}
      />
    );
  }

  return (
    <LiquidScreen
      background={pickMuseumBackground(4)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {isRecording ? (
            <Text style={[styles.recordingStatus, { color: theme.error }]}>
              {t('chat.recording_hint')}
            </Text>
          ) : null}

          <GlassCard style={styles.headerShell} intensity={58}>
            <View style={styles.headerRow}>
              <View style={styles.headerContent}>
                <Text style={[styles.header, { color: theme.textPrimary }]} numberOfLines={1}>
                  {sessionTitle ?? t('chat.fallback_title')}
                </Text>
                <View style={styles.headerSubRow}>
                  <Text style={[styles.subheader, { color: theme.textTertiary }]} numberOfLines={1}>
                    {museumName ?? `${sessionId.slice(0, 12)}...`}
                  </Text>
                  {expertiseLevel ? <ExpertiseBadge level={expertiseLevel} /> : null}
                </View>
              </View>
              <Pressable
                onPress={() => {
                  void onClose();
                }}
                style={[
                  styles.closeButton,
                  { borderColor: theme.inputBorder, backgroundColor: theme.surface },
                ]}
                disabled={isClosing}
              >
                {isClosing ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : (
                  <Ionicons name="close" size={20} color={theme.textPrimary} />
                )}
              </Pressable>
            </View>
          </GlassCard>

          {isOffline ? <OfflineBanner pendingCount={pendingCount} /> : null}

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
                onCamera={onTakePicture}
                onImageError={onMessageImageError}
                onReport={onMessageLongPress}
              />
            )}
          </GlassCard>

          {selectedImage ? (
            <View style={styles.previewWrap}>
              <Image
                source={{ uri: selectedImage }}
                style={[styles.preview, { borderColor: theme.inputBorder }]}
              />
              <View style={styles.previewMenu}>
                <FloatingContextMenu
                  actions={[
                    {
                      id: 'replace',
                      icon: 'images-outline',
                      label: t('chat.replace_image'),
                      onPress: () => void onPickImage(),
                    },
                    {
                      id: 'clear-image',
                      icon: 'trash-outline',
                      label: t('chat.remove_image'),
                      onPress: clearSelectedImage,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {recordedAudioUri ? (
            <GlassCard style={styles.audioCard} intensity={56}>
              <Text style={[styles.audioTitle, { color: theme.textPrimary }]}>
                {t('chat.voice_ready')}
              </Text>
              <View style={styles.audioRow}>
                <Pressable
                  style={[
                    styles.attachButton,
                    { borderColor: theme.cardBorder, backgroundColor: theme.surface },
                  ]}
                  onPress={() => void playRecordedAudio()}
                  disabled={isPlayingAudio}
                >
                  <Text style={[styles.attachText, { color: theme.textPrimary }]}>
                    {isPlayingAudio ? t('chat.playing') : t('chat.play')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.attachButton,
                    { borderColor: theme.cardBorder, backgroundColor: theme.surface },
                  ]}
                  onPress={clearMedia}
                >
                  <Text style={[styles.attachText, { color: theme.textPrimary }]}>
                    {t('chat.clear')}
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          ) : null}

          <View style={styles.attachRow}>
            <Pressable
              style={[
                styles.attachButton,
                { borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
              onPress={() => void onPickImage()}
            >
              <Text style={[styles.attachText, { color: theme.textPrimary }]}>
                {t('chat.gallery')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.attachButton,
                { borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
              onPress={onTakePicture}
            >
              <Text style={[styles.attachText, { color: theme.textPrimary }]}>
                {t('chat.lens')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.attachButton,
                { borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
              onPress={() => void toggleRecording()}
            >
              <Text style={[styles.attachText, { color: theme.textPrimary }]}>
                {isRecording ? t('chat.stop_audio') : t('chat.audio')}
              </Text>
            </Pressable>
          </View>

          <ChatInput
            value={text}
            onChangeText={setText}
            onSend={() => void onSend()}
            isSending={isSending}
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

      <AiConsentModal visible={showAiConsent} onAccept={acceptAiConsent} />
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  flex: {
    flex: 1,
  },
  recordingStatus: {
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 12,
  },
  headerShell: {
    marginBottom: 12,
  },
  headerRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerContent: {
    flex: 1,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
  },
  headerSubRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subheader: {
    fontSize: 12,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: 1,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSurface: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  skeletonChat: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 12,
  },
  previewWrap: {
    marginTop: 8,
  },
  preview: {
    width: 100,
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
  },
  previewMenu: {
    marginTop: 6,
  },
  audioCard: {
    marginTop: 10,
    padding: 10,
    gap: 8,
  },
  audioTitle: {
    fontWeight: '700',
    fontSize: 13,
  },
  audioRow: {
    flexDirection: 'row',
    gap: 8,
  },
  attachRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  attachButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachText: {
    fontWeight: '600',
  },
});
