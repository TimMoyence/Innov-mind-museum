import '@/__tests__/helpers/test-utils';
import { render } from '@testing-library/react-native';

const mockUseReducedMotion = jest.fn<boolean, []>();
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

import { ValuePropSlide } from '@/features/onboarding/ui/ValuePropSlide';

describe('ValuePropSlide', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReset();
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('renders title, subtitle, and the three pillar labels', () => {
    const { getByText } = render(<ValuePropSlide />);

    expect(getByText('onboarding.v2.slide2.title')).toBeTruthy();
    expect(getByText('onboarding.v2.slide2.subtitle')).toBeTruthy();
    expect(getByText('onboarding.v2.slide2.pillar_photo')).toBeTruthy();
    expect(getByText('onboarding.v2.slide2.pillar_voice')).toBeTruthy();
    expect(getByText('onboarding.v2.slide2.pillar_guide')).toBeTruthy();
  });

  it('exposes accessibility labels for each pillar', () => {
    const { getByLabelText } = render(<ValuePropSlide />);

    expect(getByLabelText('onboarding.v2.slide2.pillar_photo_a11y')).toBeTruthy();
    expect(getByLabelText('onboarding.v2.slide2.pillar_voice_a11y')).toBeTruthy();
    expect(getByLabelText('onboarding.v2.slide2.pillar_guide_a11y')).toBeTruthy();
  });

  it('still renders all pillars when reduced motion is enabled', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { getByText } = render(<ValuePropSlide />);

    expect(getByText('onboarding.v2.slide2.pillar_photo')).toBeTruthy();
    expect(getByText('onboarding.v2.slide2.pillar_voice')).toBeTruthy();
    expect(getByText('onboarding.v2.slide2.pillar_guide')).toBeTruthy();
  });
});
