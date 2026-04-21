/**
 * Screen-specific mocks for ChatSessionScreen.
 * Import AFTER test-utils (which provides global mocks for theme, router, etc.).
 */

// Locally declared so babel-jest allows them in the jest.mock factory below.
const mockChatApiCreate = jest.fn();
const mockChatApiDeleteSessionIfEmpty = jest.fn();
const mockChatApiReportMessage = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: mockChatApiCreate,
    deleteSessionIfEmpty: mockChatApiDeleteSessionIfEmpty,
    reportMessage: mockChatApiReportMessage,
  },
}));

/** Exported handles for test files that import this setup. */
export const chatScreenApiMocks = {
  createSession: mockChatApiCreate,
  deleteSessionIfEmpty: mockChatApiDeleteSessionIfEmpty,
  reportMessage: mockChatApiReportMessage,
};

// Override useLocalSearchParams from the test-utils expo-router mock
const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouter.useLocalSearchParams = () => ({ sessionId: 'test-session-123' });

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    canGoBack: () => true,
    addListener: jest.fn(() => jest.fn()),
  }),
}));

export const mockUseChatSession = jest.fn();
jest.mock('@/features/chat/application/useChatSession', () => ({
  useChatSession: (...args: unknown[]) => mockUseChatSession(...args),
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
    onPickImage: jest.fn(),
    onTakePicture: jest.fn(),
    clearSelectedImage: jest.fn(),
  }),
}));

jest.mock('@/features/chat/application/useAutoTts', () => ({
  useAutoTts: () => ({ stopAutoPlay: jest.fn() }),
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

jest.mock('@/features/chat/application/chatSessionLogic.pure', () => ({
  buildVisitSummary: () => ({ title: 'Visit Summary', artworks: [], totalMessages: 0 }),
}));

jest.mock('@/shared/ui/SkeletonChatBubble', () => {
  const { View } = require('react-native');
  return { SkeletonChatBubble: () => <View testID="skeleton-chat-bubble" /> };
});

jest.mock('@/features/chat/ui/ChatMessageList', () => {
  const { View } = require('react-native');
  return { ChatMessageList: () => <View testID="chat-message-list" /> };
});

jest.mock('@/features/chat/ui/ChatInput', () => {
  const { View } = require('react-native');
  return { ChatInput: () => <View testID="chat-input" /> };
});

jest.mock('@/features/chat/ui/ChatHeader', () => {
  const { View } = require('react-native');
  return { ChatHeader: () => <View testID="chat-header" /> };
});

jest.mock('@/features/chat/ui/MediaAttachmentPanel', () => {
  const { View } = require('react-native');
  return { MediaAttachmentPanel: () => <View testID="media-attachment-panel" /> };
});

jest.mock('@/features/chat/ui/MessageContextMenu', () => {
  const { View } = require('react-native');
  return { MessageContextMenu: () => <View testID="message-context-menu" /> };
});

jest.mock('@/features/chat/ui/OfflineBanner', () => {
  const { View } = require('react-native');
  return { OfflineBanner: () => <View testID="offline-banner" /> };
});

jest.mock('@/features/chat/ui/AiConsentModal', () => {
  const { View } = require('react-native');
  return { AiConsentModal: () => <View testID="ai-consent-modal" /> };
});

jest.mock('@/features/chat/ui/VisitSummaryModal', () => {
  const { View } = require('react-native');
  return { VisitSummaryModal: () => <View testID="visit-summary-modal" /> };
});

jest.mock('@/shared/ui/InAppBrowser', () => {
  const { View } = require('react-native');
  return { InAppBrowser: () => <View testID="in-app-browser" /> };
});

export function defaultChatSession() {
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
  };
}
