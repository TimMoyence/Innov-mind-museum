import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { ExpertiseBadge } from '@/features/chat/ui/ExpertiseBadge';

describe('ExpertiseBadge', () => {
  it('renders beginner level', () => {
    const { getByText } = render(<ExpertiseBadge level="beginner" />);
    expect(getByText('expertiseBadge.beginner')).toBeTruthy();
  });

  it('renders intermediate level', () => {
    const { getByText } = render(<ExpertiseBadge level="intermediate" />);
    expect(getByText('expertiseBadge.intermediate')).toBeTruthy();
  });

  it('renders expert level', () => {
    const { getByText } = render(<ExpertiseBadge level="expert" />);
    expect(getByText('expertiseBadge.expert')).toBeTruthy();
  });
});
