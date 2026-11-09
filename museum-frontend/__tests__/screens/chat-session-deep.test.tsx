import '../helpers/test-utils';
import type * as ReactTypes from 'react';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { render, fireEvent, waitFor, act } from '../helpers/render-chat-screen';

import { makeAssistantMessage, makeChatUiMessage } from '../helpers/factories';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';

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

const mockExpoRouterMock = jest.requireMock<Record<string, unknown>>('expo-router');
const setParams = (extra: Record<string, string> = {}) => {
  mockExpoRouterMock.useLocalSearchParams = () => ({ sessionId: 'session-42', ...extra });
};

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

function lastRouteParams(routeId: string): Record<string, unknown> | undefined {
  for (let i = mockRouterOpen.mock.calls.length - 1; i >= 0; i--) {
    const call = mockRouterOpen.mock.calls[i];
    if (call?.[0] === routeId) return call[1] as Record<string, unknown>;
  }
  return undefined;
}

function openedRoutes(): string[] {
  return mockRouterOpen.mock.calls.map((c) => c[0] as string);
}

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

function lastProps(name: string): Record<string, unknown> {
  const fn = getChildMock(name);
  const calls = fn.mock.calls;
  if (calls.length === 0) throw new Error(`No calls captured for ${name}`);
  return calls[calls.length - 1][0] as Record<string, unknown>;
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
    const onClose = (lastProps('ChatHeader') as { onClose: () => void | Promise<void> }).onClose;
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
    const onClose = (lastProps('ChatHeader') as { onClose: () => void | Promise<void> }).onClose;
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
    const onClose = (lastProps('ChatHeader') as { onClose: () => void | Promise<void> }).onClose;
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
    const onClose = (lastProps('ChatHeader') as { onClose: () => void | Promise<void> }).onClose;
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
    const props = lastProps('Composer') as { onSend: () => void };
    expect(typeof props.onSend).toBe('function');
  });

  it('does nothing when text is empty and no media', async () => {
    const sendMessage = jest.fn();
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));

    render(<ChatSessionScreen />);
    const onSend = (lastProps('Composer') as { onSend: () => void }).onSend;
    onSend();
    await Promise.resolve();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('disables Composer while consent is unresolved', () => {
    mockAiConsentState.consentResolved = false;
    try {
      render(<ChatSessionScreen />);
      const props = lastProps('Composer') as { isSending: boolean; disabled: boolean };
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
      const props = lastProps('Composer') as { isSending: boolean; disabled: boolean };
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
    const onLinkPress = (lastProps('ChatMessageList') as { onLinkPress: (url: string) => boolean })
      .onLinkPress;

    let result: boolean | undefined;
    act(() => {
      result = onLinkPress('https://example.org/article');
    });

    expect(result).toBe(false);
    expect(openedRoutes()).not.toContain('browser');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]?.[0]).toBe('chat.link_confirm_title');
    expect(alertSpy.mock.calls[0]?.[1]).toBe('chat.link_confirm_body');

    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    act(() => {
      buttons[buttons.length - 1]?.onPress?.();
    });
    const browserParams = lastRouteParams('browser') as { url: string } | undefined;
    expect(browserParams?.url).toBe('https://example.org/article');
    alertSpy.mockRestore();
  });

  it('http URL is ignored entirely (TD-MD-02 downgrade rejection) — no dialog, no nav', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<ChatSessionScreen />);
    const onLinkPress = (lastProps('ChatMessageList') as { onLinkPress: (url: string) => boolean })
      .onLinkPress;

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
    const onLinkPress = (lastProps('ChatMessageList') as { onLinkPress: (url: string) => boolean })
      .onLinkPress;

    expect(onLinkPress('mailto:test@example.com')).toBe(true);
  });

  it('empty URL returns false and does NOT open the browser route', () => {
    render(<ChatSessionScreen />);
    const onLinkPress = (lastProps('ChatMessageList') as { onLinkPress: (url: string) => boolean })
      .onLinkPress;

    expect(onLinkPress('')).toBe(false);
    expect(openedRoutes()).not.toContain('browser');
  });
});

