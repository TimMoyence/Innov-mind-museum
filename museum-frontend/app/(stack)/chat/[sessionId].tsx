import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomCameraView } from '@/components/CameraView';
import { useChatSession } from '@/features/chat/application/useChatSession';
import { useAudioRecorder } from '@/features/chat/application/useAudioRecorder';
import { useImagePicker } from '@/features/chat/application/useImagePicker';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { ChatMessageList } from '@/features/chat/ui/ChatMessageList';
import { ChatInput } from '@/features/chat/ui/ChatInput';
import { ExpertiseBadge } from '@/features/chat/ui/ExpertiseBadge';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

/** Renders the chat session screen with message history, text/image/audio input, and assistant response display. */
export default function ChatSessionScreen() {
  const params = useLocalSearchParams<{ sessionId: string; intent?: string }>();
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
  const imageRefreshInFlightRef = useRef<Set<string>>(new Set());

  const {
    messages,
    isEmpty,
    isLoading,
    isSending,
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
    isCameraOpen,
    setIsCameraOpen,
    onPickImage,
    onTakePicture,
    onCameraCapture,
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

  const onSend = useCallback(async (overrideText?: string) => {
    const nextText = (overrideText ?? text).trim();
    if (!nextText && !selectedImage && !recordedAudioUri) {
      return;
    }

    const sent = await sendMessage({
      text: nextText || undefined,
      imageUri: selectedImage || undefined,
      audioUri: recordedAudioUri || undefined,
      audioBlob: recordedAudioBlob || undefined,
    });

    if (sent) {
      setText('');
      clearMedia();
    }
  }, [text, selectedImage, recordedAudioUri, recordedAudioBlob, sendMessage, clearMedia]);

  // F3.1: Follow-up buttons send ONLY text, no attached media
  const onFollowUpPress = useCallback((questionText: string) => {
    void sendMessage({ text: questionText });
  }, [sendMessage]);

  const onRecommendationPress = useCallback((recommendationText: string) => {
    setText(recommendationText);
  }, []);

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

  const submitReport = useCallback(async (messageId: string, reason: 'offensive' | 'inaccurate' | 'inappropriate' | 'other') => {
    try {
      await chatApi.reportMessage({ messageId, reason });
      Alert.alert('Thank you', 'Your report has been submitted.');
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  }, []);

  const onReportMessage = useCallback((messageId: string) => {
    Alert.alert('Report message', 'Why are you reporting this message?', [
      { text: 'Offensive', onPress: () => void submitReport(messageId, 'offensive') },
      { text: 'Inaccurate', onPress: () => void submitReport(messageId, 'inaccurate') },
      { text: 'Inappropriate', onPress: () => void submitReport(messageId, 'inappropriate') },
      { text: 'Other', onPress: () => void submitReport(messageId, 'other') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [submitReport]);

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
        onClose={() => setIsCameraOpen(false)}
        onCapture={onCameraCapture}
      />
    );
  }

  return (
    <LiquidScreen background={pickMuseumBackground(4)} contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {isRecording ? <Text style={styles.recordingStatus}>Recording voice input...</Text> : null}

        <GlassCard style={styles.headerShell} intensity={58}>
          <View style={styles.headerRow}>
            <View style={styles.headerContent}>
              <Text style={styles.header} numberOfLines={1}>{sessionTitle || 'Art Session'}</Text>
              <View style={styles.headerSubRow}>
                <Text style={styles.subheader} numberOfLines={1}>{museumName || `${sessionId.slice(0, 12)}...`}</Text>
                {expertiseLevel ? <ExpertiseBadge level={expertiseLevel} /> : null}
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} disabled={isClosing}>
              {isClosing ? (
                <ActivityIndicator size='small' color='#334155' />
              ) : (
                <Ionicons name='close' size={20} color={liquidColors.textPrimary} />
              )}
            </Pressable>
          </View>
        </GlassCard>

        {error ? <ErrorNotice message={error} onDismiss={clearError} /> : null}

        <GlassCard style={styles.chatSurface} intensity={42}>
          {isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size='large' color={liquidColors.primary} />
            </View>
          ) : (
            <ChatMessageList
              messages={messages}
              isSending={isSending}
              locale={locale}
              museumMode={museumMode}
              onFollowUpPress={onFollowUpPress}
              onRecommendationPress={onRecommendationPress}
              onSuggestion={(suggestion) => void onSend(suggestion)}
              onCamera={onTakePicture}
              onImageError={onMessageImageError}
              onReport={onReportMessage}
            />
          )}
        </GlassCard>

        {selectedImage ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: selectedImage }} style={styles.preview} />
            <View style={styles.previewMenu}>
              <FloatingContextMenu
                actions={[
                  { id: 'replace', icon: 'images-outline', label: 'Replace', onPress: () => void onPickImage() },
                  { id: 'clear-image', icon: 'trash-outline', label: 'Remove', onPress: clearSelectedImage },
                ]}
              />
            </View>
          </View>
        ) : null}

        {recordedAudioUri ? (
          <GlassCard style={styles.audioCard} intensity={56}>
            <Text style={styles.audioTitle}>Voice message ready</Text>
            <View style={styles.audioRow}>
              <Pressable style={styles.attachButton} onPress={() => void playRecordedAudio()} disabled={isPlayingAudio}>
                <Text style={styles.attachText}>{isPlayingAudio ? 'Playing...' : 'Play'}</Text>
              </Pressable>
              <Pressable style={styles.attachButton} onPress={clearMedia}>
                <Text style={styles.attachText}>Clear</Text>
              </Pressable>
            </View>
          </GlassCard>
        ) : null}

        <View style={styles.attachRow}>
          <Pressable style={styles.attachButton} onPress={() => void onPickImage()}>
            <Text style={styles.attachText}>Gallery</Text>
          </Pressable>
          <Pressable style={styles.attachButton} onPress={onTakePicture}>
            <Text style={styles.attachText}>Lens</Text>
          </Pressable>
          <Pressable style={styles.attachButton} onPress={() => void toggleRecording()}>
            <Text style={styles.attachText}>{isRecording ? 'Stop Audio' : 'Audio'}</Text>
          </Pressable>
        </View>

        <ChatInput
          value={text}
          onChangeText={setText}
          onSend={() => void onSend()}
          isSending={isSending}
        />
      </KeyboardAvoidingView>
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
    color: '#991B1B',
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
    color: liquidColors.textPrimary,
  },
  headerSubRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subheader: {
    color: '#475569',
    fontSize: 12,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  chatSurface: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: {
    marginTop: 8,
  },
  preview: {
    width: 100,
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
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
    color: liquidColors.textPrimary,
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
    borderColor: 'rgba(148,163,184,0.44)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.64)',
  },
  attachText: {
    color: '#1E293B',
    fontWeight: '600',
  },
});
