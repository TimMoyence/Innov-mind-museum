import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { ImageSection } from '@/features/chat/ui/bubbleSections/ImageSection';

/**
 * C-03 (cycle 11, MEDIUM) — the image attached to a chat bubble
 * (`ImageSection.tsx:56-68`) renders an expo-image `<Image>` carrying NO
 * `accessibilityLabel` and NO `accessibilityRole` → the attachment is mute to
 * VoiceOver / TalkBack, the very audience the audio-description feature serves
 * (EN 301 549 §9.1.1.1, WCAG 2.1 SC 1.1.1 / 4.1.2).
 *
 * Target (GREEN will deliver): mirror `ImageCarousel.tsx:66-67` — add
 * `accessibilityRole="image"` + a localized `accessibilityLabel` sourced from
 * i18n (`a11y.chat.attached_image`). The shared `test-utils` i18n mock returns
 * the raw key (`t: (k) => k`), so assertions target the KEY, not a translation.
 *
 * R-4 (design §3): `@testing-library/react-native@13` does NOT map the
 * expo-image host node (`ViewManagerAdapter_ExpoImage`) to a queryable a11y
 * role — verified live: `getByRole('image')` throws on it. So we assert the
 * role via the observable `accessibilityRole` prop (project convention, e.g.
 * `AiConsentSheetContent.test.tsx:265`), and the label via the always-available
 * `getByLabelText` query (lib-docs/react/PATTERNS.md §8 — assert observable
 * state through public queries, never private internals).
 */

const defaultProps = {
  messageId: 'msg-1',
  // Local file URI → ImageSection skips the signed-URL refresh effect, keeping
  // the render side-effect-free (no fake timers needed).
  url: 'file:///tmp/photo.jpg',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  onImageError: jest.fn(),
};

describe('ImageSection a11y (C-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes a localized accessibilityLabel on the attached image (T-C03-1)', () => {
    render(<ImageSection {...defaultProps} />);

    // RED today: ImageSection's <Image> carries no accessibilityLabel, so this
    // query resolves to nothing and throws.
    expect(screen.getByLabelText('a11y.chat.attached_image')).toBeTruthy();
  });

  it('sets accessibilityRole="image" on the attached image (T-C03-2)', () => {
    render(<ImageSection {...defaultProps} />);

    const tree = screen.toJSON();
    expect(tree).not.toBeNull();
    if (tree === null || Array.isArray(tree)) {
      throw new Error('expected a single image node');
    }
    // RED today: no accessibilityRole prop on the <Image>, so this is undefined.
    expect(tree.props.accessibilityRole).toBe('image');
  });
});
