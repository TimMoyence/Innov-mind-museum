import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { StepIndicator } from '@/features/onboarding/ui/StepIndicator';

describe('StepIndicator', () => {
  it('renders the correct number of dots', () => {
    const { toJSON } = render(<StepIndicator totalSteps={3} currentStep={0} />);

    const tree = toJSON();
    expect(tree).toBeTruthy();
    // The container has 3 child dots
    if (tree && 'children' in tree && tree.children) {
      expect(tree.children).toHaveLength(3);
    }
  });

  it('renders with step 0 active', () => {
    const { toJSON } = render(<StepIndicator totalSteps={3} currentStep={0} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with last step active', () => {
    const { toJSON } = render(<StepIndicator totalSteps={3} currentStep={2} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders single step', () => {
    const { toJSON } = render(<StepIndicator totalSteps={1} currentStep={0} />);

    const tree = toJSON();
    if (tree && 'children' in tree && tree.children) {
      expect(tree.children).toHaveLength(1);
    }
  });
});
