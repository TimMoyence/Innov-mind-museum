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
import { buildVisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import { useAudioRecorder } from '@/features/chat/application/useAudioRecorder';
import { useImagePicker } from '@/features/chat/application/useImagePicker';
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
import { CollapsibleTopBar } from '@/features/chat/ui/CollapsibleTopBar';
import { ChatSessionSurface } from '@/features/chat/ui/ChatSessionSurface';
import { Composer } from '@/features/chat/ui/Composer';
import { BottomSheetRouter, useBottomSheetRouter } from '@/features/chat/ui/bottom-sheet-router';
import type { MusaiumDeeplink } from '@/features/chat/application/sanitizeCartelCode';
import { setSessionContext } from '@/features/chat/infrastructure/chatApi/metadata';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';
import { WalkSuggestionChips } from '@/features/chat/ui/WalkSuggestionChips';
import { useMessageActions } from '@/features/chat/application/useMessageActions';
import { ErrorState } from '@/shared/ui/ErrorState';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';
import { styles } from './_styles/chatSession';

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

  // Voice-disclosure gate state: when the user taps the mic for the first
  // time we open the `voice-intro` sheet. The actual recording action is
  // queued until the user acknowledges. This satisfies EU AI Act Article 50
  // for every fresh voice session (see docs/legal/AI_DISCLOSURE.md).
  const [pendingVoiceAction, setPendingVoiceAction] = useState(false);

  const bottomSheetRouter = useBottomSheetRouter();
  // Destructure stable refs so consumer effects/callbacks don't re-fire on
  // every router-state transition. `bottomSheetRouter` itself is memoised on
  // the state machine and rotates on every dispatch ; the methods inside are
  // useCallback([]) — referentially stable across the rotation.
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

  // A2 — Artwork hero card pinned. The model is derived purely from the
  // message list (first user image + first matching assistant detectedArtwork).
  // `heroCollapsed` flips on scroll past 80dp / re-expands below 40dp
  // (hysteresis). `heroModalVisible` opens the fullscreen pinch-zoom modal on
  // tap. Both states are screen-local — no global store (R29).
  const heroModel = useArtworkHero(messages);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [heroModalVisible, setHeroModalVisible] = useState(false);
  // A4 — top bar collapses on scroll past 80dp / re-expands below 40dp.
  // Shares the same `onListScroll` source as A2 (one scroll handler, two
  // independent screen-local states — no global store).
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

  /**
   * Wrapped `toggleRecording` that enforces the EU AI Act Article 50 voice
   * disclosure gate. On the very first mic press of a session (when the user
   * has not yet acknowledged the disclosure) we mark the recording as pending
   * — the `voice-intro` sheet then opens via the effect below, and the actual
   * `rawToggleRecording()` call fires from `onAcknowledgeVoiceDisclosure`.
   * Subsequent presses pass through untouched until the session ends.
   */
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

  const { enabled: audioDescEnabled } = useAudioDescriptionMode();
  const { enabled: sottoVoce, toggle: toggleSottoVoce } = useSottoVoce();
  const [sessionAudioOverride, setSessionAudioOverride] = useState<boolean | null>(null);
  // B5 — sotto-voce gate : when sotto-voce is ON, force-disable auto-TTS
  // regardless of session override or global audio-description preference.
  // `useAutoTts` runs its own cleanup (`stopPlayback`) when `enabled` flips
  // to `false`, so this gate naturally stops in-flight playback.
  const effectiveAudioDesc = (sessionAudioOverride ?? audioDescEnabled) && !sottoVoce;

  // A5 (R16) — auto-TTS hook exposes its in-flight `loading` signal so the
  // screen can surface `synthesizing-voice` in `<StatusIndicator>` while the
  // assistant audio is being fetched + decoded. Without this wiring the
  // phase would never be observable in runtime (review I2 finding).
  const tts = useAutoTts({ messages, enabled: effectiveAudioDesc });

  // A5 — drive the localised `<StatusIndicator>` shown while the assistant
  // is composing a response. The hook synthesises a client-side phase
  // sequence ; the real terminal phase lives on `metadata.phase` from the
  // BE (consumed only for telemetry, R22).
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

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i];
      if (candidate?.role === 'assistant') return candidate;
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

  // Stable mutable holder for the report handler so the sheet-content
  // callbacks (`onReport`, the alert chain, etc.) don't need to be recreated
  // every render — the screen rewires it once `useChatSessionActions` returns
  // below. Allocating it before `useMessageActions` keeps the lexical order
  // sane: hooks read the ref but never its current value at hook-call time.
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

  // Wire the freshly-returned report handler into the ref so any sheet that
  // already mounted captures it transparently on next invocation.
  useEffect(() => {
    reportMessageRef.current = sessionActions.onReportMessage;
  }, [sessionActions.onReportMessage]);

  // Re-read the consent flag on every screen focus. `useAiConsent` reads
  // AsyncStorage once on mount — without this, a user who pushes Settings,
  // revokes the required scope (which clears the local "accepted" memo via
  // `clearConsentAcceptedFlag()`) and pops back finds the chat screen still
  // mounted, `showAiConsent` still false, and the consent sheet dormant
  // despite the BE having no granted required scope. Reported 2026-05-20 :
  // "j'ai tout remis à zéro mais l'écran ne se réaffiche pas."
  useFocusEffect(
    useCallback(() => {
      recheckConsent();
    }, [recheckConsent]),
  );

  // Open the AI consent sheet when `useAiConsent` flips it on. The hook owns
  // the boolean; the screen reacts to it via the router. The sheet content
  // itself calls `acceptAiConsent()` then closes, which clears `showAiConsent`
  // through the hook's own callback chain.
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
    // We intentionally do NOT auto-close here when `showAiConsent` flips back
    // to false — closing is owned by the sheet content's CTA. Adding a
    // `close()` here would race the accept handler.
  }, [
    showAiConsent,
    acceptAiConsent,
    setShowAiConsent,
    recheckConsent,
    navigation,
    openSheet,
    closeSheet,
  ]);

  // Mirror `dailyLimitReached` → `daily-limit` sheet. The sheet's CTA calls
  // `onDismiss` which routes to `clearDailyLimit`.
  useEffect(() => {
    if (dailyLimitReached) {
      openSheet('daily-limit', {
        onDismiss: () => {
          clearDailyLimit();
        },
      });
    }
  }, [dailyLimitReached, clearDailyLimit, openSheet]);

  // Mirror voice-intro pending state → `voice-intro` sheet.
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

  // B4 — when the user scans a cartel QR, push the sanitised code to the
  // chat as a text message via the i18n lookup template. The orchestrator
  // resolves the artwork via the existing `museumName` / `locationString`
  // context — no BE endpoint added in V1 (Q1 V1.1+).
  //
  // W3 (T5.2) — also accept a parsed `MusaiumDeeplink` payload (UUID-validated
  // upstream by `parseMusaiumDeeplink`). The deeplink path propagates the
  // scanned IDs to the BE via `setSessionContext` so the LLM prompt builder
  // picks them up on the next message (R22 / `[CURRENT ARTWORK]`). The user-
  // facing message is the same `chat.cartelScanner.detected_artwork.title`
  // copy — the orchestrator + DB enrichment fill in the artwork details.
  const handleCartelScanned = useCallback(
    (payload: string | MusaiumDeeplink) => {
      if (typeof payload === 'string') {
        void sendMessage({
          text: t('chat.cartelScanner.lookup_template', { code: payload }),
        });
        return;
      }
      // Deeplink path — fire context patch + a user-facing announcement
      // message. Both calls are best-effort: a BE patch failure leaves the
      // chat usable (LLM falls back to museum-level context).
      void setSessionContext({
        sessionId,
        currentArtworkId: payload.artworkId,
        currentRoom: payload.roomId,
      }).catch(() => {
        // Swallow — logged by openApiRequest. The chat continues; the LLM
        // simply won't see the [CURRENT ARTWORK] section this turn.
      });
      void sendMessage({ text: t('chat.cartelScanner.detected_artwork.title') });
    },
    [sendMessage, t, sessionId],
  );

  // B4 — open the 9th C4 route (fullscreen camera scanner). The route is
  // closed automatically by `<CartelScannerSheetContent>` on a successful
  // scan or via the cancel button.
  const onOpenCartelScanner = useCallback(() => {
    openSheet('cartel-scanner', { onScanned: handleCartelScanned });
  }, [openSheet, handleCartelScanned]);

  // A1 — open the attachment-picker bottom sheet. Wires the audio + image
  // hooks through the router params so the sheet content can drive the
  // camera/gallery/record actions and the play/clear preview block.
  // B4 extends the params with `onOpenScanner` (4th picker action).
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

          <CollapsibleTopBar
            sessionTitle={sessionTitle}
            expertiseLevel={expertiseLevel}
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

          <ArtworkHeroCard model={heroModel} collapsed={heroCollapsed} onExpand={onHeroExpand} />

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
