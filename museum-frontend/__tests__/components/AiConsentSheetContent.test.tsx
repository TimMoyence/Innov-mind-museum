import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AiConsentSheetContent } from '@/features/chat/ui/AiConsentSheetContent';

/**
 * Sheet-content variant of the legacy `AiConsentModal` tests, retargeted for
 * the S4-P0-02 granular per-row gate. Every Switch defaults OFF (Apple 5.1.2(i)
 * + GDPR Art. 4(11) "unambiguous affirmative action") — Save stays disabled
 * until the user actively toggles the mandatory `third_party_ai_text_openai`
 * scope ON. The `<Modal>` wrapper is owned by the BottomSheetRouter, not by
 * this component.
 */
describe('AiConsentSheetContent', () => {
  const REQUIRED_TEXT_LABEL = 'consent.scope_text';

  let defaultProps: {
    close: jest.Mock;
    onAccept: jest.Mock;
    onPrivacy: jest.Mock;
  };

  beforeEach(() => {
    defaultProps = {
      close: jest.fn(),
      onAccept: jest.fn(),
      onPrivacy: jest.fn(),
    };
  });

  it('renders the consent copy', () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    expect(getByText('consent.title')).toBeTruthy();
  });

  it('defaults every per-row Switch to OFF (no pre-checked boxes — GDPR Art. 4(11))', () => {
    const { getAllByRole } = render(<AiConsentSheetContent {...defaultProps} />);
    const switches = getAllByRole('switch');
    // 4 categories × 2 providers = 8 switches.
    expect(switches.length).toBe(8);
    for (const sw of switches) {
      expect(sw.props.value).toBe(false);
    }
  });

  it('does NOT call onAccept when Save is pressed with no scopes granted', () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.save_and_continue'));
    expect(defaultProps.onAccept).not.toHaveBeenCalled();
    expect(defaultProps.close).not.toHaveBeenCalled();
  });

  it('enables Save only after the user toggles the required text→OpenAI scope ON', async () => {
    // The required row is the FIRST switch (PROVIDER_GROUPS[0].rows[0]).
    const { getAllByRole, getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    const switches = getAllByRole('switch');
    const requiredSwitch = switches[0];
    if (!requiredSwitch) throw new Error('expected required switch');
    // Sanity : the first switch's a11y label is the required-text scope.
    expect(requiredSwitch.props.accessibilityLabel).toBe(REQUIRED_TEXT_LABEL);

    fireEvent(requiredSwitch, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    expect(defaultProps.onAccept).toHaveBeenCalledWith(['third_party_ai_text_openai']);
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('forwards every toggled-on scope on Save (per-category × per-provider granularity)', async () => {
    const { getAllByRole, getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    const switches = getAllByRole('switch');
    // Toggle required text-openai (idx 0) + image-openai (idx 1) + audio-google (idx 6).
    const [textOpenai, imageOpenai, , , , , audioGoogle] = switches;
    if (!textOpenai || !imageOpenai || !audioGoogle) throw new Error('expected 8 switches');
    fireEvent(textOpenai, 'valueChange', true);
    fireEvent(imageOpenai, 'valueChange', true);
    fireEvent(audioGoogle, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    expect(defaultProps.onAccept).toHaveBeenCalledWith([
      'third_party_ai_text_openai',
      'third_party_ai_image_openai',
      'third_party_ai_audio_google',
    ]);
  });

  it('calls onPrivacy when privacy link is pressed', () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.read_privacy'));
    expect(defaultProps.onPrivacy).toHaveBeenCalledTimes(1);
  });
});
