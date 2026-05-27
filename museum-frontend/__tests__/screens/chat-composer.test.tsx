/**
 * Screen integration tests for A1 — unified composer wiring.
 *
 * Confirms that:
 *   - ChatSessionScreen renders the new <Composer> (not the legacy
 *     <MediaAttachmentPanel>, which A1 burrys per doctrine).
 *   - Tapping the composer's `+` button calls
 *     `bottomSheetRouter.open('attachment-picker', { … })` with the audio +
 *     media handles wired through from the screen's hooks.
 *
 * Mirrors the C4 / A2 pattern: we mock the bottom-sheet-router barrel and
 * inspect captured `router.open()` calls. Heavy child components are mocked
 * to keep the screen tree shallow.
 *
 * Spec: docs/chat-ux-refonte/specs/A1.md §1.4, AC22-AC23.
 */

import type * as ReactTypes from 'react';
import React from 'react';
import { render, fireEvent, act } from '../helpers/render-chat-screen';

import '../helpers/test-utils';

// ── expo-router param override ──────────────────────────────────────────────
const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouter.useLocalSearchParams = () => ({ sessionId: 'session-a1' });

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    canGoBack: () => true,
    addListener: jest.fn(() => jest.fn()),
  }),
  useFocusEffect: (effect: ReactTypes.EffectCallback) => {
    const ReactRuntime = require('react') as typeof ReactTypes;
    ReactRuntime.useEffect(() => effect(), [effect]);
  },
}));

// ── useChatSession ──────────────────────────────────────────────────────────
const mockUseChatSession = jest.fn();
jest.mock('@/features/chat/application/useChatSession', () => ({
  useChatSession: (...args: unknown[]) => mockUseChatSession(...args),
}));

// ── Audio recorder + image picker hooks (state captured so we can assert
// they were wired through into the router.open params) ─────────────────────
const mockAudioRecorderState = {
  isRecording: false,
  recordedAudioUri: null as string | null,
  recordedAudioBlob: null as Blob | null,
  isPlayingAudio: false,
  toggleRecording: jest.fn(),
  playRecordedAudio: jest.fn(),
  clearRecordedAudio: jest.fn(),
};
jest.mock('@/features/chat/application/useAudioRecorder', () => ({
  useAudioRecorder: () => mockAudioRecorderState,
}));

jest.mock('@/features/chat/hooks/useVoiceDisclosure', () => ({
  useVoiceDisclosure: () => ({
    shouldShowDisclosure: false,
    isAcknowledged: true,
    acknowledge: jest.fn(async () => {}),
  }),
}));

const mockImagePickerState = {
  selectedImage: null as string | null,
  onPickImage: jest.fn(),
  onTakePicture: jest.fn(),
  clearSelectedImage: jest.fn(),
};
jest.mock('@/features/chat/application/useImagePicker', () => ({
  useImagePicker: () => mockImagePickerState,
}));

jest.mock('@/features/chat/application/useAutoTts', () => ({
  useAutoTts: () => ({ stopAutoPlay: jest.fn(), loading: false }),
}));

jest.mock('@/features/settings/application/useAudioDescriptionMode', () => ({
  useAudioDescriptionMode: () => ({ enabled: false, isLoading: false, toggle: jest.fn() }),
}));

jest.mock('@/features/chat/application/useAiConsent', () => ({
  useAiConsent: () => ({
    showAiConsent: false,
    setShowAiConsent: jest.fn(),
    consentResolved: true,
    acceptAiConsent: jest.fn(),
    recheckConsent: jest.fn(),
  }),
}));

jest.mock('@/features/chat/application/useMessageActions', () => ({
  useMessageActions: () => ({ copyText: jest.fn(), shareText: jest.fn() }),
}));

jest.mock('@/features/museum/application/useMuseumPrefetch', () => ({
  useMuseumPrefetch: jest.fn(),
}));

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: jest.fn(),
    deleteSessionIfEmpty: jest.fn(),
    reportMessage: jest.fn(),
  },
}));

// ── Bottom-sheet router mock ────────────────────────────────────────────────
const mockRouterOpen = jest.fn();
const mockRouterClose = jest.fn();
jest.mock('@/features/chat/ui/bottom-sheet-router', () => ({
  BottomSheetRouter: () => null,
  useBottomSheetRouter: () => ({
    activeRoute: null,
    open: mockRouterOpen,
    close: mockRouterClose,
  }),
}));

// ── Child mocks so the screen tree stays shallow ────────────────────────────
jest.mock('@/features/chat/ui/ChatMessageList', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    ChatMessageList: () => ReactNS.createElement(RN.View, { testID: 'chat-message-list' }),
  };
});

jest.mock('@/features/chat/ui/ChatHeader', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return { ChatHeader: () => ReactNS.createElement(RN.View, { testID: 'chat-header' }) };
});

