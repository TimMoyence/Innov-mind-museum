/**
 * Red tests for A5 — screen integration of <StatusIndicator>.
 *
 * Asserts that `ChatSessionScreen`:
 *   1. Forwards a `currentPhase` prop to `<ChatMessageList>` (R10 + AC14).
 *   2. Sets `currentPhase` to `'analyzing-image'` when the user attached an
 *      image AND the session is sending (R13).
 *   3. Sets `currentPhase` to `'searching-collection'` when text-only AND
 *      sending (R14).
 *   4. Sets `currentPhase` to `null` when not sending (R17).
 *
 * At baseline (A5 not yet implemented) :
 *   - The screen does NOT consume `useStatusPhase` (no such hook exists).
 *   - `<ChatMessageList>` does NOT yet receive a `currentPhase` prop.
 *   - Therefore the captured `props.currentPhase` reads back as `undefined`,
 *     making every `expect(...).toBe(...)` assertion fail.
 *
 * Why a dedicated file (not merged into `chat-session-deep.test.tsx`) :
 *   - The deep file is already 1k+ lines, with global mocks tuned to its
 *     own assertions. Adding A5 tests there mixes concerns and risks
 *     accidental coupling.
 *   - This file mocks the minimum surface to render the screen and probe
 *     `ChatMessageList` props — independent green/red lifecycle.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';

// ── Stub heavy children before importing the screen ────────────────────────
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
jest.mock('@/features/chat/ui/MediaAttachmentPanel', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    MediaAttachmentPanel: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-MediaAttachmentPanel' }),
    ),
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

// ── expo-router params ──────────────────────────────────────────────────────
const mockExpoRouterMock = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouterMock.useLocalSearchParams = () => ({ sessionId: 'session-A5' });

// ── @react-navigation/native ────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    canGoBack: () => true,
    addListener: (_event: string, _cb: () => void) => jest.fn(),
  }),
}));

// ── chatApi (avoid network) ─────────────────────────────────────────────────
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: jest.fn(),
    deleteSessionIfEmpty: jest.fn(),
    reportMessage: jest.fn(),
  },
}));

// ── useChatSession (drives isSending) ──────────────────────────────────────
const mockUseChatSession = jest.fn();
jest.mock('@/features/chat/application/useChatSession', () => ({
  useChatSession: (...args: unknown[]) => mockUseChatSession(...args),
}));

// ── Side hooks (no-op) ──────────────────────────────────────────────────────
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

// ── Import AFTER mocks ──────────────────────────────────────────────────────
import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';
// RED ASSERTION : phases module does not exist yet at baseline.
import type { ChatPipelinePhase } from '@/features/chat/application/phases';

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

function lastChatMessageListProps(): { currentPhase?: ChatPipelinePhase | null } {
  const mod = jest.requireMock<Record<string, jest.Mock>>('@/features/chat/ui/ChatMessageList');
  const fn = mod.ChatMessageList;
  if (!fn) throw new Error('ChatMessageList mock not registered');
  const calls = fn.mock.calls;
  if (calls.length === 0) throw new Error('ChatMessageList was never rendered');
  return calls[calls.length - 1][0] as { currentPhase?: ChatPipelinePhase | null };
}

describe('ChatSessionScreen — A5 status phase wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockImagePickerState.selectedImage = null;
    mockUseChatSession.mockReturnValue(defaultSession());
  });

  it('passes currentPhase = null when not sending (R17)', () => {
    mockUseChatSession.mockReturnValue(defaultSession({ isSending: false }));
    render(<ChatSessionScreen />);
    const props = lastChatMessageListProps();
    expect(props.currentPhase).toBeNull();
  });

  it("passes currentPhase = 'searching-collection' when sending text-only (R14)", () => {
    mockImagePickerState.selectedImage = null;
    mockUseChatSession.mockReturnValue(defaultSession({ isSending: true }));
    render(<ChatSessionScreen />);
    const props = lastChatMessageListProps();
    expect(props.currentPhase).toBe('searching-collection');
  });

  it("passes currentPhase = 'analyzing-image' when sending with an attached image (R13)", () => {
    mockImagePickerState.selectedImage = 'file:///fixture.jpg';
    mockUseChatSession.mockReturnValue(defaultSession({ isSending: true }));
    render(<ChatSessionScreen />);
    const props = lastChatMessageListProps();
    expect(props.currentPhase).toBe('analyzing-image');
  });

  it('declares currentPhase in the prop bag forwarded to ChatMessageList (AC14)', () => {
    mockUseChatSession.mockReturnValue(defaultSession({ isSending: true }));
    render(<ChatSessionScreen />);
    const props = lastChatMessageListProps();
    // The presence of the key (even if value is null/undefined) is the wiring
    // signal — baseline `ChatMessageList` does not receive this prop at all.
    expect(Object.prototype.hasOwnProperty.call(props, 'currentPhase')).toBe(true);
  });
});
