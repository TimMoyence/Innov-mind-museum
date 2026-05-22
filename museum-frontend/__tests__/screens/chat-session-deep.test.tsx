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
 *   - onMessageLongPress: opens the context-menu route with the matching message
 *   - onReportMessage: Alert.alert with 5 buttons; pressing 'offensive' → reportMessage('offensive')
 *   - reportMessage failure → second Alert with error copy
 *   - ChatHeader.onSummary → opens the summary route
 *   - ChatHeader.onToggleAudioDescription → toggles session override
 *   - AiConsentModal.onPrivacy → router.push to /(stack)/privacy
 *   - DailyLimitModal visible mirrors session.dailyLimitReached
 *
 * Bottom-sheet wiring (C4) :
 *   The chat screen now drives every modal-like surface through the
 *   `useBottomSheetRouter()` hook (see `features/chat/ui/bottom-sheet-router/`).
 *   Rather than rendering the real router and walking the sheet content trees,
 *   we mock the barrel and inspect the `router.open(route, params)` calls.
 *   Each legacy assertion against `lastProps('AiConsentModal')` is preserved as
 *   an equivalent assertion on the captured `params` of the matching
 *   `router.open()` invocation.
 */

import '../helpers/test-utils';
import type * as ReactTypes from 'react';
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
  useFocusEffect: (effect: ReactTypes.EffectCallback) => {
    const React = require('react') as typeof ReactTypes;
    React.useEffect(() => effect(), [effect]);
  },
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

