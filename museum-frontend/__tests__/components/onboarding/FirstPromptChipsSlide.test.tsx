import '@/__tests__/helpers/test-utils';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const mockUseReducedMotion = jest.fn<boolean, []>();
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

import {
  FirstPromptChipsSlide,
  ONBOARDING_CHIPS,
} from '@/features/onboarding/ui/FirstPromptChipsSlide';

describe('FirstPromptChipsSlide', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReset();
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('renders three chips with labels and prompts', () => {
    const { getByText } = render(
      <FirstPromptChipsSlide onChipPress={jest.fn()} onSkip={jest.fn()} />,
    );

    for (const chip of ONBOARDING_CHIPS) {
      expect(getByText(chip.labelKey)).toBeTruthy();
      expect(getByText(chip.promptKey)).toBeTruthy();
    }
  });

  it('calls onChipPress with the chip id and resolved prompt when a chip is tapped', () => {
    const onChipPress = jest.fn();
    const { getByTestId } = render(
      <FirstPromptChipsSlide onChipPress={onChipPress} onSkip={jest.fn()} />,
    );

    fireEvent.press(getByTestId('onboarding-chip-masterpiece'));

    expect(onChipPress).toHaveBeenCalledTimes(1);
    expect(onChipPress).toHaveBeenCalledWith({
      id: 'masterpiece',
      prompt: 'onboarding.v2.slide3.chip_masterpiece_prompt',
    });
  });

  it('calls onSkip when the explore-alone CTA is tapped', () => {
    const onSkip = jest.fn();
    const { getByLabelText } = render(
      <FirstPromptChipsSlide onChipPress={jest.fn()} onSkip={onSkip} />,
    );

    fireEvent.press(getByLabelText('onboarding.v2.slide3.skip_cta_a11y'));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('ignores taps when disabled', () => {
    const onChipPress = jest.fn();
    const onSkip = jest.fn();
    const { getByTestId, getByLabelText } = render(
      <FirstPromptChipsSlide onChipPress={onChipPress} onSkip={onSkip} disabled />,
    );

    fireEvent.press(getByTestId('onboarding-chip-museum'));
    fireEvent.press(getByLabelText('onboarding.v2.slide3.skip_cta_a11y'));

    expect(onChipPress).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('still renders all chips when reduced motion is enabled', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { getByTestId } = render(
      <FirstPromptChipsSlide onChipPress={jest.fn()} onSkip={jest.fn()} />,
    );

    expect(getByTestId('onboarding-chip-museum')).toBeTruthy();
    expect(getByTestId('onboarding-chip-masterpiece')).toBeTruthy();
    expect(getByTestId('onboarding-chip-tour')).toBeTruthy();
  });
});
