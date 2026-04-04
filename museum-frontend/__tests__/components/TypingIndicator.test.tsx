import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { TypingIndicator } from '@/features/chat/ui/TypingIndicator';

describe('TypingIndicator', () => {
  it('renders 3 dots', () => {
    const tree = render(<TypingIndicator />).toJSON();
    if (tree && 'children' in tree && tree.children) {
      expect(tree.children).toHaveLength(3);
    }
  });
});
