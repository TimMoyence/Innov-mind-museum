import '../helpers/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockMarkOnboardingComplete = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => ({ markOnboardingComplete: mockMarkOnboardingComplete }),
}));

const mockStartConversation = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/chat/application/useStartConversation', () => ({
  useStartConversation: () => ({
    isCreating: false,
    error: null,
    setError: jest.fn(),
    startConversation: mockStartConversation,
  }),
}));

import { router as expoRouter } from 'expo-router';
const mockRouterReplace = expoRouter.replace as jest.Mock;

const mockNext = jest.fn();
const mockGoToStep = jest.fn();
const mockUseOnboarding = jest.fn();
jest.mock('@/features/onboarding/application/useOnboarding', () => ({
  useOnboarding: (...args: any[]) => mockUseOnboarding(...args),
}));

jest.mock('@/features/onboarding/ui/ChatDemoSlide', () => {
  const { View, Text } = require('react-native');
  return {
    ChatDemoSlide: () => (
      <View testID="slide-demo">
        <Text>demo-slide</Text>
      </View>
    ),
  };
});

jest.mock('@/features/onboarding/ui/ValuePropSlide', () => {
  const { View, Text } = require('react-native');
  return {
    ValuePropSlide: () => (
      <View testID="slide-value">
        <Text>value-slide</Text>
      </View>
    ),
  };
});

jest.mock('@/features/onboarding/ui/FirstPromptChipsSlide', () => {
  const { View, Pressable, Text } = require('react-native');
  return {
    ONBOARDING_CHIPS: [],
    FirstPromptChipsSlide: ({ onChipPress, onSkip, disabled }: any) => (
      <View testID="slide-chips">
        <Pressable
          testID="mock-chip"
          onPress={() => onChipPress({ id: 'museum', prompt: 'near-prompt' })}
          disabled={disabled}
        >
          <Text>mock-chip</Text>
        </Pressable>
        <Pressable testID="mock-explore" onPress={onSkip} disabled={disabled}>
          <Text>mock-explore</Text>
        </Pressable>
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

describe('OnboardingScreen (v2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOnboarding.mockReturnValue({
      currentStep: 0,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: false,
    });
  });

  it('renders the chat-demo slide first', () => {
    render(<OnboardingScreen />);
    expect(screen.getByTestId('slide-demo')).toBeTruthy();
  });

  it('shows the skip button in the header', () => {
    render(<OnboardingScreen />);
    expect(screen.getByLabelText('a11y.onboarding.skip')).toBeTruthy();
    expect(screen.getByText('onboarding.skip')).toBeTruthy();
  });

  it('renders the 3-dot step indicator', () => {
    render(<OnboardingScreen />);
    expect(screen.getByText('0/3')).toBeTruthy();
  });

  it('shows Next button on slides 0 and 1', () => {
    render(<OnboardingScreen />);
    expect(screen.getByLabelText('a11y.onboarding.next')).toBeTruthy();
    expect(screen.getByText('onboarding.next')).toBeTruthy();
  });

  it('hides Next button on the final (chips) slide', () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 2,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: true,
    });
    render(<OnboardingScreen />);
    expect(screen.queryByLabelText('a11y.onboarding.next')).toBeNull();
  });

  it('advances to next slide when Next is pressed', () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.next'));
    expect(mockNext).toHaveBeenCalled();
  });

  it('marks onboarding complete and routes home when skip is pressed', async () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText('a11y.onboarding.skip'));
    await waitFor(() => {
      expect(mockMarkOnboardingComplete).toHaveBeenCalledTimes(1);
    });
    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('marks complete + starts a conversation with initialPrompt when a chip is tapped', async () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 2,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: true,
    });
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId('mock-chip'));

    await waitFor(() => {
      expect(mockMarkOnboardingComplete).toHaveBeenCalledTimes(1);
    });
    expect(mockStartConversation).toHaveBeenCalledWith({ initialPrompt: 'near-prompt' });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('marks complete + routes home when Explore is tapped', async () => {
    mockUseOnboarding.mockReturnValue({
      currentStep: 2,
      goToStep: mockGoToStep,
      next: mockNext,
      isLast: true,
    });
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId('mock-explore'));

    await waitFor(() => {
      expect(mockMarkOnboardingComplete).toHaveBeenCalledTimes(1);
    });
    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)/home');
    expect(mockStartConversation).not.toHaveBeenCalled();
  });
});
