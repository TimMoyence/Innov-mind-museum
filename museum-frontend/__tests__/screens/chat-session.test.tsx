import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

// Override useLocalSearchParams for this screen
const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouter.useLocalSearchParams = () => ({ sessionId: 'test-session-123' });

// ── Screen-specific mocks ────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    canGoBack: () => true,
    addListener: jest.fn(() => jest.fn()),
  }),
}));

const mockUseChatSession = jest.fn();
jest.mock('@/features/chat/application/useChatSession', () => ({
  useChatSession: (...args: any[]) => mockUseChatSession(...args),
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

jest.mock('@/features/chat/application/useImagePicker', () => ({
  useImagePicker: () => ({
    selectedImage: null,
    pendingImage: null,
    onPickImage: jest.fn(),
    onTakePicture: jest.fn(),
    confirmPendingImage: jest.fn(),
    cancelPendingImage: jest.fn(),
    clearSelectedImage: jest.fn(),
  }),
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
  useMessageActions: () => ({
    copyText: jest.fn(),
    shareText: jest.fn(),
  }),
}));

jest.mock('@/features/chat/application/chatSessionLogic.pure', () => ({
  buildVisitSummary: () => ({
    title: 'Visit Summary',
    artworks: [],
    totalMessages: 0,
  }),
}));

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: jest.fn(),
    deleteSessionIfEmpty: jest.fn(),
    reportMessage: jest.fn(),
  },
}));

jest.mock('@/shared/ui/SkeletonChatBubble', () => {
  const { View } = require('react-native');
  return {
    SkeletonChatBubble: (props: any) => <View testID="skeleton-chat-bubble" />,
  };
});

jest.mock('@/features/chat/ui/ChatMessageList', () => {
  const { View } = require('react-native');
  return {
    ChatMessageList: (props: any) => <View testID="chat-message-list" />,
  };
});

jest.mock('@/features/chat/ui/ChatInput', () => {
  const { View } = require('react-native');
  return {
    ChatInput: (props: any) => <View testID="chat-input" />,
  };
});

jest.mock('@/features/chat/ui/ChatHeader', () => {
  const { View } = require('react-native');
  return {
    ChatHeader: (props: any) => <View testID="chat-header" />,
  };
});

jest.mock('@/features/chat/ui/MediaAttachmentPanel', () => {
  const { View } = require('react-native');
  return {
    MediaAttachmentPanel: (props: any) => <View testID="media-attachment-panel" />,
  };
});

jest.mock('@/features/chat/ui/ImagePreviewModal', () => {
  const { View } = require('react-native');
  return {
    ImagePreviewModal: (props: any) => <View testID="image-preview-modal" />,
  };
});

jest.mock('@/features/chat/ui/MessageContextMenu', () => {
  const { View } = require('react-native');
  return {
    MessageContextMenu: (props: any) => <View testID="message-context-menu" />,
  };
});

jest.mock('@/features/chat/ui/OfflineBanner', () => {
  const { View } = require('react-native');
  return {
    OfflineBanner: (props: any) => <View testID="offline-banner" />,
  };
});

jest.mock('@/features/chat/ui/AiConsentModal', () => {
  const { View } = require('react-native');
  return {
    AiConsentModal: (props: any) => <View testID="ai-consent-modal" />,
  };
});

jest.mock('@/features/chat/ui/VisitSummaryModal', () => {
  const { View } = require('react-native');
  return {
    VisitSummaryModal: (props: any) => <View testID="visit-summary-modal" />,
  };
});

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

const defaultChatSession = {
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
};

describe('ChatSessionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChatSession.mockReturnValue(defaultChatSession);
  });

  it('renders chat UI components', () => {
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('chat-header')).toBeTruthy();
    expect(screen.getByTestId('chat-input')).toBeTruthy();
    expect(screen.getByTestId('media-attachment-panel')).toBeTruthy();
  });

  it('renders chat header', () => {
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('chat-header')).toBeTruthy();
  });

  it('renders chat input', () => {
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('chat-input')).toBeTruthy();
  });

  it('renders loading state with skeleton bubbles', () => {
    mockUseChatSession.mockReturnValue({
      ...defaultChatSession,
      isLoading: true,
    });
    render(<ChatSessionScreen />);
    expect(screen.getAllByTestId('skeleton-chat-bubble').length).toBeGreaterThan(0);
  });

  it('renders message list when not loading', () => {
    mockUseChatSession.mockReturnValue({
      ...defaultChatSession,
      isLoading: false,
      messages: [{ id: 'msg-1', role: 'user', text: 'Hello', metadata: {} }],
    });
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('chat-message-list')).toBeTruthy();
  });

  it('renders error notice when error is present', () => {
    mockUseChatSession.mockReturnValue({
      ...defaultChatSession,
      error: 'Something went wrong',
    });
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('error-notice')).toBeTruthy();
  });

  it('renders modals', () => {
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('image-preview-modal')).toBeTruthy();
    expect(screen.getByTestId('message-context-menu')).toBeTruthy();
    expect(screen.getByTestId('ai-consent-modal')).toBeTruthy();
    expect(screen.getByTestId('visit-summary-modal')).toBeTruthy();
  });

  it('calls useChatSession with sessionId', () => {
    render(<ChatSessionScreen />);
    expect(mockUseChatSession).toHaveBeenCalledWith('test-session-123');
  });
});
