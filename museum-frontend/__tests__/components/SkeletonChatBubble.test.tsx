import React from 'react';
import { render } from '@testing-library/react-native';

// DO NOT import test-utils — it stubs SkeletonBox which SkeletonChatBubble uses
jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: { cardBorder: '#ccc', cardBackground: '#fff', inputBackground: '#e2e8f0' },
  }),
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
});
