import '../../../helpers/test-utils';
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';

import { BiometricSetupSheet } from '@/features/auth/ui/BiometricSetupSheet';

describe('BiometricSetupSheet — backdrop tap dismisses (audit #11, R11)', () => {
  it('calls onSkip when the backdrop Pressable is pressed', () => {
    const onSkip = jest.fn();
    const view = render(
      <BiometricSetupSheet
        visible
        biometricLabel="Face ID"
        onActivate={jest.fn().mockResolvedValue(undefined)}
        onSkip={onSkip}
      />,
    );

    const candidates = view.getAllByLabelText('auth.biometric_setup.later');
    expect(candidates.length).toBeGreaterThan(0);
    const first = candidates[0];
    if (!first) throw new Error('expected at least one match');
    fireEvent.press(first);
    expect(onSkip).toHaveBeenCalled();
  });
});
