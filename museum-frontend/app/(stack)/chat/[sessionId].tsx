import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { CustomCameraView } from '@/components/CameraView';
import { useChatSession, ChatUiMessage } from '@/features/chat/application/useChatSession';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { TypingIndicator } from '@/features/chat/ui/TypingIndicator';
import { WelcomeCard } from '@/features/chat/ui/WelcomeCard';
import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';
import { RecommendationChips } from '@/features/chat/ui/RecommendationChips';
import { FollowUpButtons } from '@/features/chat/ui/FollowUpButtons';
import { MarkdownBubble } from '@/features/chat/ui/MarkdownBubble';
import { ExpertiseBadge } from '@/features/chat/ui/ExpertiseBadge';

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

  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isIntentHandled, setIsIntentHandled] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webMediaStreamRef = useRef<MediaStream | null>(null);
  const webAudioChunksRef = useRef<BlobPart[]>([]);
  const webAudioObjectUrlRef = useRef<string | null>(null);
  const webAudioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const imageRefreshInFlightRef = useRef<Set<string>>(new Set());
  const flatListRef = useRef<FlatList<ChatUiMessage>>(null);

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
    sessionTitle,
    museumName,
  } = useChatSession(sessionId);

  // Derive last assistant metadata for recommendations/follow-up/expertise
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  const expertiseLevel = lastAssistantMessage?.metadata?.expertiseSignal;

  // Auto-scroll when messages change or sending starts
  useEffect(() => {
    if (messages.length > 0 || isSending) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isSending]);

  const revokeWebAudioObjectUrl = useCallback(() => {
    if (webAudioObjectUrlRef.current) {
      URL.revokeObjectURL(webAudioObjectUrlRef.current);
      webAudioObjectUrlRef.current = null;
    }
  }, []);

  const stopWebAudioStreamTracks = useCallback(() => {
    const stream = webMediaStreamRef.current;
    if (!stream) {
      return;
    }
    stream.getTracks().forEach((track) => track.stop());
    webMediaStreamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => undefined);
      }
      if (webMediaRecorderRef.current && webMediaRecorderRef.current.state !== 'inactive') {
        webMediaRecorderRef.current.stop();
      }
      stopWebAudioStreamTracks();
      if (webAudioPlaybackRef.current) {
        webAudioPlaybackRef.current.pause();
        webAudioPlaybackRef.current = null;
      }
      revokeWebAudioObjectUrl();
    };
  }, [recording, revokeWebAudioObjectUrl, stopWebAudioStreamTracks]);

  const onPickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Photo library access is required to send images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const onTakePicture = async () => {
    setIsCameraOpen(true);
  };

  const onCameraCapture = useCallback((uri: string) => {
    setSelectedImage(uri);
    setIsCameraOpen(false);
  }, []);

  const startRecording = async () => {
    if (Platform.OS === 'web') {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        Alert.alert(
          'Audio unavailable',
          'This browser does not support microphone recording. Try a modern Chrome, Safari, or Edge build.',
        );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      webMediaStreamRef.current = stream;
      webAudioChunksRef.current = [];
      revokeWebAudioObjectUrl();
      setRecordedAudioBlob(null);
      setRecordedAudioUri(null);

      const mediaRecorder = new MediaRecorder(stream);
      webMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          webAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      return;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Microphone access is required for voice input.');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const nextRecording = new Audio.Recording();
    await nextRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await nextRecording.startAsync();

    setRecording(nextRecording);
    setIsRecording(true);
  };

  const stopRecording = async () => {
    if (Platform.OS === 'web') {
      const mediaRecorder = webMediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        return;
      }

      const blob = await new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          const mimeType =
            mediaRecorder.mimeType && mediaRecorder.mimeType.length
              ? mediaRecorder.mimeType
              : 'audio/webm';
          resolve(new Blob(webAudioChunksRef.current, { type: mimeType }));
        };
        mediaRecorder.stop();
      });

      stopWebAudioStreamTracks();
      webMediaRecorderRef.current = null;
      setIsRecording(false);

      if (blob.size > 0) {
        revokeWebAudioObjectUrl();
        const objectUrl = URL.createObjectURL(blob);
        webAudioObjectUrlRef.current = objectUrl;
        setRecordedAudioBlob(blob);
        setRecordedAudioUri(objectUrl);
      }
      return;
    }

    if (!recording) {
      return;
    }

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    setIsRecording(false);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    if (uri) {
      setRecordedAudioBlob(null);
      setRecordedAudioUri(uri);
    }
  };

  const toggleRecording = async () => {
    try {
      if (isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch {
      setIsRecording(false);
      setRecording(null);
      Alert.alert('Audio error', 'Recording could not be started. Please try again.');
    }
  };

  const playRecordedAudio = async () => {
    if (!recordedAudioUri || isPlayingAudio) {
      return;
    }

    setIsPlayingAudio(true);

    try {
      if (Platform.OS === 'web') {
        if (webAudioPlaybackRef.current) {
          webAudioPlaybackRef.current.pause();
          webAudioPlaybackRef.current = null;
        }

        const audioElement = new window.Audio(recordedAudioUri);
        webAudioPlaybackRef.current = audioElement;
        audioElement.onended = () => {
          setIsPlayingAudio(false);
          webAudioPlaybackRef.current = null;
        };
        audioElement.onerror = () => {
          setIsPlayingAudio(false);
          webAudioPlaybackRef.current = null;
        };
        await audioElement.play();
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: recordedAudioUri },
        { shouldPlay: true },
      );

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          setIsPlayingAudio(false);
          sound.unloadAsync().catch(() => undefined);
          return;
        }

        if (status.didJustFinish) {
          setIsPlayingAudio(false);
          sound.unloadAsync().catch(() => undefined);
        }
      });
    } catch {
      setIsPlayingAudio(false);
      Alert.alert('Playback error', 'Unable to play this recording.');
    }
  };

  const clearMedia = () => {
    setSelectedImage(null);
    setRecordedAudioBlob(null);
    if (webAudioPlaybackRef.current) {
      webAudioPlaybackRef.current.pause();
      webAudioPlaybackRef.current = null;
    }
    revokeWebAudioObjectUrl();
    setRecordedAudioUri(null);
  };

  const onSend = async (overrideText?: string) => {
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
  };

  const onFollowUpPress = useCallback((questionText: string) => {
    void onSend(questionText);
  }, [sendMessage, selectedImage, recordedAudioUri, recordedAudioBlob]);

  const onRecommendationPress = useCallback((recommendationText: string) => {
    setText(recommendationText);
  }, []);

  useEffect(() => {
    if (isIntentHandled || !initialIntent) {
      return;
    }

    setIsIntentHandled(true);
    if (initialIntent === 'camera') {
      void onTakePicture();
      return;
    }

    void toggleRecording();
  }, [initialIntent, isIntentHandled]);

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

  const isLastAssistantMessage = useCallback(
    (item: ChatUiMessage) => lastAssistantMessage?.id === item.id,
    [lastAssistantMessage],
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
    <LiquidScreen background={pickMuseumBackground(4)} contentStyle={styles.screen}>
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
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <WelcomeCard
                museumMode={true}
                locale={locale}
                onSuggestion={(suggestion) => void onSend(suggestion)}
                onCamera={() => void onTakePicture()}
              />
            }
            ListFooterComponent={isSending ? <TypingIndicator /> : null}
            renderItem={({ item }) => {
              const isAssistant = item.role === 'assistant';
              const isLast = isLastAssistantMessage(item);

              const bubbleContent = (
                <>
                  {isAssistant ? (
                    <MarkdownBubble text={item.text} />
                  ) : (
                    <Text style={styles.userText}>{item.text}</Text>
                  )}
                  {item.image?.url ? (
                    <Image
                      source={{ uri: item.image.url }}
                      style={styles.messageImage}
                      resizeMode='cover'
                      onError={() => onMessageImageError(item.id)}
                    />
                  ) : null}
                  <Text style={styles.timestamp}>
                    {new Date(item.createdAt).toLocaleTimeString(locale || undefined, {
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
                      onLongPress={() => onReportMessage(item.id)}
                      style={[styles.bubble, styles.assistantBubble]}
                    >
                      {bubbleContent}
                    </Pressable>
                  ) : (
                    <View style={[styles.bubble, styles.userBubble]}>
                      {bubbleContent}
                    </View>
                  )}

                  {/* Artwork card */}
                  {isAssistant && item.metadata?.detectedArtwork?.title ? (
                    <ArtworkCard
                      title={item.metadata.detectedArtwork.title}
                      artist={item.metadata.detectedArtwork.artist}
                      museum={item.metadata.detectedArtwork.museum}
                      room={item.metadata.detectedArtwork.room}
                      confidence={item.metadata.detectedArtwork.confidence}
                    />
                  ) : null}

                  {/* Follow-up question buttons — last assistant message only */}
                  {isAssistant && isLast && item.metadata?.followUpQuestions?.length ? (
                    <FollowUpButtons
                      questions={item.metadata.followUpQuestions}
                      onPress={onFollowUpPress}
                    />
                  ) : null}

                  {/* Recommendation chips — last assistant message only */}
                  {isAssistant && isLast && item.metadata?.recommendations?.length ? (
                    <RecommendationChips
                      recommendations={item.metadata.recommendations}
                      onPress={onRecommendationPress}
                    />
                  ) : null}
                </View>
              );
            }}
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
                { id: 'clear-image', icon: 'trash-outline', label: 'Remove', onPress: () => setSelectedImage(null) },
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
        <Pressable style={styles.attachButton} onPress={() => void onTakePicture()}>
          <Text style={styles.attachText}>Lens</Text>
        </Pressable>
        <Pressable style={styles.attachButton} onPress={() => void toggleRecording()}>
          <Text style={styles.attachText}>{isRecording ? 'Stop Audio' : 'Audio'}</Text>
        </Pressable>
      </View>

      <GlassCard style={styles.inputRow} intensity={56}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder='Ask about an artwork, monument, or send voice/photo...'
          placeholderTextColor='#64748B'
          multiline
        />
        <Pressable style={styles.sendButton} onPress={() => void onSend()} disabled={isSending}>
          {isSending ? <ActivityIndicator color='#FFFFFF' /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </GlassCard>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 50,
    paddingHorizontal: 14,
    paddingBottom: 12,
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
  listContent: {
    paddingBottom: 16,
    gap: 10,
  },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
    padding: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: liquidColors.textPrimary,
  },
  sendButton: {
    borderRadius: 12,
    backgroundColor: liquidColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
