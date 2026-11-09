import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeAssistantMessage, makeChatUiMessage } from '../helpers/factories';

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

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

describe('ChatMessageBubble a11y text exposure (I-CMP3(5) / R8)', () => {
  const defaultProps = {
    locale: 'en-US',
    onImageError: jest.fn(),
    onReport: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the real assistant response text to the a11y tree', () => {
    const message = makeAssistantMessage({ text: 'The Mona Lisa is a 16th-century portrait.' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);

    expect(screen.getByText('The Mona Lisa is a 16th-century portrait.')).toBeTruthy();
  });

  it('does NOT mask the response text behind a static assistant_message label', () => {
    const message = makeAssistantMessage({ text: 'Caravaggio used dramatic chiaroscuro.' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);

    const maskingLabel = screen.queryByLabelText('a11y.chat.assistant_message');
    expect(maskingLabel).toBeNull();
  });

  it('preserves the long-press affordance hint on the assistant bubble', () => {
    const message = makeAssistantMessage({ text: 'Rembrandt mastered self-portraiture.' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);

    expect(screen.getByA11yHint('a11y.chat.long_press_hint')).toBeTruthy();
  });

  it('keeps the real user message text reachable in the a11y tree (T-C05-1, guard)', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Bonjour le musée' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);

    expect(screen.getByText('Bonjour le musée')).toBeTruthy();
  });

  it('exposes assistant text AND the attached image label together (T-C05-2)', () => {
    const message = makeAssistantMessage({
      text: 'A bronze cast from 1880.',
      image: { url: 'file:///tmp/attachment.jpg', expiresAt: '' },
    });
    render(<ChatMessageBubble {...defaultProps} message={message} />);

    expect(screen.getByText('A bronze cast from 1880.')).toBeTruthy();
    expect(screen.getByLabelText('a11y.chat.attached_image')).toBeTruthy();
  });
});
