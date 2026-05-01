/**
 * Walk-mode UX integration tests for ChatSessionScreen.
 *
 * Covers:
 * 1. ?intent=walk → walk header banner rendered with chat.walk.headerLabel
 * 2. ?intent=walk + lastAssistantMessage.suggestions non-empty → WalkSuggestionChips visible
 * 3. ?intent=walk + suggestions empty → WalkSuggestionChips returns null (no chips)
 * 4. intent NOT walk → no banner, no chips
 */

import '../helpers/test-utils';
import { mockUseChatSession, defaultChatSession } from '../helpers/chat-screen.setup';
import { render, screen } from '@testing-library/react-native';

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

// Override WalkSuggestionChips with a testable stub that honours the suggestions prop.
jest.mock('@/features/chat/ui/WalkSuggestionChips', () => {
  const { View } = require('react-native');
  return {
    WalkSuggestionChips: ({ suggestions }: { suggestions: string[] }) =>
      suggestions.length > 0 ? <View testID="walk-suggestion-chips" /> : null,
  };
});

const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');

/** Helper: set useLocalSearchParams to return specific intent */
function setParams(intent?: string) {
  mockExpoRouter.useLocalSearchParams = () => ({
    sessionId: 'test-session-123',
    ...(intent !== undefined ? { intent } : {}),
  });
}

/** A chat session with a last assistant message carrying suggestions */
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
    // t() mock returns the key itself
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
});
