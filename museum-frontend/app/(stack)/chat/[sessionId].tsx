import { useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableWithoutFeedback,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useChatSession } from '@/features/chat/application/useChatSession';
import { buildVisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import { useAudioRecorder } from '@/features/chat/application/useAudioRecorder';
import { useImagePicker } from '@/features/chat/application/useImagePicker';
import { useAiConsent } from '@/features/chat/application/useAiConsent';
import { useAutoTts } from '@/features/chat/application/useAutoTts';
import { useAudioDescriptionMode } from '@/features/settings/application/useAudioDescriptionMode';
import { useMuseumPrefetch } from '@/features/museum/application/useMuseumPrefetch';
import { useChatSessionActions } from '@/features/chat/application/useChatSessionActions';
import { useChatSessionInputHandlers } from '@/features/chat/application/useChatSessionInputHandlers';
import { useChatSessionIntents } from '@/features/chat/application/useChatSessionIntents';
import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { ChatHeader } from '@/features/chat/ui/ChatHeader';
import { ChatInput } from '@/features/chat/ui/ChatInput';
import { ChatSessionModals } from '@/features/chat/ui/ChatSessionModals';
import { ChatSessionSurface } from '@/features/chat/ui/ChatSessionSurface';
import { MediaAttachmentPanel } from '@/features/chat/ui/MediaAttachmentPanel';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';
import { WalkSuggestionChips } from '@/features/chat/ui/WalkSuggestionChips';
import { useMessageActions } from '@/features/chat/application/useMessageActions';
import { ErrorState } from '@/shared/ui/ErrorState';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';
import { styles } from './chatSession.styles';

/** Renders the chat session screen with message history, text/image/audio input, and assistant response display. */
export default function ChatSessionScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    sessionId: string;
    intent?: string;
    initialPrompt?: string;
  }>();
  const sessionId = useMemo(() => params.sessionId || '', [params.sessionId]);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [contextMenuMessage, setContextMenuMessage] = useState<ChatUiMessage | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);

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
    dailyLimitReached,
    clearDailyLimit,
    sendMessage,
    retryMessage,
    refreshMessageImageUrl,
    locale,
    sessionTitle,
    museumName,
    lastAssistantPending,
  } = useChatSession(sessionId);

  useMuseumPrefetch(museumName ?? null, locale);

  const {
    isRecording,
    recordedAudioUri,
    recordedAudioBlob,
    isPlayingAudio,
    toggleRecording,
    playRecordedAudio,
    clearRecordedAudio,
  } = useAudioRecorder();

  const { selectedImage, onPickImage, onTakePicture, clearSelectedImage } = useImagePicker();

  const { enabled: audioDescEnabled } = useAudioDescriptionMode();
  const [sessionAudioOverride, setSessionAudioOverride] = useState<boolean | null>(null);
  const effectiveAudioDesc = sessionAudioOverride ?? audioDescEnabled;

  useAutoTts({ messages, enabled: effectiveAudioDesc });

  const { isWalkMode } = useChatSessionIntents({
    intent: params.intent,
    initialPrompt: params.initialPrompt,
    isLoading,
    error,
    onTakePicture,
    toggleRecording,
    sendMessage,
  });

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);
  const expertiseLevel = lastAssistantMessage?.metadata?.expertiseSignal;

  const lastWalkSuggestions = useMemo(() => {
    if (!isWalkMode) return [];
    return lastAssistantMessage?.suggestions ?? [];
  }, [isWalkMode, lastAssistantMessage]);

  const visitSummary = useMemo(
    () => buildVisitSummary(messages, sessionTitle),
    [messages, sessionTitle],
  );

  const inputHandlers = useChatSessionInputHandlers({
    sessionId,
    isEmpty,
    navigationCanGoBack: () => navigation.canGoBack(),
    selectedImage,
    recordedAudioUri,
    recordedAudioBlob,
    clearSelectedImage,
    clearRecordedAudio,
    sendMessage,
  });

  const sessionActions = useChatSessionActions({
    messages,
    refreshMessageImageUrl,
    onMessageLongPress: setContextMenuMessage,
    setBrowserUrl,
  });

  const { copyText, shareText } = useMessageActions({ onReport: sessionActions.onReportMessage });

  return (
    <LiquidScreen
      background={pickMuseumBackground(4)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.card.gapSmall }]}
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
            expertiseLevel={expertiseLevel}
            isClosing={inputHandlers.isClosing}
            onClose={() => {
              void inputHandlers.onClose();
            }}
            onSummary={() => {
              setShowSummary(true);
            }}
            audioDescriptionEnabled={effectiveAudioDesc}
            onToggleAudioDescription={() => {
              setSessionAudioOverride((prev) => !(prev ?? audioDescEnabled));
            }}
          />

          {isWalkMode ? (
            <Text
              testID="walk-mode-banner"
              style={[styles.walkBanner, { color: theme.primary }]}
              accessibilityRole="header"
            >
              {t('chat.walk.headerLabel')}
            </Text>
          ) : null}

          <OfflineBanner pendingCount={pendingCount} isOffline={isOffline} />
          {error ? (
            <ErrorState
              variant="inline"
              title={error}
              onDismiss={clearError}
              testID="error-notice"
            />
          ) : null}

          <ChatSessionSurface
            isLoading={isLoading}
            messages={messages}
            isSending={isSending}
            isStreaming={isStreaming}
            locale={locale}
            onFollowUpPress={inputHandlers.onFollowUpPress}
            onRecommendationPress={inputHandlers.onRecommendationPress}
            onCamera={() => void onTakePicture()}
            onImageError={sessionActions.onMessageImageError}
            onReport={sessionActions.onMessageLongPress}
            onLinkPress={sessionActions.onMessageLinkPress}
            onRetry={retryMessage}
            isAssistantPending={lastAssistantPending}
            surfaceStyle={styles.chatSurface}
            skeletonStyle={styles.skeletonChat}
          />

          <MediaAttachmentPanel
            recordedAudioUri={recordedAudioUri}
            isPlayingAudio={isPlayingAudio}
            isRecording={isRecording}
            playRecordedAudio={playRecordedAudio}
            clearMedia={inputHandlers.clearMedia}
            onPickImage={() => void onPickImage()}
            onTakePicture={() => void onTakePicture()}
            toggleRecording={toggleRecording}
          />

          <WalkSuggestionChips
            suggestions={lastWalkSuggestions}
            onSelect={inputHandlers.onWalkChipSelect}
          />

          <ChatInput
            value={inputHandlers.text}
            onChangeText={inputHandlers.setText}
            onSend={() => void inputHandlers.onSend()}
            isSending={isSending || !consentResolved || showAiConsent}
            imageUri={selectedImage}
            onClearImage={clearSelectedImage}
          />
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <ChatSessionModals
        browserUrl={browserUrl}
        onCloseBrowser={() => {
          setBrowserUrl(null);
        }}
        contextMenuMessage={contextMenuMessage}
        onCloseContextMenu={() => {
          setContextMenuMessage(null);
        }}
        onCopyMessage={(msg) => void copyText(msg)}
        onShareMessage={(msg) => void shareText(msg)}
        onReportMessage={sessionActions.onReportMessage}
        showAiConsent={showAiConsent}
        onAcceptAiConsent={() => void acceptAiConsent()}
        onOpenPrivacy={() => {
          setShowAiConsent(false);
          router.push('/(stack)/privacy');
          const unsub = navigation.addListener('focus', () => {
            unsub();
            recheckConsent();
          });
        }}
        showSummary={showSummary}
        visitSummary={visitSummary}
        onCloseSummary={() => {
          setShowSummary(false);
        }}
        dailyLimitReached={dailyLimitReached}
        onDismissDailyLimit={clearDailyLimit}
      />
    </LiquidScreen>
  );
}
