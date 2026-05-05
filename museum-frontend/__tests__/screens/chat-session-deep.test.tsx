/**
 * Deep behavioural tests for ChatSessionScreen.
 *
 * Pin specific named contracts that previously had no coverage:
 *   - error → haptic notification
 *   - error → ErrorState dismiss wired to clearError
 *   - intent=camera → onTakePicture invoked once
 *   - intent=audio → toggleRecording invoked after 500 ms
 *   - initialPrompt + !isLoading → sendMessage called once with the prompt
 *   - initialPrompt while loading → no sendMessage until loading completes
 *   - onClose: empty session → deleteSessionIfEmpty + router.back()
 *   - onClose: non-empty + canGoBack=false → router.replace('/(tabs)/conversations')
 *   - onSend (via ChatInput): empty input is no-op; failure restores text
 *   - onMessageLinkPress: http URL opens InAppBrowser; mailto returns true; empty returns false
 *   - onMessageImageError: dedup, calls refreshMessageImageUrl once per id in flight
 *   - onMessageLongPress: opens MessageContextMenu with the matching message
 *   - onReportMessage: Alert.alert with 5 buttons; pressing 'offensive' → reportMessage('offensive')
 *   - reportMessage failure → second Alert with error copy
 *   - ChatHeader.onSummary → VisitSummaryModal becomes visible
 *   - ChatHeader.onToggleAudioDescription → toggles session override
 *   - AiConsentModal.onPrivacy → router.push to /(stack)/privacy
 *   - DailyLimitModal visible mirrors session.dailyLimitReached
 */

import '../helpers/test-utils';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { makeAssistantMessage, makeChatUiMessage } from '../helpers/factories';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';

// ── Local chatApi mock (avoids reliance on chat-screen.setup) ───────────────
const mockDeleteSessionIfEmpty = jest.fn();
const mockReportMessage = jest.fn();
const mockCreateSession = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    deleteSessionIfEmpty: (...args: unknown[]) => mockDeleteSessionIfEmpty(...args),
    reportMessage: (...args: unknown[]) => mockReportMessage(...args),
  },
}));

// ── expo-router param override (test-utils returns {} by default) ───────────
const mockExpoRouterMock = jest.requireMock<Record<string, unknown>>('expo-router');
const setParams = (extra: Record<string, string> = {}) => {
  mockExpoRouterMock.useLocalSearchParams = () => ({ sessionId: 'session-42', ...extra });
};

// ── @react-navigation/native ────────────────────────────────────────────────
const mockNavAddListener = jest.fn((..._args: unknown[]) => jest.fn());
const mockNavCanGoBack = jest.fn(() => true);
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    canGoBack: () => mockNavCanGoBack(),
    addListener: (event: string, callback: () => void) => mockNavAddListener(event, callback),
  }),
}));

// ── useChatSession ──────────────────────────────────────────────────────────
const mockUseChatSession = jest.fn();
jest.mock('@/features/chat/application/useChatSession', () => ({
  useChatSession: (...args: unknown[]) => mockUseChatSession(...args),
}));

// ── Side-hooks that the screen wires but we don't probe directly here ───────
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
  useAutoTts: () => ({ stopAutoPlay: jest.fn() }),
}));

jest.mock('@/features/settings/application/useAudioDescriptionMode', () => ({
  useAudioDescriptionMode: () => ({ enabled: false, isLoading: false, toggle: jest.fn() }),
}));

const mockAiConsentState = {
  showAiConsent: false,
  setShowAiConsent: jest.fn(),
  consentResolved: true,
  acceptAiConsent: jest.fn(),
  recheckConsent: jest.fn(),
};
jest.mock('@/features/chat/application/useAiConsent', () => ({
  useAiConsent: () => mockAiConsentState,
}));

jest.mock('@/features/chat/application/useMessageActions', () => ({
  useMessageActions: () => ({ copyText: jest.fn(), shareText: jest.fn() }),
}));

jest.mock('@/features/museum/application/useMuseumPrefetch', () => ({
  useMuseumPrefetch: jest.fn(),
}));

jest.mock('@/shared/ui/SkeletonChatBubble', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    SkeletonChatBubble: () => ReactNS.createElement(RN.View, { testID: 'skeleton-chat-bubble' }),
  };
});

