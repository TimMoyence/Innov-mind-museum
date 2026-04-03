import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
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
