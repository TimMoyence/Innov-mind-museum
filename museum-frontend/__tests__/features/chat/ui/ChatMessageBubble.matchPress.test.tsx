/**
 * RED tests for `ChatMessageBubble` C3 compare TAP wiring (cycle D — D-06).
 *
 * SUT: `museum-frontend/features/chat/ui/ChatMessageBubble.tsx`.
 *
 * Today the bubble mounts `<ImageCompareCarousel onMatchPress={() => undefined} />`
 * (`ChatMessageBubble.tsx:280`) — tapping a match card does NOTHING. The carousel
 * (`ImageCompareCarousel.tsx:37`) and the card (`ImageCompareCard.tsx:45-47`) are
 * ALREADY wired to call `onMatchPress(qid)`; the only broken link is the parent
 * bubble, which never forwards a real handler from the screen.
 *
 * Target contract (cycle D, D-06.1 / D-06.3): the bubble SHALL accept an
 * `onMatchPress?: (qid: string) => void` prop (mirroring the existing
 * `onArtworkPress` plumbing) and forward it to `<ImageCompareCarousel>` so a tap
 * on a match card surfaces the artwork (Wikidata sheet built in GREEN).
 *
 * These tests mock `ImageCompareCarousel` with a tappable button that invokes
 * whatever `onMatchPress` it receives, asserting the parent forwards a *real*
 * handler. Until GREEN wires the prop through, the no-op
 * `onMatchPress={() => undefined}` swallows the tap → the screen handler is
 * never called → these tests FAIL.
 *
 * Graceful case: when no `onMatchPress` prop is provided, tapping must not crash
 * (the carousel still receives a callable no-op).
 */
import '../../../helpers/test-utils';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  makeAssistantMessage,
  makeCompareMatch,
  makeCompareResult,
} from '../../../helpers/factories';

// Heavy sub-components mocked — keep the test focused on the tap forwarding.
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

// Mock the C3 carousel so that "tapping the first card" is expressed as a single
// pressable that invokes the `onMatchPress` the bubble forwards, with the first
// match's qid. This isolates the assertion to the bubble→carousel passthrough.
jest.mock('@/features/chat/ui/ImageCompareCarousel', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    ImageCompareCarousel: ({
      matches,
      onMatchPress,
    }: {
      matches: readonly { qid: string }[];
      onMatchPress: (qid: string) => void;
    }) => (
      <View testID="image-compare-carousel">
        {matches.map((m) => (
          <Pressable
            key={m.qid}
            testID={`compare-card-${m.qid}`}
            onPress={() => {
              onMatchPress(m.qid);
            }}
          >
            <Text>{m.qid}</Text>
          </Pressable>
        ))}
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

const makeCompareMessage = (qids: string[]) =>
  makeAssistantMessage(
    {},
    {
      compareResults: makeCompareResult(
        qids.map((qid) => makeCompareMatch({ qid, facts: { qid, title: qid } })),
      ),
    },
  );

describe('ChatMessageBubble — C3 compare tap wiring (D-06)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards onMatchPress to the carousel so tapping a card calls the parent handler with the qid', () => {
    const onMatchPress = jest.fn();
    const message = makeCompareMessage(['Q42', 'Q99']);

    render(
      <ChatMessageBubble
        {...baseProps}
        message={message}
        isStreaming={false}
        onMatchPress={onMatchPress}
      />,
    );

    fireEvent.press(screen.getByTestId('compare-card-Q42'));

    expect(onMatchPress).toHaveBeenCalledTimes(1);
    expect(onMatchPress).toHaveBeenCalledWith('Q42');
  });

  it('forwards the correct qid when a non-first card is tapped', () => {
    const onMatchPress = jest.fn();
    const message = makeCompareMessage(['Q42', 'Q99']);

    render(
      <ChatMessageBubble
        {...baseProps}
        message={message}
        isStreaming={false}
        onMatchPress={onMatchPress}
      />,
    );

    fireEvent.press(screen.getByTestId('compare-card-Q99'));

    expect(onMatchPress).toHaveBeenCalledTimes(1);
    expect(onMatchPress).toHaveBeenCalledWith('Q99');
  });

  it('does not crash when no onMatchPress prop is provided (graceful no-op)', () => {
    const message = makeCompareMessage(['Q42']);

    render(<ChatMessageBubble {...baseProps} message={message} isStreaming={false} />);

    // The carousel still receives a callable handler; tapping must not throw.
    expect(() => {
      fireEvent.press(screen.getByTestId('compare-card-Q42'));
    }).not.toThrow();
  });
});
