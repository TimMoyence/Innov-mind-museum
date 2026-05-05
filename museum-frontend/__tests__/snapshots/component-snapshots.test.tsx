/**
 * Behaviour & accessibility tests for key UI components.
 *
 * Replaces the previous toJSON()-based snapshot tests with role-query
 * and behaviour assertions per ADR-012 + Phase 0 cosmetic-test purge.
 * Each test case pins a specific user-visible regression — see inline
 * `// pins:` comments for the exact contract guarded.
 */
import '../helpers/test-utils';
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { WelcomeCard } from '@/features/chat/ui/WelcomeCard';
import { ChatInput } from '@/features/chat/ui/ChatInput';
import { nonNull } from '../helpers/nonNull';

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
// WelcomeCard — accessibility & behaviour
// ============================================================================

describe('WelcomeCard — accessibility & behaviour', () => {
  // pins: the standard mode greeting card exposes a camera-trigger button
  // accessible to screen readers via its accessibility role
  it('renders a camera button reachable via accessibility role in standard mode', () => {
    const onCamera = jest.fn();
    const { getByRole } = render(
      <WelcomeCard
        museumMode={false}
        onSuggestion={jest.fn()}
        onCamera={onCamera}
        disabled={false}
      />,
    );
    const button = getByRole('button', { name: /camera|photo/i });
    expect(button).toBeTruthy();
  });

  // pins: museum mode renders distinct content (museum-specific suggestions)
  // confirmed by the presence of multiple suggestion buttons
  it('renders multiple suggestion buttons in museum mode', () => {
    const onSuggestion = jest.fn();
    const { getAllByRole } = render(
      <WelcomeCard
        museumMode={true}
        onSuggestion={onSuggestion}
        onCamera={jest.fn()}
        disabled={false}
      />,
    );
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// ErrorBoundary — fallback behaviour
// ============================================================================

describe('ErrorBoundary — fallback behaviour', () => {
  // pins: the ErrorBoundary is transparent (renders children) when no error
  it('renders children when no error is thrown', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Safe content</Text>
      </ErrorBoundary>,
    );
    expect(getByText('Safe content')).toBeTruthy();
  });

  // pins: after a child throws, the boundary swaps in a recoverable fallback
  // (fallback contains a retry/reload affordance — the contract a user relies on)
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
    // child content gone
    expect(queryByText('snapshot crash')).toBeNull();
    // fallback button (retry/reload) reachable by role
    expect(getByRole('button')).toBeTruthy();
    spy.mockRestore();
  });
});

// ============================================================================
// ChatMessageBubble — role-based rendering
// ============================================================================

describe('ChatMessageBubble — role-based rendering', () => {
  const baseMessage = {
    id: 'msg-snap-1',
    text: 'Hello, how can I help?',
    createdAt: '2025-06-15T10:30:00.000Z',
    metadata: null,
  };

  // pins: user messages render the message text verbatim (no markdown stripping)
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

  // pins: assistant messages must expose a report affordance with a screen-reader-accessible
  // label matching /report/i (AssistantMetaActions renders a flagging button for moderation)
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
    // AssistantMetaActions always renders a report Pressable with accessibilityLabel
    // matching the i18n key 'messageMenu.report' — must be present for moderation to work
    expect(getByLabelText(/report/i)).toBeTruthy();
  });
});

// ============================================================================
// ChatInput — disabled/sending state
// ============================================================================

describe('ChatInput — disabled/sending state', () => {
  // pins: send button is accessible (enabled) when not sending, even with empty value —
  // the component delegates empty-submit prevention to the caller, not the button state
  it('renders an accessible send button in the default (not sending) state', () => {
    const onSend = jest.fn();
    const onChangeText = jest.fn();
    const { getByRole } = render(
      <ChatInput value="" onChangeText={onChangeText} onSend={onSend} isSending={false} />,
    );
    const sendButton = getByRole('button', { name: /send/i });
    expect(sendButton).toBeTruthy();
    // not in a disabled state
    const isDisabled =
      sendButton.props.accessibilityState?.disabled ?? sendButton.props.disabled ?? false;
    expect(isDisabled).toBeFalsy();
  });

  // pins: while a message is in flight, the send button is always rendered but disabled
  // (prevents duplicate sends — Pressable is always mounted, isSending sets disabled={true})
  it('disables send when isSending is true', () => {
    const onSend = jest.fn();
    const { queryByRole } = render(
      <ChatInput value="Hello" onChangeText={jest.fn()} onSend={onSend} isSending={true} />,
    );
    const sendButton = queryByRole('button', { name: /send/i });
    // button is always rendered (never hidden) — a missing button means a regression
    expect(sendButton).not.toBeNull();
    const button = nonNull(sendButton);
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });
});
