/**
 * Snapshot tests for key UI components.
 *
 * These capture the rendered tree structure so regressions in layout or
 * element hierarchy are caught during review.
 */
import '../helpers/test-utils';
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { WelcomeCard } from '@/features/chat/ui/WelcomeCard';
import { ChatInput } from '@/features/chat/ui/ChatInput';

// ── ErrorBoundary-specific mocks ────────────────────────────────────────────
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

// ── ChatMessageBubble mocks ─────────────────────────────────────────────────
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

// ============================================================================
// WelcomeCard snapshots
// ============================================================================

describe('WelcomeCard snapshots', () => {
  it('matches snapshot in standard mode', () => {
    const tree = render(
      <WelcomeCard
        museumMode={false}
        onSuggestion={jest.fn()}
        onCamera={jest.fn()}
        disabled={false}
      />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('matches snapshot in museum mode', () => {
    const tree = render(
      <WelcomeCard
        museumMode={true}
        onSuggestion={jest.fn()}
        onCamera={jest.fn()}
        disabled={false}
      />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});

// ============================================================================
// ErrorBoundary snapshots
// ============================================================================

describe('ErrorBoundary snapshots', () => {
  it('matches snapshot when rendering children normally', () => {
    const tree = render(
      <ErrorBoundary>
        <Text>Safe content</Text>
      </ErrorBoundary>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('matches snapshot when showing fallback after error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowError = () => {
      throw new Error('snapshot crash');
    };
    const tree = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(tree.toJSON()).toMatchSnapshot();

    spy.mockRestore();
  });
});

// ============================================================================
// ChatMessageBubble snapshots
// ============================================================================

describe('ChatMessageBubble snapshots', () => {
  const baseMessage = {
    id: 'msg-snap-1',
    text: 'Hello, how can I help?',
    createdAt: '2025-06-15T10:30:00.000Z',
    metadata: null,
  };

  it('matches snapshot for user message', () => {
    const tree = render(
      <ChatMessageBubble
        message={{ ...baseMessage, role: 'user' as const }}
        locale="en"
        onImageError={jest.fn()}
        onReport={jest.fn()}
      />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('matches snapshot for assistant message', () => {
    const tree = render(
      <ChatMessageBubble
        message={{ ...baseMessage, role: 'assistant' as const }}
        locale="en"
        onImageError={jest.fn()}
        onReport={jest.fn()}
      />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});

// ============================================================================
// ChatInput snapshots
// ============================================================================

describe('ChatInput snapshots', () => {
  it('matches snapshot in default state', () => {
    const tree = render(
      <ChatInput value="" onChangeText={jest.fn()} onSend={jest.fn()} isSending={false} />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('matches snapshot in sending state', () => {
    const tree = render(
      <ChatInput value="Hello" onChangeText={jest.fn()} onSend={jest.fn()} isSending={true} />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