jest.mock('@/features/chat/ui/ChatInput', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return { ChatInput: () => ReactNS.createElement(RN.View, { testID: 'chat-input' }) };
});

// MediaAttachmentPanel was deleted as part of A1 (doctrine `feedback_bury_dead_code`).
// The `queryByTestId('media-attachment-panel')` assertion below verifies the
// absence of the legacy surface — no mock needed since the module no longer
// exists. The screen renders the new <Composer> instead.

jest.mock('@/features/chat/ui/OfflineBanner', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return { OfflineBanner: () => ReactNS.createElement(RN.View, { testID: 'offline-banner' }) };
});

jest.mock('@/shared/ui/SkeletonChatBubble', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    SkeletonChatBubble: () => ReactNS.createElement(RN.View, { testID: 'skeleton-chat-bubble' }),
  };
});

// Capture the Composer props so we can both render a button to drive the
// behaviour AND assert the wiring of the prop bag from the screen.
const composerLastProps: Record<string, unknown>[] = [];
jest.mock('@/features/chat/ui/Composer', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    Composer: (props: Record<string, unknown>) => {
      composerLastProps.push(props);
      return ReactNS.createElement(
        RN.Pressable,
        {
          testID: 'composer-attach-button',
          onPress: props.onOpenAttachments as () => void,
          accessibilityRole: 'button',
        },
        null,
      );
    },
  };
});

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

function defaultChatSession() {
  return {
    messages: [],
    isEmpty: true,
    isLoading: false,
    isSending: false,
    isStreaming: false,
    isOffline: false,
    pendingCount: 0,
    error: null,
    clearError: jest.fn(),
    sendMessage: jest.fn(),
    retryMessage: jest.fn(),
    refreshMessageImageUrl: jest.fn(),
    locale: 'en-US',
    museumMode: false,
    sessionTitle: 'Test Chat Session',
    museumName: null,
    dailyLimitReached: false,
    clearDailyLimit: jest.fn(),
    lastAssistantPending: false,
  };
}

describe('ChatSessionScreen — A1 composer wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    composerLastProps.length = 0;
    mockAudioRecorderState.recordedAudioUri = null;
    mockAudioRecorderState.isRecording = false;
    mockAudioRecorderState.isPlayingAudio = false;
    mockUseChatSession.mockReturnValue(defaultChatSession());
  });

  it('renders the Composer (not the legacy MediaAttachmentPanel) (AC22, R21)', () => {
    const { queryByTestId, getByTestId } = render(<ChatSessionScreen />);
    expect(getByTestId('composer-attach-button')).toBeTruthy();
    expect(queryByTestId('media-attachment-panel')).toBeNull();
  });

  it('forwards audio + recording state to Composer props (R23)', () => {
    mockAudioRecorderState.recordedAudioUri = 'file:///tmp/audio.m4a';
    mockAudioRecorderState.isRecording = true;
    render(<ChatSessionScreen />);
    const last = composerLastProps[composerLastProps.length - 1];
    expect(last).toBeDefined();
    expect(last?.recordedAudioUri).toBe('file:///tmp/audio.m4a');
    expect(last?.isRecording).toBe(true);
    expect(typeof last?.toggleRecording).toBe('function');
    expect(typeof last?.onOpenAttachments).toBe('function');
  });

  it('opens the attachment-picker route when + is pressed (AC23, R22)', () => {
    const { getByTestId } = render(<ChatSessionScreen />);
    act(() => {
      fireEvent.press(getByTestId('composer-attach-button'));
    });
    const openedRoutes = mockRouterOpen.mock.calls.map((c) => c[0]);
    expect(openedRoutes).toContain('attachment-picker');
  });

  it('passes media + audio handles through router.open params (R22)', () => {
    mockAudioRecorderState.recordedAudioUri = 'file:///tmp/audio.m4a';
    mockAudioRecorderState.isPlayingAudio = false;
    mockAudioRecorderState.isRecording = false;
    const { getByTestId } = render(<ChatSessionScreen />);
    act(() => {
      fireEvent.press(getByTestId('composer-attach-button'));
    });
    const lastOpenCall = mockRouterOpen.mock.calls.find((c) => c[0] === 'attachment-picker');
    expect(lastOpenCall).toBeDefined();
    const params = lastOpenCall?.[1] as Record<string, unknown>;
    expect(params.recordedAudioUri).toBe('file:///tmp/audio.m4a');
    expect(params.isPlayingAudio).toBe(false);
    expect(params.isRecording).toBe(false);
    expect(typeof params.onPickImage).toBe('function');
    expect(typeof params.onTakePicture).toBe('function');
    expect(typeof params.toggleRecording).toBe('function');
    expect(typeof params.playRecordedAudio).toBe('function');
    expect(typeof params.clearMedia).toBe('function');
  });
});
