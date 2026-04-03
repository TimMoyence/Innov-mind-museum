import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { SkeletonConversationCard } from '@/shared/ui/SkeletonConversationCard';

describe('SkeletonConversationCard', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<SkeletonConversationCard />);
    expect(toJSON()).toBeTruthy();
  });
});
