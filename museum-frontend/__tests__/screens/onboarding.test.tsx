import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockMarkOnboardingComplete = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => ({ markOnboardingComplete: mockMarkOnboardingComplete }),
}));

const mockNext = jest.fn();
const mockGoToStep = jest.fn();
const mockUseOnboarding = jest.fn();
jest.mock('@/features/onboarding/application/useOnboarding', () => ({
  useOnboarding: (...args: any[]) => mockUseOnboarding(...args),
}));

jest.mock('@/features/onboarding/ui/OnboardingSlide', () => {
  const { View, Text } = require('react-native');
  return {
    OnboardingSlide: ({ slide }: any) => (
      <View testID="onboarding-slide">
        <Text>{slide.title}</Text>
      </View>
    ),
  };
});

jest.mock('@/features/onboarding/ui/StepIndicator', () => {
  const { View, Text } = require('react-native');
  return {
    StepIndicator: ({ totalSteps, currentStep }: any) => (
      <View testID="step-indicator">
        <Text>{`${String(currentStep)}/${String(totalSteps)}`}</Text>
      </View>
    ),
  };
});

import OnboardingScreen from '@/app/(stack)/onboarding';

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOnboarding.mockReturnValue({
      currentStep: 0,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: false,
    });
  });

  it('renders first slide', () => {
    render(<OnboardingScreen />);
    expect(screen.getByText('onboarding.slide0.title')).toBeTruthy();
  });

  it('renders skip button', () => {
    render(<OnboardingScreen />);
    expect(screen.getByLabelText('a11y.onboarding.skip')).toBeTruthy();
    expect(screen.getByText('onboarding.skip')).toBeTruthy();
  });

  it('renders step indicator with correct total', () => {
    render(<OnboardingScreen />);
    expect(screen.getByTestId('step-indicator')).toBeTruthy();
    expect(screen.getByText('0/3')).toBeTruthy();
  });

  it('renders next button when not on last slide', () => {
    render(<OnboardingScreen />);
    expect(screen.getByLabelText('a11y.onboarding.next')).toBeTruthy();
    expect(screen.getByText('onboarding.next')).toBeTruthy();
  });

  it('renders get started button on last slide', () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 2,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: true,
    });
    render(<OnboardingScreen />);
    expect(screen.getByLabelText('a11y.onboarding.get_started')).toBeTruthy();
    expect(screen.getByText('onboarding.get_started')).toBeTruthy();
  });

  it('calls next when next button is pressed', () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.next'));
    expect(mockNext).toHaveBeenCalled();
  });

  it('calls markOnboardingComplete when skip is pressed', () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.skip'));
    expect(mockMarkOnboardingComplete).toHaveBeenCalled();
  });
});