// ── Children mocked as jest.fn so we can capture and invoke their props ─────
// Use a mock-prefixed factory that returns a render function which stores props
// on the jest.fn itself via .mock.calls — avoids out-of-scope variable issues.
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
  return { ChatInput: jest.fn(() => ReactNS.createElement(RN.View, { testID: 'mock-ChatInput' })) };
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
jest.mock('@/features/chat/ui/MessageContextMenu', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    MessageContextMenu: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-MessageContextMenu' }),
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
jest.mock('@/features/chat/ui/AiConsentModal', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    AiConsentModal: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-AiConsentModal' }),
    ),
  };
});
jest.mock('@/features/chat/ui/VisitSummaryModal', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    VisitSummaryModal: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-VisitSummaryModal' }),
    ),
  };
});
jest.mock('@/features/chat/ui/DailyLimitModal', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    DailyLimitModal: jest.fn(() =>
      ReactNS.createElement(RN.View, { testID: 'mock-DailyLimitModal' }),
    ),
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
jest.mock('@/shared/ui/InAppBrowser', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    InAppBrowser: jest.fn(() => ReactNS.createElement(RN.View, { testID: 'mock-InAppBrowser' })),
  };
});

// Helpers ────────────────────────────────────────────────────────────────────

const childMockSpec: Record<string, { module: string; export: string }> = {
  ChatMessageList: { module: '@/features/chat/ui/ChatMessageList', export: 'ChatMessageList' },
  ChatInput: { module: '@/features/chat/ui/ChatInput', export: 'ChatInput' },
  ChatHeader: { module: '@/features/chat/ui/ChatHeader', export: 'ChatHeader' },
  MediaAttachmentPanel: {
    module: '@/features/chat/ui/MediaAttachmentPanel',
    export: 'MediaAttachmentPanel',
  },
  MessageContextMenu: {
    module: '@/features/chat/ui/MessageContextMenu',
    export: 'MessageContextMenu',
  },
  OfflineBanner: { module: '@/features/chat/ui/OfflineBanner', export: 'OfflineBanner' },
  AiConsentModal: { module: '@/features/chat/ui/AiConsentModal', export: 'AiConsentModal' },
  VisitSummaryModal: {
    module: '@/features/chat/ui/VisitSummaryModal',
    export: 'VisitSummaryModal',
  },
  DailyLimitModal: { module: '@/features/chat/ui/DailyLimitModal', export: 'DailyLimitModal' },
  WalkSuggestionChips: {
    module: '@/features/chat/ui/WalkSuggestionChips',
    export: 'WalkSuggestionChips',
  },
  InAppBrowser: { module: '@/shared/ui/InAppBrowser', export: 'InAppBrowser' },
};

