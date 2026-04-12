import React from 'react';
import { render } from '@testing-library/react-native';

// DO NOT import test-utils — need to test the actual component
jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: { cardBorder: '#ccc', cardBackground: '#fff', inputBackground: '#e2e8f0' },
  }),
}));

import { SkeletonConversationCard } from '@/shared/ui/SkeletonConversationCard';

describe('SkeletonConversationCard', () => {
  it('renders card with avatar circle, two text lines, and a meta line', () => {
    const { toJSON } = render(<SkeletonConversationCard />);
    const tree = toJSON();
    expect(tree).not.toBeNull();
    if (tree === null || Array.isArray(tree)) return;
    expect(tree.children).toHaveLength(2);
    const row = (tree.children ?? [])[0] as { children: unknown[] };
    expect(row.children).toHaveLength(2);
  });
});
