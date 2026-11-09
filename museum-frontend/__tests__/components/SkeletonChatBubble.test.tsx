import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: { cardBorder: '#ccc', cardBackground: '#fff', inputBackground: '#e2e8f0' },
  }),
}));

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

  it('exposes a localized loading accessibilityLabel (T-C04-1)', () => {
    render(<SkeletonChatBubble />);

    expect(screen.getByLabelText('a11y.chat.loading')).toBeTruthy();
  });

  it('exposes accessibilityRole="progressbar" and accessible on the root (T-C04-2)', () => {
    const { toJSON } = render(<SkeletonChatBubble />);
    const tree = toJSON();
    expect(tree).not.toBeNull();
    if (tree === null || Array.isArray(tree)) {
      throw new Error('expected a single skeleton root node');
    }
    expect(tree.props.accessibilityRole).toBe('progressbar');
    expect(tree.props.accessible).toBe(true);
  });
});
