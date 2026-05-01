import '../helpers/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockSetHasSeenOnboarding = jest.fn();
jest.mock('@/features/settings/infrastructure/userProfileStore', () => ({
  useUserProfileStore: (selector: (s: { setHasSeenOnboarding: jest.Mock }) => unknown) =>
    selector({ setHasSeenOnboarding: mockSetHasSeenOnboarding }),
}));

const mockMarkOnboardingComplete = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => ({ markOnboardingComplete: mockMarkOnboardingComplete }),
}));

import { router as expoRouter } from 'expo-router';
const mockRouterReplace = expoRouter.replace as jest.Mock;

const mockNext = jest.fn();
const mockGoToStep = jest.fn();
const mockUseOnboarding = jest.fn();
jest.mock('@/features/onboarding/application/useOnboarding', () => ({
  useOnboarding: (...args: unknown[]) => mockUseOnboarding(...args),
}));

jest.mock('@/features/onboarding/ui/GreetingSlide', () => {
  const { View, Text } = require('react-native');
  return {
    GreetingSlide: () => (
      <View testID="slide-greeting">
        <Text>onboarding.v2.greeting.title</Text>
      </View>
    ),
  };
});

jest.mock('@/features/onboarding/ui/MuseumModeSlide', () => {
  const { View, Text } = require('react-native');
  return {
    MuseumModeSlide: () => (
      <View testID="slide-museum-mode">
        <Text>onboarding.v2.museumMode.title</Text>
      </View>
    ),
  };
});

jest.mock('@/features/onboarding/ui/CameraIntentSlide', () => {
  const { View, Text } = require('react-native');
  return {
    CameraIntentSlide: () => (
      <View testID="slide-camera-intent">
        <Text>onboarding.v2.cameraIntent.title</Text>
      </View>
    ),
  };
});

jest.mock('@/features/onboarding/ui/WalkIntentSlide', () => {
  const { View, Text } = require('react-native');
  return {
    WalkIntentSlide: () => (
      <View testID="slide-walk-intent">
        <Text>onboarding.v2.walkIntent.title</Text>
      </View>
    ),
  };
});

jest.mock('@/features/onboarding/ui/StepIndicator', () => {
  const { View, Text } = require('react-native');
  return {
    StepIndicator: ({ totalSteps, currentStep }: { totalSteps: number; currentStep: number }) => (
      <View testID="step-indicator">
        <Text>{`${String(currentStep)}/${String(totalSteps)}`}</Text>
      </View>
    ),
  };
});

import OnboardingScreen from '@/app/(stack)/onboarding';

describe('OnboardingScreen v2 (Spec B)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkOnboardingComplete.mockResolvedValue(undefined);
    mockUseOnboarding.mockReturnValue({
      currentStep: 0,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: false,
    });
  });

  it('renders Greeting slide on mount', () => {
    render(<OnboardingScreen />);
    expect(screen.getByTestId('slide-greeting')).toBeTruthy();
  });

  it('shows skip button and Next button on first slide', () => {
    render(<OnboardingScreen />);
    expect(screen.getByLabelText('a11y.onboarding.skip')).toBeTruthy();
    expect(screen.getByText('onboarding.skip')).toBeTruthy();
    expect(screen.getByLabelText('a11y.onboarding.next')).toBeTruthy();
    expect(screen.getByText('onboarding.next')).toBeTruthy();
  });

  it('renders the 4-dot step indicator', () => {
    render(<OnboardingScreen />);
    expect(screen.getByText('0/4')).toBeTruthy();
  });

  it('Next advances through 4 slides — calls next()', () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.next'));
    expect(mockNext).toHaveBeenCalled();
  });

  it('shows Get Started button label on the last slide', () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 3,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: true,
    });
    render(<OnboardingScreen />);
    expect(screen.getByLabelText('a11y.onboarding.get_started')).toBeTruthy();
    expect(screen.getByText('onboarding.get_started')).toBeTruthy();
  });

  it('Skip on slide 1 sets hasSeenOnboarding and navigates home', async () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.skip'));
    await waitFor(() => {
      expect(mockSetHasSeenOnboarding).toHaveBeenCalledWith(true);
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });

  it('Done on slide 4 sets hasSeenOnboarding and navigates home', async () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 3,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: true,
    });
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.get_started'));
    await waitFor(() => {
      expect(mockSetHasSeenOnboarding).toHaveBeenCalledWith(true);
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });
});
