import type * as ReactTypes from 'react';
import React from 'react';
import { render } from '../helpers/render-chat-screen';

import '../helpers/test-utils';

jest.mock('@/features/chat/ui/ChatMessageList', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    ChatMessageList: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-ChatMessageList' }),
    ),
  };
});
jest.mock('@/features/chat/ui/ChatInput', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    ChatInput: jest.fn(() => ReactNS.createElement(RN.View, { testID: 'mock-ChatInput' })),
  };
});
jest.mock('@/features/chat/ui/Composer', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    Composer: jest.fn(() => ReactNS.createElement(RN.View, { testID: 'mock-Composer' })),
  };
});
jest.mock('@/features/chat/ui/ChatHeader', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    ChatHeader: jest.fn(() => ReactNS.createElement(RN.View, { testID: 'mock-ChatHeader' })),
  };
});
jest.mock('@/features/chat/ui/OfflineBanner', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    OfflineBanner: jest.fn(() => ReactNS.createElement(RN.View, { testID: 'mock-OfflineBanner' })),
  };
});
jest.mock('@/features/chat/ui/WalkSuggestionChips', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    WalkSuggestionChips: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-WalkSuggestionChips' }),
    ),
  };
});
jest.mock('@/features/chat/ui/ArtworkHeroCard', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    ArtworkHeroCard: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-ArtworkHeroCard' }),
    ),
  };
});
jest.mock('@/features/chat/ui/ArtworkHeroModal', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    ArtworkHeroModal: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-ArtworkHeroModal' }),
    ),
  };
});

const mockExpoRouterMock = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouterMock.useLocalSearchParams = () => ({ sessionId: 'session-B5' });

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    canGoBack: () => true,
    addListener: (_event: string, _cb: () => void) => jest.fn(),
  }),
  useFocusEffect: (effect: ReactTypes.EffectCallback) => {
    const ReactRuntime = require('react') as typeof ReactTypes;
    ReactRuntime.useEffect(() => effect(), [effect]);
  },
}));

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: jest.fn(),
    deleteSessionIfEmpty: jest.fn(),
    reportMessage: jest.fn(),
  },
}));

const mockUseChatSession = jest.fn();
jest.mock('@/features/chat/application/useChatSession', () => ({
  useChatSession: (...args: unknown[]) => mockUseChatSession(...args),
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

jest.mock('@/features/chat/application/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    recordedAudioUri: null,
    recordedAudioBlob: null,
    isPlayingAudio: false,
    toggleRecording: jest.fn(),
    playRecordedAudio: jest.fn(),
    clearRecordedAudio: jest.fn(),
  }),
}));

jest.mock('@/features/chat/hooks/useVoiceDisclosure', () => ({
  useVoiceDisclosure: () => ({
    shouldShowDisclosure: false,
    isAcknowledged: true,
    acknowledge: jest.fn(),
  }),
}));

const mockUseAutoTts = jest.fn();
jest.mock('@/features/chat/application/useAutoTts', () => ({
  useAutoTts: (params: { messages: unknown[]; enabled: boolean }) => mockUseAutoTts(params),
}));

const mockAudioDescState = { enabled: true, isLoading: false, toggle: jest.fn() };
jest.mock('@/features/settings/application/useAudioDescriptionMode', () => ({
  useAudioDescriptionMode: () => mockAudioDescState,
}));

const mockSottoVoceState = { enabled: false, isLoading: false, toggle: jest.fn() };
jest.mock('@/features/chat/application/useSottoVoce', () => ({
  useSottoVoce: () => mockSottoVoceState,
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

jest.mock('@/features/chat/ui/bottom-sheet-router', () => ({
  BottomSheetRouter: () => null,
  useBottomSheetRouter: () => ({
    activeRoute: null,
    open: jest.fn(),
    close: jest.fn(),
  }),
}));

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

function defaultSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    dailyLimitReached: false,
    clearDailyLimit: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue(true),
    retryMessage: jest.fn(),
    refreshMessageImageUrl: jest.fn().mockResolvedValue(undefined),
    locale: 'en-US',
    sessionTitle: 'Test session',
    museumName: null,
    lastAssistantPending: false,
    ...overrides,
  };
}

function lastAutoTtsParams(): { messages: unknown[]; enabled: boolean } {
  const calls = mockUseAutoTts.mock.calls;
  if (calls.length === 0) throw new Error('useAutoTts was never called');
  return calls[calls.length - 1][0] as { messages: unknown[]; enabled: boolean };
}

function lastChatHeaderProps(): {
  sottoVoceEnabled?: boolean;
  onToggleSottoVoce?: () => void;
} {
  const mod = jest.requireMock<Record<string, jest.Mock>>('@/features/chat/ui/ChatHeader');
  const fn = mod.ChatHeader;
  if (!fn) throw new Error('ChatHeader mock not registered');
  const calls = fn.mock.calls;
  if (calls.length === 0) throw new Error('ChatHeader was never rendered');
  return calls[calls.length - 1][0] as {
    sottoVoceEnabled?: boolean;
    onToggleSottoVoce?: () => void;
  };
}

describe('ChatSessionScreen — B5 sotto-voce gate on useAutoTts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockImagePickerState.selectedImage = null;
    mockAudioDescState.enabled = true;
    mockAudioDescState.isLoading = false;
    mockSottoVoceState.enabled = false;
    mockSottoVoceState.isLoading = false;
    mockUseAutoTts.mockReturnValue({ stopAutoPlay: jest.fn(), loading: false });
    mockUseChatSession.mockReturnValue(defaultSession());
  });

  it('passes useAutoTts({ enabled: true }) when sotto-voce OFF and audio-desc global ON (R23, AC17)', () => {
    mockAudioDescState.enabled = true;
    mockSottoVoceState.enabled = false;
    render(<ChatSessionScreen />);
    expect(lastAutoTtsParams().enabled).toBe(true);
  });

  it('passes useAutoTts({ enabled: false }) when sotto-voce ON, even if audio-desc global ON (R23, AC16)', () => {
    mockAudioDescState.enabled = true;
    mockSottoVoceState.enabled = true;
    render(<ChatSessionScreen />);
    expect(lastAutoTtsParams().enabled).toBe(false);
  });

  it('passes useAutoTts({ enabled: false }) when sotto-voce ON and audio-desc global OFF (R23)', () => {
    mockAudioDescState.enabled = false;
    mockSottoVoceState.enabled = true;
    render(<ChatSessionScreen />);
    expect(lastAutoTtsParams().enabled).toBe(false);
  });

  it('passes useAutoTts({ enabled: false }) when sotto-voce OFF and audio-desc global OFF (sanity)', () => {
    mockAudioDescState.enabled = false;
    mockSottoVoceState.enabled = false;
    render(<ChatSessionScreen />);
    expect(lastAutoTtsParams().enabled).toBe(false);
  });

  it('forwards sottoVoceEnabled to <ChatHeader> (R22)', () => {
    mockSottoVoceState.enabled = true;
    render(<ChatSessionScreen />);
    expect(lastChatHeaderProps().sottoVoceEnabled).toBe(true);
  });

  it('forwards onToggleSottoVoce handler to <ChatHeader> (R22)', () => {
    render(<ChatSessionScreen />);
    expect(typeof lastChatHeaderProps().onToggleSottoVoce).toBe('function');
  });
});
