import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableWithoutFeedback,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useChatSession, type ChatUiMessage } from '@/features/chat/application/useChatSession';
import { useStatusPhase } from '@/features/chat/application/useStatusPhase';
import { deriveHeroCollapsed, useArtworkHero } from '@/features/chat/application/useArtworkHero';
import { deriveTopBarCollapsed } from '@/features/chat/application/useCollapsibleTopBar';
import {
  buildVisitSummary,
  findLastAssistantMessage,
} from '@/features/chat/application/chatSessionLogic.pure';
import { useAudioRecorder } from '@/features/chat/application/useAudioRecorder';
import { useImagePicker } from '@/features/chat/application/useImagePicker';
import { useCompareImagePicker } from '@/features/chat/application/useCompareImagePicker';
import { useCompareTrigger } from '@/features/chat/application/useCompareTrigger';
import { useAiConsent } from '@/features/chat/application/useAiConsent';
import { useAutoTts } from '@/features/chat/application/useAutoTts';
import { useSottoVoce } from '@/features/chat/application/useSottoVoce';
import { useVoiceDisclosure } from '@/features/chat/hooks/useVoiceDisclosure';
import { useAudioDescriptionMode } from '@/features/settings/application/useAudioDescriptionMode';
import { useMuseumPrefetch } from '@/features/museum/application/useMuseumPrefetch';
import { useChatSessionActions } from '@/features/chat/application/useChatSessionActions';
import { useChatSessionInputHandlers } from '@/features/chat/application/useChatSessionInputHandlers';
import { useChatSessionIntents } from '@/features/chat/application/useChatSessionIntents';
import { ArtworkHeroCard } from '@/features/chat/ui/ArtworkHeroCard';
import { ArtworkHeroModal } from '@/features/chat/ui/ArtworkHeroModal';
import { ChatHeader } from '@/features/chat/ui/ChatHeader';
import { ChatSessionSurface } from '@/features/chat/ui/ChatSessionSurface';
import { Composer } from '@/features/chat/ui/Composer';
import { LowDataBadge } from '@/features/chat/ui/LowDataBadge';
import { BottomSheetRouter, useBottomSheetRouter } from '@/features/chat/ui/bottom-sheet-router';
import type { MusaiumDeeplink } from '@/features/chat/application/sanitizeCartelCode';
import { setSessionContext } from '@/features/chat/infrastructure/chatApi/metadata';
import { WalkSuggestionChips } from '@/features/chat/ui/WalkSuggestionChips';
import { useMessageActions } from '@/features/chat/application/useMessageActions';
import { ErrorState } from '@/shared/ui/ErrorState';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';
import { styles } from './_styles/chatSession';

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

  const [pendingVoiceAction, setPendingVoiceAction] = useState(false);

  const bottomSheetRouter = useBottomSheetRouter();
  const openSheet = bottomSheetRouter.open;
  const closeSheet = bottomSheetRouter.close;
  const { showAiConsent, setShowAiConsent, consentResolved, acceptAiConsent, recheckConsent } =
    useAiConsent();
  const {
    shouldShowDisclosure: shouldShowVoiceDisclosure,
    isAcknowledged: voiceDisclosureAcknowledged,
    acknowledge: acknowledgeVoiceDisclosure,
  } = useVoiceDisclosure(sessionId);

  const {
    messages,
    isEmpty,
    isLoading,
    isSending,
    isStreaming,
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
    reload,
  } = useChatSession(sessionId);

  useMuseumPrefetch(museumName ?? null, locale);

  const heroModel = useArtworkHero(messages);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [heroModalVisible, setHeroModalVisible] = useState(false);
  const [topBarCollapsed, setTopBarCollapsed] = useState(false);

  const onHeroExpand = useCallback(() => {
    setHeroModalVisible(true);
  }, []);

  const onHeroModalClose = useCallback(() => {
    setHeroModalVisible(false);
  }, []);

  const onListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    setHeroCollapsed((prev) => deriveHeroCollapsed(y, prev));
    setTopBarCollapsed((prev) => deriveTopBarCollapsed(y, prev));
  }, []);

  const {
    isRecording,
    recordedAudioUri,
    recordedAudioBlob,
    isPlayingAudio,
    toggleRecording: rawToggleRecording,
    playRecordedAudio,
    clearRecordedAudio,
  } = useAudioRecorder();

  const toggleRecording = useCallback(async () => {
    if (!voiceDisclosureAcknowledged) {
      setPendingVoiceAction(true);
      return;
    }
    await rawToggleRecording();
  }, [voiceDisclosureAcknowledged, rawToggleRecording]);

  const onAcknowledgeVoiceDisclosure = useCallback(async () => {
    await acknowledgeVoiceDisclosure();
    if (pendingVoiceAction) {
      setPendingVoiceAction(false);
      await rawToggleRecording();
    }
  }, [acknowledgeVoiceDisclosure, pendingVoiceAction, rawToggleRecording]);

  const { selectedImage, onPickImage, onTakePicture, clearSelectedImage } = useImagePicker();

  const { pickForCompare } = useCompareImagePicker();
  const compareLocale = locale === 'fr' ? 'fr' : 'en';
  const {
    trigger: triggerCompare,
    isPending: isComparing,
    error: compareError,
  } = useCompareTrigger({ sessionId, locale: compareLocale, reload });

  const onCompareImage = useCallback(() => {
    void (async () => {
      const image = await pickForCompare();
      if (image) triggerCompare(image);
    })();
  }, [pickForCompare, triggerCompare]);

  const { enabled: audioDescEnabled } = useAudioDescriptionMode();
  const { enabled: sottoVoce, toggle: toggleSottoVoce } = useSottoVoce();
  const [sessionAudioOverride, setSessionAudioOverride] = useState<boolean | null>(null);
  const effectiveAudioDesc = (sessionAudioOverride ?? audioDescEnabled) && !sottoVoce;

  const tts = useAutoTts({ messages, enabled: effectiveAudioDesc });

  const { phase: currentPhase } = useStatusPhase({
    isSending,
    hasImage: !!selectedImage,
    ttsPending: tts.loading,
  });

  const { isWalkMode } = useChatSessionIntents({
    intent: params.intent,
    initialPrompt: params.initialPrompt,
    isLoading,
    error,
    onTakePicture,
    toggleRecording,
    sendMessage,
  });

  const lastAssistantMessage = useMemo(() => findLastAssistantMessage(messages), [messages]);

  const lastWalkSuggestions = useMemo(() => {
    if (!isWalkMode) return [];
    return lastAssistantMessage?.suggestions ?? [];
  }, [isWalkMode, lastAssistantMessage]);

  const visitSummary = useMemo(
    () => buildVisitSummary(messages, sessionTitle),
    [messages, sessionTitle],
  );

  const voiceIntroVisible = shouldShowVoiceDisclosure && pendingVoiceAction;

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

  const reportMessageRef = useRef<((messageId: string) => void) | null>(null);

  const { copyText, shareText } = useMessageActions({
    onReport: (id: string) => {
      reportMessageRef.current?.(id);
    },
  });

  const openContextMenu = useCallback(
    (msg: ChatUiMessage) => {
      openSheet('context-menu', {
        message: msg,
        onCopy: (m) => void copyText(m),
        onShare: (m) => void shareText(m),
        onReport: (messageId) => reportMessageRef.current?.(messageId),
      });
    },
    [openSheet, copyText, shareText],
  );

  const openBrowser = useCallback(
    (url: string) => {
      openSheet('browser', { url });
    },
    [openSheet],
  );

  const setBrowserUrlBridge = useCallback(
    (url: string | null) => {
      if (url) openBrowser(url);
      else closeSheet();
    },
    [openBrowser, closeSheet],
  );

  const sessionActions = useChatSessionActions({
    messages,
    refreshMessageImageUrl,
    onMessageLongPress: openContextMenu,
    setBrowserUrl: setBrowserUrlBridge,
  });

  useEffect(() => {
    reportMessageRef.current = sessionActions.onReportMessage;
  }, [sessionActions.onReportMessage]);

  useFocusEffect(
    useCallback(() => {
      recheckConsent();
    }, [recheckConsent]),
  );

  useEffect(() => {
    if (showAiConsent) {
      openSheet('consent', {
        onAccept: (grantedScopes) => {
          void acceptAiConsent(grantedScopes);
        },
        onPrivacy: () => {
          setShowAiConsent(false);
          closeSheet();
          router.push('/(stack)/privacy');
          const unsub = navigation.addListener('focus', () => {
            unsub();
            recheckConsent();
          });
        },
      });
    }
  }, [
    showAiConsent,
    acceptAiConsent,
    setShowAiConsent,
    recheckConsent,
    navigation,
    openSheet,
    closeSheet,
  ]);

  useEffect(() => {
    if (dailyLimitReached) {
      openSheet('daily-limit', {
        onDismiss: () => {
          clearDailyLimit();
        },
      });
    }
  }, [dailyLimitReached, clearDailyLimit, openSheet]);

  useEffect(() => {
    if (voiceIntroVisible) {
      openSheet('voice-intro', {
        locale,
        onAcknowledge: () => {
          void onAcknowledgeVoiceDisclosure();
        },
      });
    }
  }, [voiceIntroVisible, locale, onAcknowledgeVoiceDisclosure, openSheet]);

  const openSummary = useCallback(() => {
    openSheet('summary', { summary: visitSummary });
  }, [openSheet, visitSummary]);

  const openAiDisclosure = useCallback(() => {
    openSheet('ai-disclosure', {
      onLearnMore: () => {
        closeSheet();
        router.push('/(stack)/privacy');
      },
    });
  }, [openSheet, closeSheet]);

  const handleCartelScanned = useCallback(
    (payload: string | MusaiumDeeplink) => {
      if (typeof payload === 'string') {
        void sendMessage({
          text: t('chat.cartelScanner.lookup_template', { code: payload }),
        });
        return;
      }
      void setSessionContext({
        sessionId,
        currentArtworkId: payload.artworkId,
        currentRoom: payload.roomId,
      }).catch(() => undefined);
      void sendMessage({ text: t('chat.cartelScanner.detected_artwork.title') });
    },
    [sendMessage, t, sessionId],
  );

  const onOpenCartelScanner = useCallback(() => {
    openSheet('cartel-scanner', { onScanned: handleCartelScanned });
  }, [openSheet, handleCartelScanned]);

  const onOpenAttachments = useCallback(() => {
    openSheet('attachment-picker', {
      recordedAudioUri,
      isPlayingAudio,
      isRecording,
      onPickImage: () => void onPickImage(),
      onTakePicture: () => void onTakePicture(),
      toggleRecording,
      playRecordedAudio: () => void playRecordedAudio(),
      clearMedia: inputHandlers.clearMedia,
      onOpenScanner: onOpenCartelScanner,
      onCompareImage,
    });
  }, [
    openSheet,
    recordedAudioUri,
    isPlayingAudio,
    isRecording,
    onPickImage,
    onTakePicture,
    toggleRecording,
    playRecordedAudio,
    inputHandlers.clearMedia,
    onOpenCartelScanner,
    onCompareImage,
  ]);

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
            isClosing={inputHandlers.isClosing}
            onClose={() => {
              void inputHandlers.onClose();
            }}
            onSummary={openSummary}
            audioDescriptionEnabled={effectiveAudioDesc}
            onToggleAudioDescription={() => {
              setSessionAudioOverride((prev) => !(prev ?? audioDescEnabled));
            }}
            sottoVoceEnabled={sottoVoce}
            onToggleSottoVoce={() => {
              void toggleSottoVoce();
            }}
            onOpenAiDisclosure={openAiDisclosure}
            collapsed={topBarCollapsed}
          />

          <LowDataBadge />

          {isWalkMode ? (
            <Text
              testID="walk-mode-banner"
              style={[styles.walkBanner, { color: theme.primary }]}
              accessibilityRole="header"
            >
              {t('chat.walk.headerLabel')}
            </Text>
          ) : null}

          {isComparing ? (
            <Text
              testID="compare-status"
              style={[styles.recordingStatus, { color: theme.primary }]}
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
            >
              {t('chat.compare.title')}
            </Text>
          ) : null}

          {error ? (
            <ErrorState
              variant="inline"
              title={error}
              onDismiss={clearError}
              testID="error-notice"
            />
          ) : null}

          {compareError ? (
            <ErrorState variant="inline" title={compareError} testID="compare-error-notice" />
          ) : null}

          <ArtworkHeroCard model={heroModel} collapsed={heroCollapsed} onExpand={onHeroExpand} />

          <ChatSessionSurface
            isLoading={isLoading}
            messages={messages}
            isSending={isSending}
            isStreaming={isStreaming}
            locale={locale}
            onRecommendationPress={inputHandlers.onRecommendationPress}
            onCamera={() => void onTakePicture()}
            onImageError={sessionActions.onMessageImageError}
            onReport={sessionActions.onMessageLongPress}
            onLinkPress={sessionActions.onMessageLinkPress}
            onRetry={retryMessage}
            isAssistantPending={lastAssistantPending}
            currentPhase={currentPhase}
            surfaceStyle={styles.chatSurface}
            skeletonStyle={styles.skeletonChat}
            onScroll={onListScroll}
          />

          <WalkSuggestionChips
            suggestions={lastWalkSuggestions}
            onSelect={inputHandlers.onWalkChipSelect}
          />

          <Composer
            text={inputHandlers.text}
            onChangeText={inputHandlers.setText}
            onSend={() => void inputHandlers.onSend()}
            isSending={isSending}
            disabled={!consentResolved || showAiConsent}
            imageUri={selectedImage}
            onClearImage={clearSelectedImage}
            recordedAudioUri={recordedAudioUri}
            isRecording={isRecording}
            toggleRecording={toggleRecording}
            onOpenAttachments={onOpenAttachments}
          />
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <BottomSheetRouter />

      <ArtworkHeroModal visible={heroModalVisible} model={heroModel} onClose={onHeroModalClose} />
    </LiquidScreen>
  );
}
