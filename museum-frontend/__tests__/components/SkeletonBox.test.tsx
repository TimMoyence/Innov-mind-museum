import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { SkeletonBox } from '@/shared/ui/SkeletonBox';

describe('SkeletonBox', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<SkeletonBox width={100} height={20} />);

    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom borderRadius', () => {
    const { toJSON } = render(<SkeletonBox width={200} height={30} borderRadius={16} />);

    expect(toJSON()).toBeTruthy();
  });

  it('renders with percentage width', () => {
    const { toJSON } = render(<SkeletonBox width="100%" height={40} />);

    expect(toJSON()).toBeTruthy();
  });
});
