/**
 * Regression-guard for BiometricSetupSheet backdrop-tap dismiss (audit #11).
 *
 * UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`, R11.
 *
 * PASSES on current code (audit verdict: non-blocking-and-currently-correct).
 */

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

    // The backdrop Pressable carries `accessibilityLabel={laterText}` = the
    // i18n key `auth.biometric_setup.later` under the test-utils identity
    // transform (it has a defaultValue but we never reach prod fallback in
    // the test env). Match against the i18n key. There are multiple
    // elements (Pressable backdrop + LiquidButton later button) with the
    // same label — find them all and tap the first (the backdrop) to
    // confirm the dismiss wiring.
    const candidates = view.getAllByLabelText('auth.biometric_setup.later');
    expect(candidates.length).toBeGreaterThan(0);
    const first = candidates[0];
    if (!first) throw new Error('expected at least one match');
    fireEvent.press(first);
    expect(onSkip).toHaveBeenCalled();
  });
});
