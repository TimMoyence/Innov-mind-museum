import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { WelcomeCard } from '@/features/chat/ui/WelcomeCard';

describe('WelcomeCard', () => {
  const defaultProps = {
    museumMode: false,
    onSuggestion: jest.fn(),
    onCamera: jest.fn(),
    disabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and subtitle text', () => {
    render(<WelcomeCard {...defaultProps} />);

    expect(screen.getByText('welcome.title')).toBeTruthy();
    expect(screen.getByText('welcome.subtitle')).toBeTruthy();
  });

  it('shows museum-specific suggestion icons in museum mode', () => {
    render(<WelcomeCard {...defaultProps} museumMode />);

    // Museum mode shows camera, history, and compass icons
    expect(screen.getByText('camera-outline')).toBeTruthy();
    expect(screen.getByText('time-outline')).toBeTruthy();
    expect(screen.getByText('compass-outline')).toBeTruthy();
  });

  it('shows standard suggestion icons outside museum mode', () => {
    render(<WelcomeCard {...defaultProps} museumMode={false} />);

    expect(screen.getByText('camera-outline')).toBeTruthy();
    expect(screen.getByText('color-palette-outline')).toBeTruthy();
    expect(screen.getByText('help-circle-outline')).toBeTruthy();
  });

  it('calls onCamera when camera suggestion is pressed', () => {
    render(<WelcomeCard {...defaultProps} museumMode />);

    // The camera button has accessibilityLabel matching the suggestion text
    const cameraButton = screen.getByLabelText('welcome.suggestions.museum_camera');
    fireEvent.press(cameraButton);

    expect(defaultProps.onCamera).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuggestion).not.toHaveBeenCalled();
  });

  it('calls onSuggestion with text when a text suggestion is pressed', () => {
    render(<WelcomeCard {...defaultProps} museumMode />);

    // Press the history suggestion (non-camera)
    const historyButton = screen.getByLabelText('welcome.suggestions.museum_history');
    fireEvent.press(historyButton);

    expect(defaultProps.onSuggestion).toHaveBeenCalledWith('welcome.suggestions.museum_history');
    expect(defaultProps.onCamera).not.toHaveBeenCalled();
  });

  it('does not trigger callbacks when disabled', () => {
    render(<WelcomeCard {...defaultProps} museumMode disabled />);

    const cameraButton = screen.getByLabelText('welcome.suggestions.museum_camera');
    fireEvent.press(cameraButton);

    const historyButton = screen.getByLabelText('welcome.suggestions.museum_history');
    fireEvent.press(historyButton);

    expect(defaultProps.onCamera).not.toHaveBeenCalled();
    expect(defaultProps.onSuggestion).not.toHaveBeenCalled();
  });
});
