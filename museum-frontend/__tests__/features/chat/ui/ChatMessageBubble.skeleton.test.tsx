import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeAssistantMessage, makeEnrichedImage } from '../../../helpers/factories';

// Mock heavy sub-components — keep the test focused on the
// skeleton-vs-carousel swap behaviour (C2.4 / Q1 option (b)).
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

jest.mock('@/features/chat/ui/ImageCarouselSkeleton', () => {
  const { View } = require('react-native');
  return {
    ImageCarouselSkeleton: () => <View testID="image-carousel-skeleton" />,
  };
});

jest.mock('@/features/chat/ui/ImageFullscreenModal', () => {
  const { View } = require('react-native');
  return {
    ImageFullscreenModal: () => <View testID="image-fullscreen-modal" />,
  };
});

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

describe('ChatMessageBubble — C2.4 skeleton ↔ carousel transition', () => {
  const onImageError = jest.fn();
  const onReport = jest.fn();
  const defaultProps = { locale: 'en-US', onImageError, onReport };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the skeleton above the streaming body while images are not hydrated yet', () => {
    const message = makeAssistantMessage({}, { images: undefined });
    render(<ChatMessageBubble {...defaultProps} message={message} isStreaming />);

    expect(screen.queryByTestId('image-carousel-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('image-carousel')).toBeNull();
  });

  it('swaps to the real carousel once streaming finishes and images arrive', () => {
    const message = makeAssistantMessage(
      {},
      {
        images: [
          makeEnrichedImage({ url: 'https://a.com/1.jpg', rationale: 'Seen at the Louvre.' }),
          makeEnrichedImage({ url: 'https://a.com/2.jpg', rationale: 'Comparable subject.' }),
        ],
      },
    );

    render(<ChatMessageBubble {...defaultProps} message={message} isStreaming={false} />);

    expect(screen.queryByTestId('image-carousel-skeleton')).toBeNull();
    expect(screen.queryByTestId('image-carousel')).toBeTruthy();
  });

  it('does NOT render the skeleton when streaming has already produced images (race-safe)', () => {
    const message = makeAssistantMessage(
      {},
      {
        images: [makeEnrichedImage({ url: 'https://a.com/early.jpg', rationale: 'Early hit.' })],
      },
    );

    render(<ChatMessageBubble {...defaultProps} message={message} isStreaming />);

    // While streaming with already-hydrated images, the skeleton hides.
    // The real carousel only renders once isStreaming flips to false (post-T12.2 gate).
    expect(screen.queryByTestId('image-carousel-skeleton')).toBeNull();
  });

  it('renders no carousel/skeleton when the message has no images and streaming is done', () => {
    const message = makeAssistantMessage({}, { images: undefined });

    render(<ChatMessageBubble {...defaultProps} message={message} isStreaming={false} />);

    expect(screen.queryByTestId('image-carousel-skeleton')).toBeNull();
    expect(screen.queryByTestId('image-carousel')).toBeNull();
  });
});
