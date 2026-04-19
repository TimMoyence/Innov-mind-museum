import '@/__tests__/helpers/test-utils';
import { act, render } from '@testing-library/react-native';

const mockUseReducedMotion = jest.fn<boolean, []>();
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

jest.mock('@/features/chat/ui/TypingIndicator', () => {
  const { View } = require('react-native');
  return {
    TypingIndicator: () => <View testID="typing-indicator" />,
  };
});

import { ChatDemoSlide } from '@/features/onboarding/ui/ChatDemoSlide';

describe('ChatDemoSlide', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders title, subtitle, and the scripted user prompt', () => {
    mockUseReducedMotion.mockReturnValue(false);
    const { getByText } = render(<ChatDemoSlide />);

    expect(getByText('onboarding.v2.slide1.title')).toBeTruthy();
    expect(getByText('onboarding.v2.slide1.subtitle')).toBeTruthy();
    expect(getByText('onboarding.v2.slide1.demo_user')).toBeTruthy();
  });

  it('shows full assistant text instantly when reduced motion is on', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { getByText, queryByTestId } = render(<ChatDemoSlide />);

    expect(getByText(/onboarding\.v2\.slide1\.demo_assistant/)).toBeTruthy();
    expect(queryByTestId('typing-indicator')).toBeNull();
  });

  it('progresses user → typing → assistant phases when motion is allowed', () => {
    mockUseReducedMotion.mockReturnValue(false);
    const { queryByTestId, queryByText } = render(<ChatDemoSlide />);

    // Initial phase: user bubble only, no typing indicator yet
    expect(queryByTestId('typing-indicator')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(queryByTestId('typing-indicator')).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(queryByTestId('typing-indicator')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(queryByText(/onboarding\.v2\.slide1\.demo_assistant/)).not.toBeNull();
  });
});
