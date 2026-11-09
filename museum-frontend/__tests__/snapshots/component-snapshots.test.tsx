import '../helpers/test-utils';
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { ChatInput } from '@/features/chat/ui/ChatInput';
import { nonNull } from '../helpers/nonNull';

jest.mock('@/shared/i18n/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  },
}));

jest.mock('@/shared/ui/themes', () => ({
  darkTheme: {
    primary: '#2563EB',
    pageGradient: ['#0F172A', '#1E293B', '#0F172A'] as readonly [string, string, ...string[]],
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    primaryContrast: '#FFFFFF',
  },
}));

import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';

jest.mock('@/features/chat/ui/MarkdownBubble', () => {
  const { Text: RNText } = require('react-native');
  return {
    MarkdownBubble: ({ text }: { text: string }) => <RNText>{text}</RNText>,
  };
});

jest.mock('@/features/chat/ui/ArtworkCard', () => {
  const { View } = require('react-native');
  return {
    ArtworkCard: () => <View testID="artwork-card" />,
  };
});

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

describe('ErrorBoundary — fallback behaviour', () => {
  it('renders children when no error is thrown', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Safe content</Text>
      </ErrorBoundary>,
    );
    expect(getByText('Safe content')).toBeTruthy();
  });

  it('renders fallback UI after a child throws', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ThrowError = () => {
      throw new Error('snapshot crash');
    };
    const { queryByText, getByRole } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(queryByText('snapshot crash')).toBeNull();
    expect(getByRole('button')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('ChatMessageBubble — role-based rendering', () => {
  const baseMessage = {
    id: 'msg-snap-1',
    text: 'Hello, how can I help?',
    createdAt: '2025-06-15T10:30:00.000Z',
    metadata: null,
  };

  it('renders user message text without modification', () => {
    const { getByText } = render(
      <ChatMessageBubble
        message={{ ...baseMessage, role: 'user' as const }}
        locale="en"
        onImageError={jest.fn()}
        onReport={jest.fn()}
      />,
    );
    expect(getByText('Hello, how can I help?')).toBeTruthy();
  });

  it('exposes a report affordance on assistant messages', () => {
    const onReport = jest.fn();
    const { getByLabelText } = render(
      <ChatMessageBubble
        message={{ ...baseMessage, role: 'assistant' as const }}
        locale="en"
        onImageError={jest.fn()}
        onReport={onReport}
      />,
    );
    expect(getByLabelText(/report/i)).toBeTruthy();
  });
});

describe('ChatInput — disabled/sending state', () => {
  it('renders an accessible send button in the default (not sending) state', () => {
    const onSend = jest.fn();
    const onChangeText = jest.fn();
    const { getByRole } = render(
      <ChatInput value="" onChangeText={onChangeText} onSend={onSend} isSending={false} />,
    );
    const sendButton = getByRole('button', { name: /send/i });
    expect(sendButton).toBeTruthy();
    const isDisabled =
      sendButton.props.accessibilityState?.disabled ?? sendButton.props.disabled ?? false;
    expect(isDisabled).toBeFalsy();
  });

  it('disables send when isSending is true', () => {
    const onSend = jest.fn();
    const { queryByRole } = render(
      <ChatInput value="Hello" onChangeText={jest.fn()} onSend={onSend} isSending={true} />,
    );
    const sendButton = queryByRole('button', { name: /send/i });
    expect(sendButton).not.toBeNull();
    const button = nonNull(sendButton);
    expect(button.props.accessibilityState?.disabled ?? button.props.disabled).toBeTruthy();
  });
});