// EU AI Act Article 50 voice disclosure (origin/main commit 59296c75): the
// real hook gates the very first toggleRecording press on per-session
// acknowledgement. These prop-forwarding tests don't probe the disclosure
// flow, so we mark it pre-acknowledged + no-op the acknowledge call.
jest.mock('@/features/chat/hooks/useVoiceDisclosure', () => ({
  useVoiceDisclosure: () => ({
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

// ── Bottom-sheet router mock ────────────────────────────────────────────────
// The chat screen now opens every modal via `useBottomSheetRouter().open()`.
// We capture every call so each legacy assertion (visible-prop checks, modal
// callback invocations, etc.) translates 1:1 to introspection of `mockRouterOpen`
// / `mockRouterClose` and direct invocation of the captured `params` callbacks.
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

/**
 * Returns the params object of the *last* `router.open(route, params)` call
 * for the given route id, or `undefined` if the route was never opened.
 * Replaces the legacy `lastProps<...>('AiConsentModal')` helper for sheets
 * now routed through the bottom-sheet machine.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- test helper: T types the unsafe cast of params at call-site for ergonomic typed access (e.g. lastRouteParams<{ url: string }>('browser')). Disable is scoped to this single helper.
function lastRouteParams<T = Record<string, unknown>>(routeId: string): T | undefined {
  for (let i = mockRouterOpen.mock.calls.length - 1; i >= 0; i--) {
    const call = mockRouterOpen.mock.calls[i];
    if (call?.[0] === routeId) return call[1] as T;
  }
  return undefined;
}

function openedRoutes(): string[] {
  return mockRouterOpen.mock.calls.map((c) => c[0] as string);
}

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

// Helpers ────────────────────────────────────────────────────────────────────

const childMockSpec: Record<string, { module: string; export: string }> = {
  ChatMessageList: { module: '@/features/chat/ui/ChatMessageList', export: 'ChatMessageList' },
  ChatInput: { module: '@/features/chat/ui/ChatInput', export: 'ChatInput' },
  ChatHeader: { module: '@/features/chat/ui/ChatHeader', export: 'ChatHeader' },
  Composer: { module: '@/features/chat/ui/Composer', export: 'Composer' },
  OfflineBanner: { module: '@/features/chat/ui/OfflineBanner', export: 'OfflineBanner' },
  WalkSuggestionChips: {
    module: '@/features/chat/ui/WalkSuggestionChips',
    export: 'WalkSuggestionChips',
  },
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
  mockRouterOpen.mockClear();
  mockRouterClose.mockClear();
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

describe('ChatSessionScreen — onSend (via Composer wiring)', () => {
  it('passes a stable onSend callback to Composer', () => {
    render(<ChatSessionScreen />);
    const props = lastProps<{ onSend: () => void }>('Composer');
    expect(typeof props.onSend).toBe('function');
  });

  it('does nothing when text is empty and no media', async () => {
    const sendMessage = jest.fn();
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));

    render(<ChatSessionScreen />);
    const onSend = lastProps<{ onSend: () => void }>('Composer').onSend;
    onSend();
    // microtask drain
    await Promise.resolve();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('disables Composer while consent is unresolved', () => {
    mockAiConsentState.consentResolved = false;
    try {
      render(<ChatSessionScreen />);
      const props = lastProps<{ isSending: boolean; disabled: boolean }>('Composer');
      // Consent gate goes through `disabled`, not `isSending` — surfacing an
      // inert button (not a spinner) when waiting on the consent flow.
      expect(props.disabled).toBe(true);
      expect(props.isSending).toBe(false);
    } finally {
      mockAiConsentState.consentResolved = true;
    }
  });

  it('disables Composer while consent modal is showing', () => {
    mockAiConsentState.showAiConsent = true;
    try {
      render(<ChatSessionScreen />);
      const props = lastProps<{ isSending: boolean; disabled: boolean }>('Composer');
      expect(props.disabled).toBe(true);
      expect(props.isSending).toBe(false);
    } finally {
      mockAiConsentState.showAiConsent = false;
    }
  });
});

describe('ChatSessionScreen — markdown link tap', () => {
  it('https URL prompts a confirm dialog (TD-MD-01); opens browser only after confirm', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<ChatSessionScreen />);
    const onLinkPress = lastProps<{ onLinkPress: (url: string) => boolean }>(
      'ChatMessageList',
    ).onLinkPress;

    let result: boolean | undefined;
    act(() => {
      result = onLinkPress('https://example.org/article');
    });

    // Always returns false (we never let the markdown lib auto-open).
    expect(result).toBe(false);
    // No immediate navigation — the confirm dialog gates it.
    expect(openedRoutes()).not.toContain('browser');
    // A confirm Alert was raised using the link-confirm copy keys. (The test
    // i18n mock returns the key verbatim and drops interpolation, so we assert
    // the key here; hostname interpolation is covered at the unit level.)
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]?.[0]).toBe('chat.link_confirm_title');
    expect(alertSpy.mock.calls[0]?.[1]).toBe('chat.link_confirm_body');

    // Pressing the "Open" button (last button — after Cancel) navigates.
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    act(() => {
      buttons[buttons.length - 1]?.onPress?.();
    });
    const browserParams = lastRouteParams<{ url: string }>('browser');
    expect(browserParams?.url).toBe('https://example.org/article');
    alertSpy.mockRestore();
  });

  it('http URL is ignored entirely (TD-MD-02 downgrade rejection) — no dialog, no nav', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<ChatSessionScreen />);
    const onLinkPress = lastProps<{ onLinkPress: (url: string) => boolean }>(
      'ChatMessageList',
    ).onLinkPress;

    let result: boolean | undefined;
    act(() => {
      result = onLinkPress('http://example.org/article');
    });

    expect(result).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(openedRoutes()).not.toContain('browser');
    alertSpy.mockRestore();
  });

  it('mailto URL returns true (lets the markdown lib open it via Linking)', () => {
    render(<ChatSessionScreen />);
    const onLinkPress = lastProps<{ onLinkPress: (url: string) => boolean }>(
      'ChatMessageList',
    ).onLinkPress;

    expect(onLinkPress('mailto:test@example.com')).toBe(true);
  });

  it('empty URL returns false and does NOT open the browser route', () => {
    render(<ChatSessionScreen />);
    const onLinkPress = lastProps<{ onLinkPress: (url: string) => boolean }>(
      'ChatMessageList',
    ).onLinkPress;

    expect(onLinkPress('')).toBe(false);
    expect(openedRoutes()).not.toContain('browser');
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
  it('opens the context-menu route with the matching message on long press', () => {
    const targetMessage = makeAssistantMessage({ id: 'msg-99', text: 'hello' });
    mockUseChatSession.mockReturnValue(
      defaultSession({ messages: [targetMessage], isEmpty: false }),
    );

    render(<ChatSessionScreen />);

    // No menu open yet → no `context-menu` route in the opens history.
    expect(openedRoutes()).not.toContain('context-menu');

    const onReport = lastProps<{ onReport: (id: string) => void }>('ChatMessageList').onReport;
    act(() => {
      onReport('msg-99');
    });

    const params = lastRouteParams<{ message: ChatUiMessage }>('context-menu');
    expect(params?.message.id).toBe('msg-99');
    expect(params?.message.text).toBe('hello');
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

    expect(openedRoutes()).not.toContain('context-menu');
  });

  it('Alert.alert from onReport surfaces 5 buttons (4 reasons + cancel)', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    // Make a message available so the long-press picks one up; then invoke the
    // sheet content's `onReport` callback (captured by the router mock).
    const target = makeAssistantMessage({ id: 'msg-x' });
    mockUseChatSession.mockReturnValue(defaultSession({ messages: [target], isEmpty: false }));
    render(<ChatSessionScreen />);

    const onLongPress = lastProps<{ onReport: (id: string) => void }>('ChatMessageList').onReport;
    act(() => {
      onLongPress('msg-x');
    });
    const params = lastRouteParams<{ onReport: (id: string) => void }>('context-menu');
    expect(params).toBeDefined();
    act(() => {
      params?.onReport('msg-x');
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
    const target = makeAssistantMessage({ id: 'msg-x' });
    mockUseChatSession.mockReturnValue(defaultSession({ messages: [target], isEmpty: false }));
    render(<ChatSessionScreen />);

    const onLongPress = lastProps<{ onReport: (id: string) => void }>('ChatMessageList').onReport;
    act(() => {
      onLongPress('msg-x');
    });
    const params = lastRouteParams<{ onReport: (id: string) => void }>('context-menu');
    act(() => {
      params?.onReport('msg-x');
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
    const target = makeAssistantMessage({ id: 'msg-x' });
    mockUseChatSession.mockReturnValue(defaultSession({ messages: [target], isEmpty: false }));
    render(<ChatSessionScreen />);

    const onLongPress = lastProps<{ onReport: (id: string) => void }>('ChatMessageList').onReport;
    act(() => {
      onLongPress('msg-x');
    });
    const params = lastRouteParams<{ onReport: (id: string) => void }>('context-menu');
    act(() => {
      params?.onReport('msg-x');
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
  it('onSummary opens the summary route', () => {
    render(<ChatSessionScreen />);
    expect(openedRoutes()).not.toContain('summary');

    const onSummary = lastProps<{ onSummary: () => void }>('ChatHeader').onSummary;
    act(() => {
      onSummary();
    });

    expect(openedRoutes()).toContain('summary');
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

describe('ChatSessionScreen — consent route wiring', () => {
  it('opens the consent route when showAiConsent flips true', () => {
    mockAiConsentState.showAiConsent = true;
    try {
      render(<ChatSessionScreen />);
      expect(openedRoutes()).toContain('consent');
    } finally {
      mockAiConsentState.showAiConsent = false;
    }
  });

  it('consent.onPrivacy hides the consent state, navigates to /(stack)/privacy and registers a focus listener', () => {
    mockAiConsentState.showAiConsent = true;
    try {
      render(<ChatSessionScreen />);
      const params = lastRouteParams<{ onPrivacy: () => void }>('consent');
      expect(params).toBeDefined();
      act(() => {
        params?.onPrivacy();
      });

      expect(mockAiConsentState.setShowAiConsent).toHaveBeenCalledWith(false);
      expect(router.push).toHaveBeenCalledWith('/(stack)/privacy');
      expect(mockNavAddListener).toHaveBeenCalledWith('focus', expect.any(Function));
    } finally {
      mockAiConsentState.showAiConsent = false;
    }
  });

  it('consent.onAccept invokes acceptAiConsent', () => {
    mockAiConsentState.showAiConsent = true;
    try {
      render(<ChatSessionScreen />);
      const params = lastRouteParams<{ onAccept: () => void }>('consent');
      act(() => {
        params?.onAccept();
      });
      expect(mockAiConsentState.acceptAiConsent).toHaveBeenCalledTimes(1);
    } finally {
      mockAiConsentState.showAiConsent = false;
    }
  });
});

describe('ChatSessionScreen — daily limit route', () => {
  it('opens the daily-limit route when session.dailyLimitReached is true', () => {
    mockUseChatSession.mockReturnValue(defaultSession({ dailyLimitReached: true }));

    render(<ChatSessionScreen />);

    expect(openedRoutes()).toContain('daily-limit');
  });

  it('daily-limit.onDismiss invokes clearDailyLimit', () => {
    const clearDailyLimit = jest.fn();
    mockUseChatSession.mockReturnValue(
      defaultSession({ dailyLimitReached: true, clearDailyLimit }),
    );

    render(<ChatSessionScreen />);
    const params = lastRouteParams<{ onDismiss: () => void }>('daily-limit');
    act(() => {
      params?.onDismiss();
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
      const target = makeAssistantMessage({ id: 'msg-x' });
      mockUseChatSession.mockReturnValue(defaultSession({ messages: [target], isEmpty: false }));
      render(<ChatSessionScreen />);

      const onLongPress = lastProps<{ onReport: (id: string) => void }>('ChatMessageList').onReport;
      act(() => {
        onLongPress('msg-x');
      });
      const params = lastRouteParams<{ onReport: (id: string) => void }>('context-menu');
      act(() => {
        params?.onReport('msg-x');
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

    // Drive the input value through Composer's onChangeText, then press onSend.
    const onChangeText = lastProps<{ onChangeText: (s: string) => void }>('Composer').onChangeText;
    act(() => {
      onChangeText('Tell me more');
    });
    const onSend = lastProps<{ onSend: () => void }>('Composer').onSend;
    await act(async () => {
      onSend();
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith({ text: 'Tell me more' });
    // Input value cleared after send.
    expect(lastProps<{ text: string }>('Composer').text).toBe('');
  });

  it('restores the typed text when sendMessage rejects (returns falsy)', async () => {
    const sendMessage = jest.fn().mockResolvedValue(false);
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));
    render(<ChatSessionScreen />);

    act(() => {
      lastProps<{ onChangeText: (s: string) => void }>('Composer').onChangeText('failing text');
    });
    await act(async () => {
      lastProps<{ onSend: () => void }>('Composer').onSend();
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith({ text: 'failing text' });
    expect(lastProps<{ text: string }>('Composer').text).toBe('failing text');
  });
});

describe('ChatSessionScreen — Composer media wiring (A1)', () => {
  it('forwards toggleRecording, recordedAudioUri and isRecording to Composer (R23)', () => {
    render(<ChatSessionScreen />);
    const props = lastProps<{
      toggleRecording: () => Promise<void> | void;
      recordedAudioUri: string | null;
      isRecording: boolean;
      onOpenAttachments: () => void;
    }>('Composer');

    expect(typeof props.toggleRecording).toBe('function');
    expect(typeof props.onOpenAttachments).toBe('function');

    // Recording toggle is wired through the audio recorder hook (the screen
    // wraps it behind the EU AI Act gate; with disclosure pre-acknowledged
    // the raw recorder hook fires synchronously).
    void props.toggleRecording();
    expect(mockAudioRecorderState.toggleRecording).toHaveBeenCalledTimes(1);
  });

  it('opens the attachment-picker route with wired media + audio handles (R22)', () => {
    render(<ChatSessionScreen />);
    const { onOpenAttachments } = lastProps<{
      onOpenAttachments: () => void;
    }>('Composer');

    onOpenAttachments();
    const openedCall = mockRouterOpen.mock.calls.find((c) => c[0] === 'attachment-picker');
    expect(openedCall).toBeDefined();
    const params = openedCall?.[1] as {
      onPickImage: () => void;
      onTakePicture: () => void;
      toggleRecording: () => Promise<void> | void;
      playRecordedAudio: () => Promise<void> | void;
      clearMedia: () => void;
    };

    params.onPickImage();
    expect(mockImagePickerState.onPickImage).toHaveBeenCalledTimes(1);

    params.onTakePicture();
    expect(mockImagePickerState.onTakePicture).toHaveBeenCalledTimes(1);

    void params.playRecordedAudio();
    expect(mockAudioRecorderState.playRecordedAudio).toHaveBeenCalledTimes(1);

    params.clearMedia();
    expect(mockImagePickerState.clearSelectedImage).toHaveBeenCalled();
    expect(mockAudioRecorderState.clearRecordedAudio).toHaveBeenCalled();
  });
});

describe('ChatSessionScreen — Composer value change', () => {
  it('passes a fresh value down after onChangeText is invoked', () => {
    render(<ChatSessionScreen />);
    expect(lastProps<{ text: string }>('Composer').text).toBe('');

    act(() => {
      lastProps<{ onChangeText: (s: string) => void }>('Composer').onChangeText('typing...');
    });

    expect(lastProps<{ text: string }>('Composer').text).toBe('typing...');
  });

  it('onClearImage clears the selected image via the image picker hook', () => {
    render(<ChatSessionScreen />);
    const onClearImage = lastProps<{ onClearImage: () => void }>('Composer').onClearImage;
    onClearImage();
    expect(mockImagePickerState.clearSelectedImage).toHaveBeenCalledTimes(1);
  });
});

// NOTE: the chat-local <OfflineBanner> mount was removed in this cycle
// (connectivity single-source-of-truth, design §D5). The banner is now mounted
// globally in app/_layout.tsx via <GlobalOfflineBannerHost />, so the chat
// screen no longer forwards pendingCount/isOffline to a local OfflineBanner.
// The global mount is covered by __tests__/components/GlobalOfflineBanner.test.tsx
// and the .maestro/connectivity-offline-banner.yaml flow (UFR-021).
