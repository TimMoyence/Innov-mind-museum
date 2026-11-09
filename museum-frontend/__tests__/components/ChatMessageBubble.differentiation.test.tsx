import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

import { makeChatUiMessage, makeAssistantMessage } from '../helpers/factories';

jest.mock('@/features/chat/ui/MarkdownBubble', () => {
  const { Text } = require('react-native');
  return {
    MarkdownBubble: ({ text }: { text: string }) => <Text testID="markdown-bubble">{text}</Text>,
  };
});

jest.mock('@/features/chat/ui/ArtworkCard', () => {
  const { Text } = require('react-native');
  return {
    ArtworkCard: ({ title }: { title: string }) => <Text testID="artwork-card">{title}</Text>,
  };
});

jest.mock('@/features/chat/ui/ImageCarousel', () => {
  const { View } = require('react-native');
  return { ImageCarousel: () => <View testID="image-carousel" /> };
});

jest.mock('@/features/chat/ui/ImageFullscreenModal', () => {
  const { View } = require('react-native');
  return { ImageFullscreenModal: () => <View testID="image-fullscreen-modal" /> };
});

const mockUseReducedTransparency = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedTransparency', () => ({
  useReducedTransparency: () => mockUseReducedTransparency(),
}));

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

function flattenStyle(style: StyleProp<ViewStyle> | undefined): ViewStyle {
  return StyleSheet.flatten(style) ?? {};
}

function isOpaqueColor(color: string | undefined): boolean {
  if (typeof color !== 'string') return false;
  if (color.startsWith('#')) return true;
  const rgbaOpaque = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*1(?:\.0+)?\s*\)$/;
  if (rgbaOpaque.test(color)) return true;
  if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(color)) return true;
  return false;
}

function isTranslucentRgba(color: string | undefined): boolean {
  if (typeof color !== 'string') return false;
  const match = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/.exec(color);
  if (!match) return false;
  const [, alpha = '1'] = match;
  return parseFloat(alpha) < 1;
}

describe('ChatMessageBubble — A3 texture differentiation', () => {
  const onImageError = jest.fn();
  const onReport = jest.fn();
  const defaultProps = { locale: 'en-US', onImageError, onReport };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReducedTransparency.mockReset();
    mockUseReducedTransparency.mockReturnValue(false);
  });

  it('renders a container testID="chat-bubble-user" for user messages', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByTestId('chat-bubble-user')).toBeTruthy();
  });

  it('user bubble container is NOT a BlurView (no intensity prop)', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const container = screen.getByTestId('chat-bubble-user');
    expect(container.props.intensity).toBeUndefined();
    expect(container.props.tint).toBeUndefined();
  });

  it('user bubble backgroundColor is opaque (alpha === 1) — mat solide', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const flat = flattenStyle(screen.getByTestId('chat-bubble-user').props.style);
    expect(isOpaqueColor(flat.backgroundColor as string | undefined)).toBe(true);
  });

  it('user bubble preserves alignSelf flex-end + bubble radius/padding', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const flat = flattenStyle(screen.getByTestId('chat-bubble-user').props.style);
    expect(flat.alignSelf).toBe('flex-end');
    expect(typeof flat.borderRadius).toBe('number');
    expect(typeof flat.padding).toBe('number');
  });

  it('renders a container testID="chat-bubble-assistant" for assistant messages', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByTestId('chat-bubble-assistant')).toBeTruthy();
  });

  it('assistant bubble is a BlurView with intensity=42 and tint=light (default theme)', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const container = screen.getByTestId('chat-bubble-assistant');
    expect(container.props.intensity).toBe(42);
    expect(container.props.tint).toBe('light');
  });

  it('assistant bubble backgroundColor stays translucent (alpha < 1) — overlay tint sur blur', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const flat = flattenStyle(screen.getByTestId('chat-bubble-assistant').props.style);
    expect(isTranslucentRgba(flat.backgroundColor as string | undefined)).toBe(true);
  });

  it('assistant bubble has overflow=hidden (to clip the blur to borderRadius)', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const flat = flattenStyle(screen.getByTestId('chat-bubble-assistant').props.style);
    expect(flat.overflow).toBe('hidden');
  });

  it('assistant bubble preserves alignSelf flex-start + bubble radius/padding', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const flat = flattenStyle(screen.getByTestId('chat-bubble-assistant').props.style);
    expect(flat.alignSelf).toBe('flex-start');
    expect(typeof flat.borderRadius).toBe('number');
    expect(typeof flat.padding).toBe('number');
  });

  it('when reduceTransparency=true, assistant bubble is a plain View (not BlurView)', () => {
    mockUseReducedTransparency.mockReturnValue(true);
    const message = makeAssistantMessage({ text: 'Accessible response' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const container = screen.getByTestId('chat-bubble-assistant');
    expect(container.props.intensity).toBeUndefined();
    expect(container.props.tint).toBeUndefined();
  });

  it('when reduceTransparency=true, assistant bubble backgroundColor is opaque (alpha=1)', () => {
    mockUseReducedTransparency.mockReturnValue(true);
    const message = makeAssistantMessage({ text: 'Accessible response' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const flat = flattenStyle(screen.getByTestId('chat-bubble-assistant').props.style);
    expect(isOpaqueColor(flat.backgroundColor as string | undefined)).toBe(true);
  });

  it('when reduceTransparency=true, assistant body stays SR-reachable + keeps the long-press hint', () => {
    mockUseReducedTransparency.mockReturnValue(true);
    const message = makeAssistantMessage({ text: 'Accessible response' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByText('Accessible response')).toBeTruthy();
    expect(screen.queryByLabelText('a11y.chat.assistant_message')).toBeNull();
    expect(screen.getByA11yHint('a11y.chat.long_press_hint')).toBeTruthy();
  });
});
