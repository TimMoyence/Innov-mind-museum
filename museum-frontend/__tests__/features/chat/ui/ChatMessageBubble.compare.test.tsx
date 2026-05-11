/**
 * RED tests for `ChatMessageBubble` C3 compare integration (T8.5, Phase 8).
 *
 * Contract: when an assistant message carries
 *   `metadata.compareResults.matches.length > 0`
 * the bubble renders an `<ImageCompareCarousel>` below the streaming body.
 * When metadata is absent, the carousel is NOT rendered. With an empty
 * matches array but a `fallbackReason`, the carousel renders its own
 * empty-state (i.e. the parent still mounts the carousel — it owns the
 * fallback UX).
 *
 * The green-editor will need to wire `compareResults` into
 * `ChatUiMessageMetadata` and call `<ImageCompareCarousel>`. Until then,
 * these tests must FAIL: either the metadata field has no effect (no
 * carousel rendered) or the carousel module does not exist.
 */
import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeAssistantMessage } from '../../../helpers/factories';

// Heavy sub-components are mocked — keep the test focused on the swap.
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

// The C3 carousel — exposes a stable testID + a deterministic count of mock
// match children so the bubble integration assertions don't depend on
// the (yet-unwritten) real component's layout.
jest.mock('@/features/chat/ui/ImageCompareCarousel', () => {
  const { Text, View } = require('react-native');
  return {
    ImageCompareCarousel: ({
      matches,
    }: {
      matches: readonly { qid: string }[];
    }) => (
      <View testID="image-compare-carousel">
        <Text testID="image-compare-carousel-count">{String(matches.length)}</Text>
      </View>
    ),
  };
});

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

const baseProps = {
  locale: 'fr-FR',
  onImageError: jest.fn(),
  onReport: jest.fn(),
};

describe('ChatMessageBubble — C3 compare integration (T8.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders ImageCompareCarousel when metadata.compareResults.matches.length > 0', () => {
    const message = makeAssistantMessage(
      {},
      {
        // Cast through unknown — the green editor must extend
        // `ChatUiMessageMetadata` to include `compareResults`.
        ...({
          compareResults: {
            matches: [
              {
                qid: 'Q1',
                title: 'A',
                imageUrl: 'https://x/y.jpg',
                visualScore: 0.9,
                metadataScore: 0.5,
                finalScore: 0.8,
                rationale: 'r',
                facts: { qid: 'Q1', title: 'A' },
              },
              {
                qid: 'Q2',
                title: 'B',
                imageUrl: 'https://x/z.jpg',
                visualScore: 0.85,
                metadataScore: 0.55,
                finalScore: 0.78,
                rationale: 'r2',
                facts: { qid: 'Q2', title: 'B' },
              },
            ],
            durationMs: 320,
            modelVersion: 'siglip-base@onnx',
          },
        } as unknown as Record<string, unknown>),
      },
    );

    render(<ChatMessageBubble {...baseProps} message={message} isStreaming={false} />);

    expect(screen.queryByTestId('image-compare-carousel')).toBeTruthy();
    expect(screen.getByTestId('image-compare-carousel-count').props.children).toBe('2');
  });

  it('does NOT render ImageCompareCarousel when compareResults metadata is absent', () => {
    const message = makeAssistantMessage({}, {});

    render(<ChatMessageBubble {...baseProps} message={message} isStreaming={false} />);

    expect(screen.queryByTestId('image-compare-carousel')).toBeNull();
  });

  it('renders ImageCompareCarousel (empty-state) when matches=[] and fallbackReason is set', () => {
    const message = makeAssistantMessage(
      {},
      {
        ...({
          compareResults: {
            matches: [],
            durationMs: 280,
            modelVersion: 'siglip-base@onnx',
            fallbackReason: 'no_visual_neighbor',
          },
        } as unknown as Record<string, unknown>),
      },
    );

    render(<ChatMessageBubble {...baseProps} message={message} isStreaming={false} />);

    // Parent still mounts the carousel — it owns the empty-state UX.
    expect(screen.queryByTestId('image-compare-carousel')).toBeTruthy();
    expect(screen.getByTestId('image-compare-carousel-count').props.children).toBe('0');
  });
});
