import type * as ReactTypes from 'react';
import React from 'react';
import { render, fireEvent, act } from '../helpers/render-chat-screen';

import '../helpers/test-utils';

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

const mockUseChatSession = jest.fn();
jest.mock('@/features/chat/application/useChatSession', () => ({
  useChatSession: (...args: unknown[]) => mockUseChatSession(...args),
}));

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
