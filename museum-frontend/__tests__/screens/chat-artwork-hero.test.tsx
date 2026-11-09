import type * as ReactTypes from 'react';
import React from 'react';
import { render } from '../helpers/render-chat-screen';

import '../helpers/test-utils';

const mockArtworkHeroCard = jest.fn();
jest.mock(
  '@/features/chat/ui/ArtworkHeroCard',
  () => {
    const RN = require('react-native');
    const ReactNS = require('react');
    return {
      ArtworkHeroCard: (props: Record<string, unknown>) => {
        mockArtworkHeroCard(props);
        return ReactNS.createElement(RN.View, { testID: 'mock-ArtworkHeroCard' });
      },
    };
  },
  { virtual: true },
);

const mockArtworkHeroModal = jest.fn();
jest.mock(
  '@/features/chat/ui/ArtworkHeroModal',
  () => {
    const RN = require('react-native');
    const ReactNS = require('react');
    return {
      ArtworkHeroModal: (props: Record<string, unknown>) => {
        mockArtworkHeroModal(props);
        return ReactNS.createElement(RN.View, { testID: 'mock-ArtworkHeroModal' });
      },
    };
  },
  { virtual: true },
);

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
jest.mock('@/features/chat/ui/ChatHeader', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    ChatHeader: jest.fn(() => ReactNS.createElement(RN.View, { testID: 'mock-ChatHeader' })),
  };
});
jest.mock('@/features/chat/ui/Composer', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    Composer: jest.fn(() => ReactNS.createElement(RN.View, { testID: 'mock-Composer' })),
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

const mockExpoRouterMock = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouterMock.useLocalSearchParams = () => ({ sessionId: 'session-A2' });

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
  useVoiceDisclosure: () => ({ isAcknowledged: true, acknowledge: jest.fn() }),
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

describe('ChatSessionScreen — A2 ArtworkHeroCard wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mounts <ArtworkHeroCard> with a non-null model when messages contain a user image (AC16)', () => {
    mockUseChatSession.mockReturnValue(
      defaultSession({
        messages: [
          {
            id: 'u1',
            role: 'user',
            text: 'what is this?',
            createdAt: '2026-05-14T10:00:00.000Z',
            image: { url: 'https://signed.example.com/mona.jpg', expiresAt: 'never' },
          },
          {
            id: 'a1',
            role: 'assistant',
            text: 'It is the Mona Lisa.',
            createdAt: '2026-05-14T10:00:05.000Z',
            image: null,
            metadata: {
              detectedArtwork: {
                title: 'Mona Lisa',
                artist: 'Leonardo da Vinci',
                museum: 'Louvre',
                room: 'Salle des États',
                confidence: 0.93,
              },
            },
          },
        ],
      }),
    );

    render(<ChatSessionScreen />);

    expect(mockArtworkHeroCard).toHaveBeenCalled();
    const lastCallProps = mockArtworkHeroCard.mock.calls.at(-1)?.[0] as {
      model?: { imageUrl?: string; title?: string | null } | null;
    };
    expect(lastCallProps?.model).not.toBeNull();
    expect(lastCallProps?.model?.imageUrl).toBe('https://signed.example.com/mona.jpg');
    expect(lastCallProps?.model?.title).toBe('Mona Lisa');
  });

  it('renders <ArtworkHeroCard> with model=null when no user image is present (AC16 negative)', () => {
    mockUseChatSession.mockReturnValue(
      defaultSession({
        messages: [
          {
            id: 'u1',
            role: 'user',
            text: 'hello',
            createdAt: '2026-05-14T10:00:00.000Z',
            image: null,
          },
        ],
      }),
    );

    render(<ChatSessionScreen />);

    expect(mockArtworkHeroCard).toHaveBeenCalled();
    const lastCallProps = mockArtworkHeroCard.mock.calls.at(-1)?.[0] as {
      model?: { imageUrl?: string } | null;
    };
    expect(lastCallProps?.model ?? null).toBeNull();
  });

  it('mounts <ArtworkHeroModal> at the screen level so pinch-zoom is hosted outside the message list', () => {
    mockUseChatSession.mockReturnValue(
      defaultSession({
        messages: [
          {
            id: 'u1',
            role: 'user',
            text: 'what is this?',
            createdAt: '2026-05-14T10:00:00.000Z',
            image: { url: 'https://signed.example.com/mona.jpg', expiresAt: 'never' },
          },
        ],
      }),
    );

    render(<ChatSessionScreen />);

    expect(mockArtworkHeroModal).toHaveBeenCalled();
    const lastCallProps = mockArtworkHeroModal.mock.calls.at(-1)?.[0] as {
      visible?: boolean;
      model?: { imageUrl?: string } | null;
      onClose?: () => void;
    };
    expect(lastCallProps?.visible).toBe(false);
    expect(typeof lastCallProps?.onClose).toBe('function');
    expect(lastCallProps?.model?.imageUrl).toBe('https://signed.example.com/mona.jpg');
  });
});
