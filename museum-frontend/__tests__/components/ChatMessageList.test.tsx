import '../helpers/test-utils';
import React from 'react';

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { setMessageFeedback: jest.fn() },
}));
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

jest.mock('@/features/chat/ui/TypingPlaceholder', () => {
  const { View: RNView } = require('react-native');
  return {
    TypingPlaceholder: ({ visible, testID }: { visible: boolean; testID?: string }) =>
      visible ? <RNView testID={testID ?? 'typing-placeholder'} /> : null,
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
  onFollowUpPress: jest.fn(),
  onRecommendationPress: jest.fn(),
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

  it('shows EmptyState when messages array is empty', () => {
    render(<ChatMessageList {...defaultProps} messages={[]} />);

    expect(screen.getByTestId('chat-empty-state')).toBeTruthy();
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

  it('does NOT show EmptyState when there are messages', () => {
    const messages: ChatUiMessage[] = [createMessage({ id: 'msg-1', role: 'user', text: 'Hello' })];

    render(<ChatMessageList {...defaultProps} messages={messages} />);

    expect(screen.queryByTestId('chat-empty-state')).toBeNull();
  });

  it('renders TypingPlaceholder when isAssistantPending is true', () => {
    const messages: ChatUiMessage[] = [createMessage({ id: 'msg-1', role: 'user', text: 'Hello' })];

    render(<ChatMessageList {...defaultProps} messages={messages} isAssistantPending={true} />);

    expect(screen.getByTestId('chat-assistant-pending')).toBeTruthy();
  });

  it('hides TypingPlaceholder when isAssistantPending is false', () => {
    const messages: ChatUiMessage[] = [createMessage({ id: 'msg-1', role: 'user', text: 'Hello' })];

    render(<ChatMessageList {...defaultProps} messages={messages} isAssistantPending={false} />);

    expect(screen.queryByTestId('chat-assistant-pending')).toBeNull();
  });
});