describe('ChatSessionScreen — onMessageImageError', () => {
  it('calls refreshMessageImageUrl(messageId) for each new image error', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    mockUseChatSession.mockReturnValue(defaultSession({ refreshMessageImageUrl: refresh }));

    render(<ChatSessionScreen />);
    const onImageError = (lastProps('ChatMessageList') as { onImageError: (id: string) => void })
      .onImageError;
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
    const onImageError = (lastProps('ChatMessageList') as { onImageError: (id: string) => void })
      .onImageError;
    onImageError('msg-1');
    onImageError('msg-1');
    onImageError('msg-1');

    expect(refresh).toHaveBeenCalledTimes(1);
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

    expect(openedRoutes()).not.toContain('context-menu');

    const onReport = (lastProps('ChatMessageList') as { onReport: (id: string) => void }).onReport;
    act(() => {
      onReport('msg-99');
    });

    const params = lastRouteParams('context-menu') as { message: ChatUiMessage } | undefined;
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

    const onReport = (lastProps('ChatMessageList') as { onReport: (id: string) => void }).onReport;
    act(() => {
      onReport('does-not-exist');
    });

    expect(openedRoutes()).not.toContain('context-menu');
  });

  it('Alert.alert from onReport surfaces 5 buttons (4 reasons + cancel)', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const target = makeAssistantMessage({ id: 'msg-x' });
    mockUseChatSession.mockReturnValue(defaultSession({ messages: [target], isEmpty: false }));
    render(<ChatSessionScreen />);

    const onLongPress = (lastProps('ChatMessageList') as { onReport: (id: string) => void })
      .onReport;
    act(() => {
      onLongPress('msg-x');
    });
    const params = lastRouteParams('context-menu') as
      | { onReport: (id: string) => void }
      | undefined;
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

    const onLongPress = (lastProps('ChatMessageList') as { onReport: (id: string) => void })
      .onReport;
    act(() => {
      onLongPress('msg-x');
    });
    const params = lastRouteParams('context-menu') as
      | { onReport: (id: string) => void }
      | undefined;
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

    const onLongPress = (lastProps('ChatMessageList') as { onReport: (id: string) => void })
      .onReport;
    act(() => {
      onLongPress('msg-x');
    });
    const params = lastRouteParams('context-menu') as
      | { onReport: (id: string) => void }
      | undefined;
    act(() => {
      params?.onReport('msg-x');
    });
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    act(() => {
      buttons[0]?.onPress?.();
    });

    await waitFor(() => {
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

    const onSummary = (lastProps('ChatHeader') as { onSummary: () => void }).onSummary;
    act(() => {
      onSummary();
    });

    expect(openedRoutes()).toContain('summary');
  });

  it('onToggleAudioDescription flips audioDescriptionEnabled prop on next render', () => {
    render(<ChatSessionScreen />);
    expect(
      (lastProps('ChatHeader') as { audioDescriptionEnabled: boolean }).audioDescriptionEnabled,
    ).toBe(false);

    const toggle = (lastProps('ChatHeader') as { onToggleAudioDescription: () => void })
      .onToggleAudioDescription;
    act(() => {
      toggle();
    });

    expect(
      (lastProps('ChatHeader') as { audioDescriptionEnabled: boolean }).audioDescriptionEnabled,
    ).toBe(true);
  });

  it('M6 · does not hand a level to ChatHeader even when the last answer signals one', () => {
    const assistant = makeAssistantMessage(
      { id: 'a-1', text: 'foo' },
      { expertiseSignal: 'expert' },
    );
    mockUseChatSession.mockReturnValue(defaultSession({ messages: [assistant], isEmpty: false }));

    render(<ChatSessionScreen />);

    expect(lastProps('ChatHeader') as { sessionTitle: string | null }).not.toHaveProperty(
      'expertiseLevel',
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
      const params = lastRouteParams('consent') as { onPrivacy: () => void } | undefined;
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
      const params = lastRouteParams('consent') as { onAccept: () => void } | undefined;
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
    const params = lastRouteParams('daily-limit') as { onDismiss: () => void } | undefined;
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

    const props = lastProps('ChatMessageList') as {
      messages: ChatUiMessage[];
      isSending: boolean;
      isStreaming: boolean;
      locale: string;
    };
    expect(props.messages).toHaveLength(2);
    expect(props.isSending).toBe(true);
    expect(props.isStreaming).toBe(true);
    expect(props.locale).toBe('fr-FR');
  });

  it('forwards retryMessage as onRetry', () => {
    const retryMessage = jest.fn();
    mockUseChatSession.mockReturnValue(defaultSession({ retryMessage }));

    render(<ChatSessionScreen />);
    const props = lastProps('ChatMessageList') as { onRetry: (id: string) => void };
    props.onRetry('msg-1');
    expect(retryMessage).toHaveBeenCalledWith('msg-1');
  });

  it('onRecommendationPress: a recommendation tap only fills the input, never sends', () => {
    const sendMessage = jest.fn().mockResolvedValue(true);
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));

    render(<ChatSessionScreen />);

    const onRecommendationPress = (
      lastProps('ChatMessageList') as {
        onRecommendationPress: (text: string) => void;
      }
    ).onRecommendationPress;
    act(() => {
      onRecommendationPress('Try Sisley next');
    });
    expect(sendMessage).not.toHaveBeenCalled();
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

      const onLongPress = (lastProps('ChatMessageList') as { onReport: (id: string) => void })
        .onReport;
      act(() => {
        onLongPress('msg-x');
      });
      const params = lastRouteParams('context-menu') as
        | { onReport: (id: string) => void }
        | undefined;
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

    const onChangeText = (lastProps('Composer') as { onChangeText: (s: string) => void })
      .onChangeText;
    act(() => {
      onChangeText('Tell me more');
    });
    const onSend = (lastProps('Composer') as { onSend: () => void }).onSend;
    await act(async () => {
      onSend();
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith({ text: 'Tell me more' });
    expect((lastProps('Composer') as { text: string }).text).toBe('');
  });

  it('restores the typed text when sendMessage rejects (returns falsy)', async () => {
    const sendMessage = jest.fn().mockResolvedValue(false);
    mockUseChatSession.mockReturnValue(defaultSession({ sendMessage }));
    render(<ChatSessionScreen />);

    act(() => {
      (lastProps('Composer') as { onChangeText: (s: string) => void }).onChangeText('failing text');
    });
    await act(async () => {
      (lastProps('Composer') as { onSend: () => void }).onSend();
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith({ text: 'failing text' });
    expect((lastProps('Composer') as { text: string }).text).toBe('failing text');
  });
});

describe('ChatSessionScreen — Composer media wiring (A1)', () => {
  it('forwards toggleRecording, recordedAudioUri and isRecording to Composer (R23)', () => {
    render(<ChatSessionScreen />);
    const props = lastProps('Composer') as {
      toggleRecording: () => Promise<void> | void;
      recordedAudioUri: string | null;
      isRecording: boolean;
      onOpenAttachments: () => void;
    };

    expect(typeof props.toggleRecording).toBe('function');
    expect(typeof props.onOpenAttachments).toBe('function');

    void props.toggleRecording();
    expect(mockAudioRecorderState.toggleRecording).toHaveBeenCalledTimes(1);
  });

  it('opens the attachment-picker route with wired media + audio handles (R22)', () => {
    render(<ChatSessionScreen />);
    const { onOpenAttachments } = lastProps('Composer') as {
      onOpenAttachments: () => void;
    };

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
    expect((lastProps('Composer') as { text: string }).text).toBe('');

    act(() => {
      (lastProps('Composer') as { onChangeText: (s: string) => void }).onChangeText('typing...');
    });

    expect((lastProps('Composer') as { text: string }).text).toBe('typing...');
  });

  it('onClearImage clears the selected image via the image picker hook', () => {
    render(<ChatSessionScreen />);
    const onClearImage = (lastProps('Composer') as { onClearImage: () => void }).onClearImage;
    onClearImage();
    expect(mockImagePickerState.clearSelectedImage).toHaveBeenCalledTimes(1);
  });
});
