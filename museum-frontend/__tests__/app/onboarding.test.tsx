/**
 * OnboardingScreen v2 Spec B — integration tests for the 4-step carousel.
 *
 * Covers:
 * 1. Greeting slide rendered on mount
 * 2. Next advances through all 4 slides
 * 3. Skip on slide 1 → setHasSeenOnboarding(true) + router.replace home
 * 4. Done on slide 4 → setHasSeenOnboarding(true) + router.replace home
 */

import '../helpers/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

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

// Stub each slide so FlatList renderItem can work without native layout.
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingScreen v2', () => {
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
    expect(screen.getByText('onboarding.v2.greeting.title')).toBeTruthy();
  });

  it('Next advances through 4 slides', () => {
    // Slide 0 → press Next → next() called
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.next'));
    expect(mockNext).toHaveBeenCalledTimes(1);

    // FlatList renders all slides; verify subsequent slide stubs are in tree
    expect(screen.getByTestId('slide-museum-mode')).toBeTruthy();
    expect(screen.getByTestId('slide-camera-intent')).toBeTruthy();
    expect(screen.getByTestId('slide-walk-intent')).toBeTruthy();
  });

  it('Skip on slide 1 sets hasSeenOnboarding and navigates home', async () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.skip'));
    await waitFor(() => {
      expect(mockMarkOnboardingComplete).toHaveBeenCalledTimes(1);
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
      expect(mockMarkOnboardingComplete).toHaveBeenCalledTimes(1);
      expect(mockSetHasSeenOnboarding).toHaveBeenCalledWith(true);
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });

  it('still navigates home when markOnboardingComplete throws (graceful degradation)', async () => {
    mockMarkOnboardingComplete.mockRejectedValueOnce(new Error('network'));
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.skip'));
    await waitFor(() => {
      expect(mockSetHasSeenOnboarding).toHaveBeenCalledWith(true);
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });
});
