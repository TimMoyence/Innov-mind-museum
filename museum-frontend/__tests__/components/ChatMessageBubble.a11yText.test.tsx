import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeAssistantMessage, makeChatUiMessage } from '../helpers/factories';

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

  // ── C-05 (cycle 11, LOW) ────────────────────────────────────────────────────

  // T-C05-1 — REGRESSION GUARD (not a failing RED). Spec §8 D-4: in RTL-Jest the
  // user `message.text` is already reachable under the container that carries
  // `accessibilityLabel={t('a11y.chat.user_message')}` — `getByText` resolves
  // today (proven by `ChatMessageBubble.test.tsx:53-57`). RTL-Jest does not
  // reproduce the native iOS/Android subtree collapse, so no real-bug RED can be
  // built here. This test LOCKS the EARS-C05-1 invariant: it stays green now and
  // would fail if a future change masked the user text. Default decision: NO
  // user-bubble code change (D-4).
  it('keeps the real user message text reachable in the a11y tree (T-C05-1, guard)', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Bonjour le musée' });
    render(<ChatMessageBubble {...defaultProps} message={message} />);

    expect(screen.getByText('Bonjour le musée')).toBeTruthy();
  });

  // T-C05-2 — assistant bubble with text + attached image: both the body text
  // AND the attached image's a11y label must be reachable. The attached image
  // is rendered through the real `ImageSection` (NOT mocked in this file), so
  // once C-03 lands the `a11y.chat.attached_image` label appears. RED today:
  // ImageSection carries no label → `getByLabelText` throws. A `file://` URL is
  // used so ImageSection skips its signed-URL refresh effect.
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
