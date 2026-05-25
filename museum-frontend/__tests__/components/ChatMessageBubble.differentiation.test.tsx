/**
 * A3 — Bubbles différenciées (mat user / glass assistant).
 *
 * Red tests for the texture differentiation between user and assistant bubbles.
 *
 * Spec : docs/chat-ux-refonte/specs/A3.md
 *
 * - User bubble = mat solid : View ordinaire avec backgroundColor opaque (alpha=1).
 * - Assistant bubble = glass : BlurView (intensity=42, tint adaptive) avec
 *   theme.assistantBubble en overlay tint semi-transparent.
 * - Fallback iOS Reduce Transparency : assistant rendu en View opaque (pas BlurView).
 *
 * These tests MUST FAIL at baseline d4a94f735 (A3 not yet implemented).
 */
import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

import { makeChatUiMessage, makeAssistantMessage } from '../helpers/factories';

// ── Sub-component mocks (same as ChatMessageBubble.test.tsx baseline) ──────
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

// ── Hook mock — useReducedTransparency ─────────────────────────────────────
// Default mock: transparency NOT reduced (i.e. BlurView path). Individual tests
// can override via `mockReturnValueOnce(true)` to exercise the fallback path.
const mockUseReducedTransparency = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedTransparency', () => ({
  useReducedTransparency: () => mockUseReducedTransparency(),
}));

// Import the component AFTER mocks are declared.
import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Flattens nested StyleSheet style arrays into a single ViewStyle. */
function flattenStyle(style: StyleProp<ViewStyle> | undefined): ViewStyle {
  return StyleSheet.flatten(style) ?? {};
}

/** Matches an "opaque" RGBA color (alpha === 1) or any hex/named color. */
function isOpaqueColor(color: string | undefined): boolean {
  if (typeof color !== 'string') return false;
  if (color.startsWith('#')) return true;
  // rgba(R, G, B, 1) — accept "1", "1.0", "1.00" with optional whitespace
  const rgbaOpaque = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*1(?:\.0+)?\s*\)$/;
  if (rgbaOpaque.test(color)) return true;
  // rgb(R, G, B) — already opaque
  if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(color)) return true;
  return false;
}

/** Matches a translucent rgba (alpha < 1). */
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

  // ── User bubble = mat solide (View, opaque background) ───────────────────

  it('renders a container testID="chat-bubble-user" for user messages', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByTestId('chat-bubble-user')).toBeTruthy();
  });

  it('user bubble container is NOT a BlurView (no intensity prop)', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const container = screen.getByTestId('chat-bubble-user');
    // BlurView mock spreads `intensity` and `tint` props. A plain <View> has
    // neither. We assert that the user bubble is NOT a BlurView.
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

  // ── Assistant bubble = glass (BlurView, intensity, tint, translucent bg) ─

  it('renders a container testID="chat-bubble-assistant" for assistant messages', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByTestId('chat-bubble-assistant')).toBeTruthy();
  });

  it('assistant bubble is a BlurView with intensity=42 and tint=light (default theme)', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const container = screen.getByTestId('chat-bubble-assistant');
    // The expo-blur mock (test-utils.tsx) spreads `intensity` and `tint` props
    // onto the rendered View. We assert the exact A3 values.
    expect(container.props.intensity).toBe(42);
    expect(container.props.tint).toBe('light');
  });

  it('assistant bubble backgroundColor stays translucent (alpha < 1) — overlay tint sur blur', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const flat = flattenStyle(screen.getByTestId('chat-bubble-assistant').props.style);
    // Per R17 : assistant blur path uses theme.assistantBubble verbatim (semi-
    // transparent ~0.72) so the blur effect is visible underneath.
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

  // ── Reduced transparency fallback ─────────────────────────────────────────

  it('when reduceTransparency=true, assistant bubble is a plain View (not BlurView)', () => {
    mockUseReducedTransparency.mockReturnValue(true);
    const message = makeAssistantMessage({ text: 'Accessible response' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    const container = screen.getByTestId('chat-bubble-assistant');
    // The fallback container does NOT receive intensity or tint props.
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
    // R8 / design §D8 — under reduceTransparency the assistant <Pressable> still
    // does NOT mask the body behind a static a11y label; the real response text
    // stays reachable and the long-press affordance keeps its hint.
    expect(screen.getByText('Accessible response')).toBeTruthy();
    expect(screen.queryByLabelText('a11y.chat.assistant_message')).toBeNull();
    expect(screen.getByA11yHint('a11y.chat.long_press_hint')).toBeTruthy();
  });
});