function getChildMock(name: string): jest.Mock {
  const spec = childMockSpec[name];
  if (!spec) throw new Error(`Unknown child mock ${name}`);
  const mod = jest.requireMock<Record<string, jest.Mock>>(spec.module);
  const fn = mod[spec.export];
  if (!fn) throw new Error(`Mock export missing: ${spec.module}#${spec.export}`);
  return fn;
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Justification: test-only call-site narrowing of captured prop bag — the generic exists to let each of the 63 callers use a different ad-hoc Pick<> shape without an extra `as` cast at every site. Approved-by: tim@2026-05-02
function lastProps<T = Record<string, unknown>>(name: string): T {
  const fn = getChildMock(name);
  const calls = fn.mock.calls;
  if (calls.length === 0) throw new Error(`No calls captured for ${name}`);
  return calls[calls.length - 1][0] as T;
}

function clearAllChildMocks(): void {
  for (const name of Object.keys(childMockSpec)) {
    getChildMock(name).mockClear();
  }
}

interface ChatSessionState {
  messages: ChatUiMessage[];
  isEmpty: boolean;
  isLoading: boolean;
  isSending: boolean;
  isStreaming: boolean;
  isOffline: boolean;
  pendingCount: number;
  error: string | null;
  clearError: jest.Mock;
  dailyLimitReached: boolean;
  clearDailyLimit: jest.Mock;
  sendMessage: jest.Mock;
  retryMessage: jest.Mock;
  refreshMessageImageUrl: jest.Mock;
  locale: string;
  sessionTitle: string | null;
  museumName: string | null;
  lastAssistantPending: boolean;
}

function defaultSession(overrides: Partial<ChatSessionState> = {}): ChatSessionState {
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

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

beforeEach(() => {
  jest.clearAllMocks();
  clearAllChildMocks();
  setParams();
  mockNavCanGoBack.mockReturnValue(true);
  mockAudioRecorderState.isRecording = false;
  mockAudioRecorderState.recordedAudioUri = null;
  mockAudioRecorderState.recordedAudioBlob = null;
  mockAudioRecorderState.toggleRecording.mockClear();
  mockAudioRecorderState.playRecordedAudio.mockClear();
  mockAudioRecorderState.clearRecordedAudio.mockClear();
  mockImagePickerState.selectedImage = null;
  mockImagePickerState.onPickImage.mockClear();
  mockImagePickerState.onTakePicture.mockClear();
  mockImagePickerState.clearSelectedImage.mockClear();
  mockAiConsentState.showAiConsent = false;
  mockAiConsentState.setShowAiConsent.mockClear();
  mockAiConsentState.acceptAiConsent.mockClear();
  mockAiConsentState.recheckConsent.mockClear();
  mockUseChatSession.mockReturnValue(defaultSession());
});

describe('ChatSessionScreen — error wiring', () => {
  it('fires Haptics.notificationAsync(Error) when error prop appears', () => {
    const session = defaultSession({ error: 'boom' });
    mockUseChatSession.mockReturnValue(session);

    render(<ChatSessionScreen />);

    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('does NOT fire haptic when error is null', () => {
    render(<ChatSessionScreen />);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('ErrorState dismiss button invokes clearError', () => {
    const clearError = jest.fn();
    mockUseChatSession.mockReturnValue(defaultSession({ error: 'boom', clearError }));

    const { getByTestId } = render(<ChatSessionScreen />);
    fireEvent.press(getByTestId('error-notice-dismiss'));

    expect(clearError).toHaveBeenCalledTimes(1);
  });
});

describe('ChatSessionScreen — initial intent', () => {
  it('intent=camera invokes onTakePicture once on mount', () => {
    setParams({ intent: 'camera' });
    render(<ChatSessionScreen />);

    expect(mockImagePickerState.onTakePicture).toHaveBeenCalledTimes(1);
    expect(mockAudioRecorderState.toggleRecording).not.toHaveBeenCalled();
  });

  it('intent=audio does NOT call onTakePicture (camera path is gated to intent=camera)', () => {
    setParams({ intent: 'audio' });
    render(<ChatSessionScreen />);
    expect(mockImagePickerState.onTakePicture).not.toHaveBeenCalled();
  });

  it('intent=audio schedules a 500 ms setTimeout for the delayed toggleRecording', () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    try {
      setParams({ intent: 'audio' });
      render(<ChatSessionScreen />);

      // The audio intent path schedules a 500 ms timer to defer recording start
      // until the screen has fully mounted (mitigates a documented iOS silent-fail).
      const audioTimerCall = setTimeoutSpy.mock.calls.find((c) => c[1] === 500);
      expect(audioTimerCall).toBeDefined();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('intent=walk does NOT auto-start camera or audio', () => {
    setParams({ intent: 'walk' });
    render(<ChatSessionScreen />);

    expect(mockImagePickerState.onTakePicture).not.toHaveBeenCalled();
    expect(mockAudioRecorderState.toggleRecording).not.toHaveBeenCalled();
  });
});

describe('ChatSessionScreen — initialPrompt', () => {
  it('sends the initialPrompt once when not loading', async () => {
    setParams({ initialPrompt: 'Tell me about Monet' });
    const sendMessage = jest.fn().mockResolvedValue(true);
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));

    render(<ChatSessionScreen />);

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ text: 'Tell me about Monet' });
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does NOT send the initialPrompt while isLoading=true', () => {
    setParams({ initialPrompt: 'Tell me about Monet' });
    const sendMessage = jest.fn().mockResolvedValue(true);
    mockUseChatSession.mockReturnValue(defaultSession({ isLoading: true, sendMessage }));

    render(<ChatSessionScreen />);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('ChatSessionScreen — onClose', () => {
  it('calls deleteSessionIfEmpty + router.back when session is empty and canGoBack=true', async () => {
    mockDeleteSessionIfEmpty.mockResolvedValue({});
    mockNavCanGoBack.mockReturnValue(true);
    mockUseChatSession.mockReturnValue(defaultSession({ isEmpty: true }));

    render(<ChatSessionScreen />);
    const onClose = lastProps<{ onClose: () => void | Promise<void> }>('ChatHeader').onClose;
    await act(async () => {
      await onClose();
    });

    await waitFor(() => {
      expect(mockDeleteSessionIfEmpty).toHaveBeenCalledWith('session-42');
      expect(router.back).toHaveBeenCalledTimes(1);
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does NOT call deleteSessionIfEmpty when session has messages', async () => {
    mockUseChatSession.mockReturnValue(
      defaultSession({
        isEmpty: false,
        messages: [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'hi' })],
      }),
    );

    render(<ChatSessionScreen />);
    const onClose = lastProps<{ onClose: () => void | Promise<void> }>('ChatHeader').onClose;
    await act(async () => {
      await onClose();
    });

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(mockDeleteSessionIfEmpty).not.toHaveBeenCalled();
  });

  it('falls back to router.replace when canGoBack=false', async () => {
    mockNavCanGoBack.mockReturnValue(false);
    mockUseChatSession.mockReturnValue(
      defaultSession({
        isEmpty: false,
        messages: [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'hi' })],
      }),
    );

    render(<ChatSessionScreen />);
    const onClose = lastProps<{ onClose: () => void | Promise<void> }>('ChatHeader').onClose;
    await act(async () => {
      await onClose();
    });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/conversations');
    });
    expect(router.back).not.toHaveBeenCalled();
  });

  it('swallows deleteSessionIfEmpty errors and still navigates back', async () => {
    mockDeleteSessionIfEmpty.mockRejectedValue(new Error('network down'));
    mockUseChatSession.mockReturnValue(defaultSession({ isEmpty: true }));

    render(<ChatSessionScreen />);
    const onClose = lastProps<{ onClose: () => void | Promise<void> }>('ChatHeader').onClose;
    await act(async () => {
      await onClose();
    });

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
  });
});

describe('ChatSessionScreen — onSend (via ChatInput wiring)', () => {
  it('passes a stable onSend callback to ChatInput', () => {
    render(<ChatSessionScreen />);
    const props = lastProps<{ onSend: () => void }>('ChatInput');
    expect(typeof props.onSend).toBe('function');
  });

  it('does nothing when text is empty and no media', async () => {
    const sendMessage = jest.fn();
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));

    render(<ChatSessionScreen />);
    const onSend = lastProps<{ onSend: () => void }>('ChatInput').onSend;
    onSend();
    // microtask drain
    await Promise.resolve();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('disables ChatInput while consent is unresolved', () => {
    mockAiConsentState.consentResolved = false;
    try {
      render(<ChatSessionScreen />);
      const props = lastProps<{ isSending: boolean }>('ChatInput');
      expect(props.isSending).toBe(true);
    } finally {
      mockAiConsentState.consentResolved = true;
    }
  });

  it('disables ChatInput while consent modal is showing', () => {
    mockAiConsentState.showAiConsent = true;
    try {
      render(<ChatSessionScreen />);
      const props = lastProps<{ isSending: boolean }>('ChatInput');
      expect(props.isSending).toBe(true);
    } finally {
      mockAiConsentState.showAiConsent = false;
    }
  });
});

describe('ChatSessionScreen — markdown link tap', () => {
  it('http URL routes to the in-app browser and returns false', () => {
    render(<ChatSessionScreen />);
    const onLinkPress = lastProps<{ onLinkPress: (url: string) => boolean }>(
      'ChatMessageList',
    ).onLinkPress;

    let result: boolean | undefined;
    act(() => {
      result = onLinkPress('https://example.org/article');
    });

    expect(result).toBe(false);
    const browserProps = lastProps<{ url: string | null }>('InAppBrowser');
    expect(browserProps.url).toBe('https://example.org/article');
  });

  it('mailto URL returns true (lets the markdown lib open it via Linking)', () => {
    render(<ChatSessionScreen />);
    const onLinkPress = lastProps<{ onLinkPress: (url: string) => boolean }>(
      'ChatMessageList',
    ).onLinkPress;

    expect(onLinkPress('mailto:test@example.com')).toBe(true);
  });

  it('empty URL returns false and does NOT open the browser', () => {
    render(<ChatSessionScreen />);
    const onLinkPress = lastProps<{ onLinkPress: (url: string) => boolean }>(
      'ChatMessageList',
    ).onLinkPress;

    expect(onLinkPress('')).toBe(false);
    expect(lastProps<{ url: string | null }>('InAppBrowser').url).toBeNull();
  });

  it('InAppBrowser onClose clears the browser URL', () => {
    render(<ChatSessionScreen />);
    const onLinkPress = lastProps<{ onLinkPress: (url: string) => boolean }>(
      'ChatMessageList',
    ).onLinkPress;
    act(() => {
      onLinkPress('https://example.org');
    });
    expect(lastProps<{ url: string | null }>('InAppBrowser').url).toBe('https://example.org');

    const close = lastProps<{ onClose: () => void }>('InAppBrowser').onClose;
    act(() => {
      close();
    });

    expect(lastProps<{ url: string | null }>('InAppBrowser').url).toBeNull();
  });
});

describe('ChatSessionScreen — onMessageImageError', () => {
  it('calls refreshMessageImageUrl(messageId) for each new image error', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    mockUseChatSession.mockReturnValue(defaultSession({ refreshMessageImageUrl: refresh }));

    render(<ChatSessionScreen />);
    const onImageError = lastProps<{ onImageError: (id: string) => void }>(
      'ChatMessageList',
    ).onImageError;
    onImageError('msg-1');
    await Promise.resolve();
    onImageError('msg-2');
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenNthCalledWith(1, 'msg-1');
    expect(refresh).toHaveBeenNthCalledWith(2, 'msg-2');
  });

  it('dedups concurrent retries for the same messageId', () => {
    const resolvers: (() => void)[] = [];
    const refresh = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    mockUseChatSession.mockReturnValue(defaultSession({ refreshMessageImageUrl: refresh }));

    render(<ChatSessionScreen />);
    const onImageError = lastProps<{ onImageError: (id: string) => void }>(
      'ChatMessageList',
    ).onImageError;
    onImageError('msg-1');
    onImageError('msg-1');
    onImageError('msg-1');

    expect(refresh).toHaveBeenCalledTimes(1);
    // Resolve to avoid hanging promises across tests.
    resolvers.forEach((r) => {
      r();
    });
  });
});

describe('ChatSessionScreen — long press + report', () => {
  it('opens MessageContextMenu with the matching message on long press', () => {
    const targetMessage = makeAssistantMessage({ id: 'msg-99', text: 'hello' });
    mockUseChatSession.mockReturnValue(
      defaultSession({ messages: [targetMessage], isEmpty: false }),
    );

    render(<ChatSessionScreen />);

    expect(lastProps<{ message: ChatUiMessage | null }>('MessageContextMenu').message).toBeNull();

    const onReport = lastProps<{ onReport: (id: string) => void }>('ChatMessageList').onReport;
    act(() => {
      onReport('msg-99');
    });

    const props = lastProps<{ message: ChatUiMessage | null }>('MessageContextMenu');
    expect(props.message?.id).toBe('msg-99');
    expect(props.message?.text).toBe('hello');
  });

  it('does nothing when long-pressed id does not match any message', () => {
    mockUseChatSession.mockReturnValue(
      defaultSession({
        messages: [makeAssistantMessage({ id: 'msg-1' })],
        isEmpty: false,
      }),
    );
    render(<ChatSessionScreen />);

    const onReport = lastProps<{ onReport: (id: string) => void }>('ChatMessageList').onReport;
    act(() => {
      onReport('does-not-exist');
    });

    expect(lastProps<{ message: ChatUiMessage | null }>('MessageContextMenu').message).toBeNull();
  });

  it('Alert.alert from onReport surfaces 5 buttons (4 reasons + cancel)', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<ChatSessionScreen />);

    const ctxOnReport = lastProps<{ onReport: (id: string) => void }>(
      'MessageContextMenu',
    ).onReport;
    act(() => {
      ctxOnReport('msg-x');
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    expect(buttons).toHaveLength(5);
    expect(buttons[4]?.style).toBe('cancel');
    alertSpy.mockRestore();
  });

  it("pressing 'offensive' on the report Alert calls reportMessage with that reason", async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockReportMessage.mockResolvedValue({});
    render(<ChatSessionScreen />);

    const ctxOnReport = lastProps<{ onReport: (id: string) => void }>(
      'MessageContextMenu',
    ).onReport;
    act(() => {
      ctxOnReport('msg-x');
    });
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    act(() => {
      buttons[0]?.onPress?.();
    });

    await waitFor(() => {
      expect(mockReportMessage).toHaveBeenCalledWith({
        messageId: 'msg-x',
        reason: 'offensive',
      });
    });
    alertSpy.mockRestore();
  });

  it('failed report shows an error Alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockReportMessage.mockRejectedValue(new Error('500'));
    render(<ChatSessionScreen />);

    const ctxOnReport = lastProps<{ onReport: (id: string) => void }>(
      'MessageContextMenu',
    ).onReport;
    act(() => {
      ctxOnReport('msg-x');
    });
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    act(() => {
      buttons[0]?.onPress?.();
    });

    await waitFor(() => {
      // First call = the 5-option menu; second = the error confirmation.
      expect(alertSpy).toHaveBeenCalledTimes(2);
    });
    expect(alertSpy.mock.calls[1]?.[0]).toBe('common.error');
    alertSpy.mockRestore();
  });
});

describe('ChatSessionScreen — header callbacks', () => {
  it('onSummary sets VisitSummaryModal.visible=true', () => {
    render(<ChatSessionScreen />);
    expect(lastProps<{ visible: boolean }>('VisitSummaryModal').visible).toBe(false);

    const onSummary = lastProps<{ onSummary: () => void }>('ChatHeader').onSummary;
    act(() => {
      onSummary();
    });

    expect(lastProps<{ visible: boolean }>('VisitSummaryModal').visible).toBe(true);
  });

  it('VisitSummaryModal.onClose flips visible back to false', () => {
    render(<ChatSessionScreen />);
    const onSummary = lastProps<{ onSummary: () => void }>('ChatHeader').onSummary;
    act(() => {
      onSummary();
    });
    expect(lastProps<{ visible: boolean }>('VisitSummaryModal').visible).toBe(true);

    const onClose = lastProps<{ onClose: () => void }>('VisitSummaryModal').onClose;
    act(() => {
      onClose();
    });

    expect(lastProps<{ visible: boolean }>('VisitSummaryModal').visible).toBe(false);
  });

  it('onToggleAudioDescription flips audioDescriptionEnabled prop on next render', () => {
    render(<ChatSessionScreen />);
    expect(
      lastProps<{ audioDescriptionEnabled: boolean }>('ChatHeader').audioDescriptionEnabled,
    ).toBe(false);

    const toggle = lastProps<{ onToggleAudioDescription: () => void }>(
      'ChatHeader',
    ).onToggleAudioDescription;
    act(() => {
      toggle();
    });

    expect(
      lastProps<{ audioDescriptionEnabled: boolean }>('ChatHeader').audioDescriptionEnabled,
    ).toBe(true);
  });

  it('passes the lastAssistantMessage.metadata.expertiseSignal to ChatHeader', () => {
    const assistant = makeAssistantMessage(
      { id: 'a-1', text: 'foo' },
      { expertiseSignal: 'expert' },
    );
    mockUseChatSession.mockReturnValue(defaultSession({ messages: [assistant], isEmpty: false }));

    render(<ChatSessionScreen />);

    expect(lastProps<{ expertiseLevel: string | undefined }>('ChatHeader').expertiseLevel).toBe(
      'expert',
    );
  });
});

describe('ChatSessionScreen — AiConsentModal wiring', () => {
  it('onPrivacy hides the consent modal, navigates to /(stack)/privacy and registers a focus listener', () => {
    mockAiConsentState.showAiConsent = true;
    try {
      render(<ChatSessionScreen />);

      const onPrivacy = lastProps<{ onPrivacy: () => void }>('AiConsentModal').onPrivacy;
      act(() => {
        onPrivacy();
      });

      expect(mockAiConsentState.setShowAiConsent).toHaveBeenCalledWith(false);
      expect(router.push).toHaveBeenCalledWith('/(stack)/privacy');
      expect(mockNavAddListener).toHaveBeenCalledWith('focus', expect.any(Function));
    } finally {
      mockAiConsentState.showAiConsent = false;
    }
  });

  it('onAccept invokes acceptAiConsent', () => {
    mockAiConsentState.showAiConsent = true;
    try {
      render(<ChatSessionScreen />);
      const onAccept = lastProps<{ onAccept: () => void }>('AiConsentModal').onAccept;
      act(() => {
        onAccept();
      });
      expect(mockAiConsentState.acceptAiConsent).toHaveBeenCalledTimes(1);
    } finally {
      mockAiConsentState.showAiConsent = false;
    }
  });
});

describe('ChatSessionScreen — daily limit modal', () => {
  it('mirrors session.dailyLimitReached → DailyLimitModal.visible', () => {
    mockUseChatSession.mockReturnValue(defaultSession({ dailyLimitReached: true }));

    render(<ChatSessionScreen />);

    expect(lastProps<{ visible: boolean }>('DailyLimitModal').visible).toBe(true);
  });

  it('DailyLimitModal.onDismiss invokes clearDailyLimit', () => {
    const clearDailyLimit = jest.fn();
    mockUseChatSession.mockReturnValue(
      defaultSession({ dailyLimitReached: true, clearDailyLimit }),
    );

    render(<ChatSessionScreen />);
    const onDismiss = lastProps<{ onDismiss: () => void }>('DailyLimitModal').onDismiss;
    act(() => {
      onDismiss();
    });

    expect(clearDailyLimit).toHaveBeenCalledTimes(1);
  });
});

describe('ChatSessionScreen — ChatMessageList passthrough', () => {
  it('forwards locale, isSending, isStreaming and messages to ChatMessageList', () => {
    const messages = [makeChatUiMessage({ id: 'u-1' }), makeAssistantMessage({ id: 'a-1' })];
    mockUseChatSession.mockReturnValue(
      defaultSession({
        messages,
        isEmpty: false,
        isSending: true,
        isStreaming: true,
        locale: 'fr-FR',
      }),
    );

    render(<ChatSessionScreen />);

    const props = lastProps<{
      messages: ChatUiMessage[];
      isSending: boolean;
      isStreaming: boolean;
      locale: string;
    }>('ChatMessageList');
    expect(props.messages).toHaveLength(2);
    expect(props.isSending).toBe(true);
    expect(props.isStreaming).toBe(true);
    expect(props.locale).toBe('fr-FR');
  });

  it('forwards retryMessage as onRetry', () => {
    const retryMessage = jest.fn();
    mockUseChatSession.mockReturnValue(defaultSession({ retryMessage }));

    render(<ChatSessionScreen />);
    const props = lastProps<{ onRetry: (id: string) => void }>('ChatMessageList');
    props.onRetry('msg-1');
    expect(retryMessage).toHaveBeenCalledWith('msg-1');
  });

  it('onFollowUpPress + onRecommendationPress: chip text taps fire sendMessage / setText respectively', () => {
    const sendMessage = jest.fn().mockResolvedValue(true);
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));

    render(<ChatSessionScreen />);

    const onFollowUpPress = lastProps<{ onFollowUpPress: (text: string) => void }>(
      'ChatMessageList',
    ).onFollowUpPress;
    act(() => {
      onFollowUpPress('What about Renoir?');
    });
    expect(sendMessage).toHaveBeenCalledWith({ text: 'What about Renoir?' });

    const onRecommendationPress = lastProps<{
      onRecommendationPress: (text: string) => void;
    }>('ChatMessageList').onRecommendationPress;
    act(() => {
      onRecommendationPress('Try Sisley next');
    });
    // Recommendation only sets text — no extra sendMessage call.
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('ChatSessionScreen — recording status banner', () => {
  it('renders the recording_hint while audioRecorder.isRecording=true', () => {
    mockAudioRecorderState.isRecording = true;
    try {
      const { getByText } = render(<ChatSessionScreen />);
      expect(getByText('chat.recording_hint')).toBeTruthy();
    } finally {
      mockAudioRecorderState.isRecording = false;
    }
  });

  it('hides the recording_hint when not recording', () => {
    const { queryByText } = render(<ChatSessionScreen />);
    expect(queryByText('chat.recording_hint')).toBeNull();
  });
});

describe('ChatSessionScreen — report Alert button branches', () => {
  const reasons: ('offensive' | 'inaccurate' | 'inappropriate' | 'other')[] = [
    'offensive',
    'inaccurate',
    'inappropriate',
    'other',
  ];

  it.each(reasons)(
    'button for "%s" reason calls reportMessage with the matching reason',
    async (reason) => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockReportMessage.mockResolvedValue({});
      render(<ChatSessionScreen />);

      const ctxOnReport = lastProps<{ onReport: (id: string) => void }>(
        'MessageContextMenu',
      ).onReport;
      act(() => {
        ctxOnReport('msg-x');
      });

      const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
      const idx = reasons.indexOf(reason);
      act(() => {
        buttons[idx]?.onPress?.();
      });

      await waitFor(() => {
        expect(mockReportMessage).toHaveBeenCalledWith({ messageId: 'msg-x', reason });
      });
      alertSpy.mockRestore();
    },
  );
});

describe('ChatSessionScreen — onSend full path', () => {
  it('with non-empty text: calls sendMessage with the text and clears the input', async () => {
    const sendMessage = jest.fn().mockResolvedValue(true);
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));
    render(<ChatSessionScreen />);

    // Drive the input value through ChatInput's onChangeText, then press onSend.
    const onChangeText = lastProps<{ onChangeText: (s: string) => void }>('ChatInput').onChangeText;
    act(() => {
      onChangeText('Tell me more');
    });
    const onSend = lastProps<{ onSend: () => void }>('ChatInput').onSend;
    await act(async () => {
      onSend();
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith({ text: 'Tell me more' });
    // Input value cleared after send.
    expect(lastProps<{ value: string }>('ChatInput').value).toBe('');
  });

  it('restores the typed text when sendMessage rejects (returns falsy)', async () => {
    const sendMessage = jest.fn().mockResolvedValue(false);
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));
    render(<ChatSessionScreen />);

    act(() => {
      lastProps<{ onChangeText: (s: string) => void }>('ChatInput').onChangeText('failing text');
    });
    await act(async () => {
      lastProps<{ onSend: () => void }>('ChatInput').onSend();
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith({ text: 'failing text' });
    expect(lastProps<{ value: string }>('ChatInput').value).toBe('failing text');
  });
});

describe('ChatSessionScreen — MediaAttachmentPanel + MessageContextMenu wiring', () => {
  it('forwards toggleRecording, playRecordedAudio, onPickImage, onTakePicture and clearMedia', () => {
    render(<ChatSessionScreen />);
    const props = lastProps<{
      toggleRecording: () => void;
      playRecordedAudio: () => void;
      onPickImage: () => void;
      onTakePicture: () => void;
      clearMedia: () => void;
    }>('MediaAttachmentPanel');

    props.toggleRecording();
    expect(mockAudioRecorderState.toggleRecording).toHaveBeenCalledTimes(1);

    props.playRecordedAudio();
    expect(mockAudioRecorderState.playRecordedAudio).toHaveBeenCalledTimes(1);

    props.onPickImage();
    expect(mockImagePickerState.onPickImage).toHaveBeenCalledTimes(1);

    props.onTakePicture();
    expect(mockImagePickerState.onTakePicture).toHaveBeenCalledTimes(1);

    props.clearMedia();
    expect(mockImagePickerState.clearSelectedImage).toHaveBeenCalled();
    expect(mockAudioRecorderState.clearRecordedAudio).toHaveBeenCalled();
  });

  it('MessageContextMenu.onClose closes the menu', () => {
    const targetMessage = makeAssistantMessage({ id: 'msg-99' });
    mockUseChatSession.mockReturnValue(
      defaultSession({ messages: [targetMessage], isEmpty: false }),
    );
    render(<ChatSessionScreen />);

    const onReport = lastProps<{ onReport: (id: string) => void }>('ChatMessageList').onReport;
    act(() => {
      onReport('msg-99');
    });
    expect(
      lastProps<{ message: ChatUiMessage | null }>('MessageContextMenu').message,
    ).not.toBeNull();

    const close = lastProps<{ onClose: () => void }>('MessageContextMenu').onClose;
    act(() => {
      close();
    });
    expect(lastProps<{ message: ChatUiMessage | null }>('MessageContextMenu').message).toBeNull();
  });
});

describe('ChatSessionScreen — ChatInput value change', () => {
  it('passes a fresh value down after onChangeText is invoked', () => {
    render(<ChatSessionScreen />);
    expect(lastProps<{ value: string }>('ChatInput').value).toBe('');

    act(() => {
      lastProps<{ onChangeText: (s: string) => void }>('ChatInput').onChangeText('typing...');
    });

    expect(lastProps<{ value: string }>('ChatInput').value).toBe('typing...');
  });

  it('onClearImage clears the selected image via the image picker hook', () => {
    render(<ChatSessionScreen />);
    const onClearImage = lastProps<{ onClearImage: () => void }>('ChatInput').onClearImage;
    onClearImage();
    expect(mockImagePickerState.clearSelectedImage).toHaveBeenCalledTimes(1);
  });
});

describe('ChatSessionScreen — OfflineBanner + isOffline mapping', () => {
  it('forwards pendingCount and isOffline to OfflineBanner', () => {
    mockUseChatSession.mockReturnValue(defaultSession({ isOffline: true, pendingCount: 3 }));
    render(<ChatSessionScreen />);

    const props = lastProps<{ pendingCount: number; isOffline: boolean }>('OfflineBanner');
    expect(props.pendingCount).toBe(3);
    expect(props.isOffline).toBe(true);
  });
});
