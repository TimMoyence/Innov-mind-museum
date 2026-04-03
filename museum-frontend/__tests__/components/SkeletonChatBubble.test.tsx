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
  it('renders with default alignSelf (flex-start)', () => {
    const { toJSON } = render(<SkeletonChatBubble />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with flex-end alignment', () => {
    const { toJSON } = render(<SkeletonChatBubble alignSelf="flex-end" />);
    expect(toJSON()).toBeTruthy();
  });
});
