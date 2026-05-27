import React from 'react';
import { render, screen } from '@testing-library/react-native';

// DO NOT import test-utils — it stubs SkeletonBox which SkeletonChatBubble uses
jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: { cardBorder: '#ccc', cardBackground: '#fff', inputBackground: '#e2e8f0' },
  }),
}));

// R-1 (cycle 11 / design §3) — this file does NOT consume `test-utils`, so
// `react-i18next` is otherwise unmocked. C-04's GREEN adds `useTranslation` to
// SkeletonChatBubble; without this local mock the two pre-existing tests below
// would crash with `useTranslation is not a function`. The mock mirrors
// `test-utils.tsx:12-18` (`t: (k) => k`) so a11y assertions target the raw KEY.
// FROZEN-TEST: this mock is laid down by RED; GREEN must not touch this file.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { SkeletonChatBubble } from '@/shared/ui/SkeletonChatBubble';

describe('SkeletonChatBubble', () => {
  it('renders three skeleton lines with default flex-start alignment', () => {
    const { toJSON } = render(<SkeletonChatBubble />);
    const tree = toJSON();
    expect(tree).not.toBeNull();
    if (tree === null || Array.isArray(tree)) return;
    expect(tree.children).toHaveLength(3);
    const flatStyle = Array.isArray(tree.props.style)
      ? Object.assign({}, ...tree.props.style)
      : tree.props.style;
    expect(flatStyle.alignSelf).toBe('flex-start');
  });

  it('renders with flex-end alignment', () => {
    const { toJSON } = render(<SkeletonChatBubble alignSelf="flex-end" />);
    const tree = toJSON();
    expect(tree).not.toBeNull();
    if (tree === null || Array.isArray(tree)) return;
    const flatStyle = Array.isArray(tree.props.style)
      ? Object.assign({}, ...tree.props.style)
      : tree.props.style;
    expect(flatStyle.alignSelf).toBe('flex-end');
  });

  // ── C-04 (cycle 11, LOW) — loading announcement for screen readers ──────────
  //
  // Today the root <View> carries no a11y attributes, so a low-vision user
  // never hears that a reply is loading (WCAG 2.1 SC 4.1.3 Status Messages).
  // GREEN mirrors `ImageCarouselSkeleton.tsx:79-81`:
  // `accessibilityRole="progressbar"` + `accessible` + a localized
  // `accessibilityLabel` (i18n key `a11y.chat.loading`). The i18n mock above
  // returns the raw key, so we assert the KEY.

  it('exposes a localized loading accessibilityLabel (T-C04-1)', () => {
    render(<SkeletonChatBubble />);

    // RED today: no accessibilityLabel on the skeleton → query throws.
    expect(screen.getByLabelText('a11y.chat.loading')).toBeTruthy();
  });

  it('exposes accessibilityRole="progressbar" and accessible on the root (T-C04-2)', () => {
    const { toJSON } = render(<SkeletonChatBubble />);
    const tree = toJSON();
    expect(tree).not.toBeNull();
    if (tree === null || Array.isArray(tree)) {
      throw new Error('expected a single skeleton root node');
    }
    // RED today: both props are undefined on the root <View>.
    expect(tree.props.accessibilityRole).toBe('progressbar');
    expect(tree.props.accessible).toBe(true);
  });
});
