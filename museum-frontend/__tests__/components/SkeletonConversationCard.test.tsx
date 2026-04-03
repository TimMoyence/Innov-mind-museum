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
  it('renders without crashing', () => {
    const { toJSON } = render(<SkeletonConversationCard />);
    expect(toJSON()).toBeTruthy();
  });
});
