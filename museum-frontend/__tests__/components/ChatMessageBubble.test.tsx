import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { makeChatUiMessage, makeAssistantMessage } from '../helpers/factories';

// Mock sub-components used by ChatMessageBubble
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
  return {
    ImageCarousel: () => <View testID="image-carousel" />,
  };
});

jest.mock('@/features/chat/ui/ImageFullscreenModal', () => {
  const { View } = require('react-native');
  return {
    ImageFullscreenModal: () => <View testID="image-fullscreen-modal" />,
  };
});

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

describe('ChatMessageBubble', () => {
  const onImageError = jest.fn();
  const onReport = jest.fn();

  const defaultProps = {
    locale: 'en-US',
    onImageError,
    onReport,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── User messages ───────────────────────────────────────────────────────────

  it('renders user message text', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'What is this painting?' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByText('What is this painting?')).toBeTruthy();
  });

  it('renders user message with correct a11y label', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByLabelText('a11y.chat.user_message')).toBeTruthy();
  });

  // ── Assistant messages ──────────────────────────────────────────────────────

  it('renders assistant message with markdown', () => {
    const message = makeAssistantMessage({ text: 'This is the **Mona Lisa**.' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByTestId('markdown-bubble')).toBeTruthy();
    expect(screen.getByText('This is the **Mona Lisa**.')).toBeTruthy();
  });

  it('renders assistant message with correct a11y label', () => {
    const message = makeAssistantMessage({ text: 'Hello visitor' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByLabelText('a11y.chat.assistant_message')).toBeTruthy();
  });

  // ── Timestamp ───────────────────────────────────────────────────────────────

  it('displays timestamp for non-streaming messages', () => {
    const message = makeChatUiMessage({
      role: 'user',
      text: 'Hi',
      createdAt: '2026-01-15T14:30:00Z',
    });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    // The toLocaleTimeString with 2-digit hour/minute will render some time text
    // We verify the metaRow exists by checking that a time-like pattern renders
    const timeText = screen.getByText(/\d{2}:\d{2}/);
    expect(timeText).toBeTruthy();
  });

  // ── Image attachment ────────────────────────────────────────────────────────

  it('renders image when message has an image URL', () => {
    const message = makeChatUiMessage({
      role: 'user',
      text: 'Look at this',
      image: { url: 'https://example.com/photo.jpg', expiresAt: '2099-01-01T00:00:00Z' },
    });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    // Image component renders — we can check it does not crash
    expect(screen.getByText('Look at this')).toBeTruthy();
  });

  // ── Failed state + retry ──────────────────────────────────────────────────

  it('shows failed state with retry button', () => {
    const onRetry = jest.fn();
    const message = makeChatUiMessage({
      role: 'user',
      text: 'Failed message',
      sendFailed: true,
    });
    render(<ChatMessageBubble {...defaultProps} message={message} onRetry={onRetry} />);
    expect(screen.getByText('chat.sendFailed')).toBeTruthy();
    expect(screen.getByLabelText('common.retry')).toBeTruthy();
  });

  it('fires onRetry when retry button is pressed', () => {
    const onRetry = jest.fn();
    const message = makeChatUiMessage({
      role: 'user',
      text: 'Failed message',
      sendFailed: true,
    });
    render(<ChatMessageBubble {...defaultProps} message={message} onRetry={onRetry} />);
    fireEvent.press(screen.getByLabelText('common.retry'));
    expect(onRetry).toHaveBeenCalledWith(message);
  });

  it('does not show retry when sendFailed is false', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Good message', sendFailed: false });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.queryByText('chat.sendFailed')).toBeNull();
  });

  // ── Detected artwork metadata ─────────────────────────────────────────────

  it('renders ArtworkCard when assistant message has detected artwork', () => {
    const message = makeAssistantMessage(
      { text: 'Detected artwork' },
      {
        detectedArtwork: {
          title: 'The Starry Night',
          artist: 'Van Gogh',
          museum: 'MoMA',
          room: 'Gallery 5',
          confidence: 0.95,
        },
      },
    );
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByTestId('artwork-card')).toBeTruthy();
    expect(screen.getByText('The Starry Night')).toBeTruthy();
  });

  it('does not render ArtworkCard for user messages', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'No artwork here' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.queryByTestId('artwork-card')).toBeNull();
  });

  // ── Report action ─────────────────────────────────────────────────────────

  it('renders report button on assistant messages', () => {
    const message = makeAssistantMessage({ text: 'Some response' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    expect(screen.getByLabelText('messageMenu.report')).toBeTruthy();
  });

  it('fires onReport when report button is pressed', () => {
    const message = makeAssistantMessage({ text: 'Some response' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);
    fireEvent.press(screen.getByLabelText('messageMenu.report'));
    expect(onReport).toHaveBeenCalledWith(message.id);
  });

  // ── Feedback buttons ──────────────────────────────────────────────────────

  it('renders thumbs up/down buttons when onFeedback is provided', () => {
    const onFeedback = jest.fn();
    const message = makeAssistantMessage({ text: 'Great art!' });
    render(<ChatMessageBubble {...defaultProps} message={message} onFeedback={onFeedback} />);
    expect(screen.getByLabelText('chat.thumbsUp')).toBeTruthy();
    expect(screen.getByLabelText('chat.thumbsDown')).toBeTruthy();
  });

  it('fires onFeedback with positive when thumbs up is pressed', () => {
    const onFeedback = jest.fn();
    const message = makeAssistantMessage({ text: 'Great art!' });
    render(<ChatMessageBubble {...defaultProps} message={message} onFeedback={onFeedback} />);
    fireEvent.press(screen.getByLabelText('chat.thumbsUp'));
    expect(onFeedback).toHaveBeenCalledWith(message.id, 'positive');
  });

  it('fires onFeedback with negative when thumbs down is pressed', () => {
    const onFeedback = jest.fn();
    const message = makeAssistantMessage({ text: 'Great art!' });
    render(<ChatMessageBubble {...defaultProps} message={message} onFeedback={onFeedback} />);
    fireEvent.press(screen.getByLabelText('chat.thumbsDown'));
    expect(onFeedback).toHaveBeenCalledWith(message.id, 'negative');
  });

  // ── TTS ───────────────────────────────────────────────────────────────────

  it('renders listen button when onToggleTts is provided', () => {
    const onToggleTts = jest.fn().mockResolvedValue(undefined);
    const message = makeAssistantMessage({ text: 'Listen to this' });
    render(<ChatMessageBubble {...defaultProps} message={message} onToggleTts={onToggleTts} />);
    expect(screen.getByLabelText('chat.listen')).toBeTruthy();
  });

  it('shows listening label when ttsPlaying is true', () => {
    const onToggleTts = jest.fn().mockResolvedValue(undefined);
    const message = makeAssistantMessage({ text: 'Playing now' });
    render(
      <ChatMessageBubble
        {...defaultProps}
        message={message}
        onToggleTts={onToggleTts}
        ttsPlaying
      />,
    );
    expect(screen.getByLabelText('chat.listening')).toBeTruthy();
  });

  // ── Streaming ─────────────────────────────────────────────────────────────

  it('does not show timestamp or metadata while streaming', () => {
    const message = makeAssistantMessage(
      { text: 'Streaming...' },
      { detectedArtwork: { title: 'Should not show' } },
    );
    render(<ChatMessageBubble {...defaultProps} message={message} isStreaming />);
    // Artwork card should not render during streaming
    expect(screen.queryByTestId('artwork-card')).toBeNull();
    // Report button should not render during streaming (it's in metaRow)
    expect(screen.queryByLabelText('messageMenu.report')).toBeNull();
  });
});
