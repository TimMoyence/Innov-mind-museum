import '../helpers/test-utils';
import React from 'react';
import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';

// ── Sub-component mocks ──────────────────────────────────────────────────────

jest.mock('@/features/chat/ui/ChatMessageBubble', () => {
  const { View: RNView } = require('react-native');
  return {
    ChatMessageBubble: ({ message }: { message: { id: string } }) => (
      <RNView testID={`chat-bubble-${message.id}`} />
    ),
  };
});

jest.mock('@/features/chat/ui/MessageActions', () => {
  const { View: RNView } = require('react-native');
  return {
    MessageActions: () => <RNView testID="message-actions" />,
  };
});

jest.mock('@/features/chat/ui/TypingIndicator', () => {
  const { View: RNView } = require('react-native');
  return {
    TypingIndicator: () => <RNView testID="typing-indicator" />,
  };
});

jest.mock('@/features/chat/ui/WelcomeCard', () => {
  const { View: RNView } = require('react-native');
  return {
    WelcomeCard: () => <RNView testID="welcome-card" />,
  };
});

jest.mock('@/features/chat/application/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    isPlaying: false,
    isLoading: false,
    activeMessageId: null,
    togglePlayback: jest.fn(),
    stopPlayback: jest.fn(),
  }),
}));

import { ChatMessageList } from '@/features/chat/ui/ChatMessageList';

// ── Helpers ──────────────────────────────────────────────────────────────────

const createMessage = (overrides: Partial<ChatUiMessage> = {}): ChatUiMessage => ({
  id: 'msg-1',
  role: 'user',
  text: 'Hello',
  createdAt: '2025-01-01T00:00:00.000Z',
  metadata: null,
  ...overrides,
});

const defaultProps = {
  messages: [] as ChatUiMessage[],
  isSending: false,
  isStreaming: false,
  locale: 'en',
  museumMode: false,
  onFollowUpPress: jest.fn(),
  onRecommendationPress: jest.fn(),
  onSuggestion: jest.fn(),
  onCamera: jest.fn(),
  onImageError: jest.fn(),
  onReport: jest.fn(),
};

describe('ChatMessageList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a ChatMessageBubble for each message', () => {
    const messages: ChatUiMessage[] = [
      createMessage({ id: 'msg-1', role: 'user', text: 'Hi' }),
      createMessage({ id: 'msg-2', role: 'assistant', text: 'Hello there' }),
      createMessage({ id: 'msg-3', role: 'user', text: 'How are you?' }),
    ];

    render(<ChatMessageList {...defaultProps} messages={messages} />);

    expect(screen.getByTestId('chat-bubble-msg-1')).toBeTruthy();
    expect(screen.getByTestId('chat-bubble-msg-2')).toBeTruthy();
    expect(screen.getByTestId('chat-bubble-msg-3')).toBeTruthy();
  });

  it('shows WelcomeCard when messages array is empty', () => {
    render(<ChatMessageList {...defaultProps} messages={[]} />);

    expect(screen.getByTestId('welcome-card')).toBeTruthy();
  });

  it('shows TypingIndicator when isSending=true and isStreaming=false', () => {
    render(<ChatMessageList {...defaultProps} messages={[]} isSending isStreaming={false} />);

    expect(screen.getByTestId('typing-indicator')).toBeTruthy();
  });

  it('does NOT show TypingIndicator when isStreaming=true', () => {
    const messages: ChatUiMessage[] = [
      createMessage({ id: 'msg-1', role: 'assistant', text: 'Streaming...' }),
    ];

    render(<ChatMessageList {...defaultProps} messages={messages} isSending isStreaming />);

    expect(screen.queryByTestId('typing-indicator')).toBeNull();
  });

  it('does NOT show WelcomeCard when there are messages', () => {
    const messages: ChatUiMessage[] = [createMessage({ id: 'msg-1', role: 'user', text: 'Hello' })];

    render(<ChatMessageList {...defaultProps} messages={messages} />);

    expect(screen.queryByTestId('welcome-card')).toBeNull();
  });
});
