import '../helpers/test-utils';
import { mockUseChatSession, defaultChatSession } from '../helpers/chat-screen.setup';
import { render, screen } from '../helpers/render-chat-screen';

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

jest.mock('@/features/chat/ui/WalkSuggestionChips', () => {
  const { View } = require('react-native');
  return {
    WalkSuggestionChips: jest.fn(({ suggestions }: { suggestions: string[] }) =>
      suggestions.length > 0 ? <View testID="walk-suggestion-chips" /> : null,
    ),
  };
});

const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');

function setParams(intent?: string) {
  mockExpoRouter.useLocalSearchParams = () => ({
    sessionId: 'test-session-123',
    ...(intent !== undefined ? { intent } : {}),
  });
}

function sessionWithSuggestions(suggestions: string[]) {
  return {
    ...defaultChatSession(),
    messages: [
      {
        id: 'msg-1',
        role: 'assistant' as const,
        text: 'Here are some artworks nearby.',
        createdAt: new Date().toISOString(),
        metadata: null,
        suggestions,
      },
    ],
  };
}

describe('ChatSessionScreen — walk mode UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChatSession.mockReturnValue(defaultChatSession());
  });

  it('renders walk header banner when intent=walk', () => {
    setParams('walk');
    mockUseChatSession.mockReturnValue(defaultChatSession());
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('walk-mode-banner')).toBeTruthy();
    expect(screen.getByText('chat.walk.headerLabel')).toBeTruthy();
  });

  it('renders WalkSuggestionChips when intent=walk and suggestions non-empty', () => {
    setParams('walk');
    mockUseChatSession.mockReturnValue(sessionWithSuggestions(['Mona Lisa', 'The Thinker']));
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('walk-suggestion-chips')).toBeTruthy();
  });

  it('does NOT render WalkSuggestionChips when intent=walk and suggestions empty', () => {
    setParams('walk');
    mockUseChatSession.mockReturnValue(sessionWithSuggestions([]));
    render(<ChatSessionScreen />);
    expect(screen.queryByTestId('walk-suggestion-chips')).toBeNull();
  });

  it('does NOT render walk banner or chips when intent is not walk', () => {
    setParams(undefined);
    mockUseChatSession.mockReturnValue(sessionWithSuggestions(['Mona Lisa']));
    render(<ChatSessionScreen />);
    expect(screen.queryByTestId('walk-mode-banner')).toBeNull();
    expect(screen.queryByTestId('walk-suggestion-chips')).toBeNull();
  });

  it('does NOT render walk banner when intent is camera', () => {
    setParams('camera');
    mockUseChatSession.mockReturnValue(defaultChatSession());
    render(<ChatSessionScreen />);
    expect(screen.queryByTestId('walk-mode-banner')).toBeNull();
  });

  it('fires sendMessage with chip text when chip is selected', () => {
    setParams('walk');
    const session = sessionWithSuggestions(['Mona Lisa']);
    const mockSend = jest.fn().mockResolvedValue(true);
    mockUseChatSession.mockReturnValue({ ...session, sendMessage: mockSend });
    render(<ChatSessionScreen />);

    const stub = jest.requireMock<{ WalkSuggestionChips: jest.Mock }>(
      '@/features/chat/ui/WalkSuggestionChips',
    );
    const lastCall = stub.WalkSuggestionChips.mock.calls.at(-1);
    const onSelect = (lastCall?.[0] as { onSelect?: (text: string) => void } | undefined)?.onSelect;
    expect(onSelect).toBeDefined();
    onSelect?.('Mona Lisa');
    expect(mockSend).toHaveBeenCalledWith({ text: 'Mona Lisa' });
  });
});
