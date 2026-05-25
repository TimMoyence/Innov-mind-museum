import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeAssistantMessage } from '../helpers/factories';

/**
 * I-CMP3(5) / R8 — the assistant chat bubble pre-fix wraps its subtree in a
 * <Pressable> carrying `accessibilityRole="text"` + a STATIC
 * `accessibilityLabel={t('a11y.chat.assistant_message')}`. On a real screen
 * reader that static label collapses the subtree and REPLACES the real
 * response text — so a low-vision user hears the literal phrase
 * "assistant message" instead of the actual answer. The audio-description
 * feature is meant to serve exactly this audience, so the masking label is a
 * blocking a11y defect.
 *
 * R8 acceptance: the assistant body text stays reachable AND the assistant
 * <Pressable> no longer carries a static text-overriding accessibilityLabel,
 * while the long-press affordance keeps its hint (a11y.chat.long_press_hint).
 *
 * Design §D8: remove accessibilityRole="text" + the static accessibilityLabel
 * from the <Pressable>; keep accessibilityHint.
 */

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

    // Pre-fix the assistant <Pressable> sets
    // accessibilityLabel={t('a11y.chat.assistant_message')} → this query
    // resolves and the assertion fails. Post-fix no node carries that
    // subtree-collapsing label, so it resolves to null.
    const maskingLabel = screen.queryByLabelText('a11y.chat.assistant_message');
    expect(maskingLabel).toBeNull();
  });

  it('preserves the long-press affordance hint on the assistant bubble', () => {
    const message = makeAssistantMessage({ text: 'Rembrandt mastered self-portraiture.' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);

    // The long-press "report" affordance keeps its hint (design §D8).
    expect(screen.getByA11yHint('a11y.chat.long_press_hint')).toBeTruthy();
  });
});
