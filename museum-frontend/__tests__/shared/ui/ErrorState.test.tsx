import { render, fireEvent, screen } from '@testing-library/react-native';
import { ErrorState } from '@/shared/ui/ErrorState';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));

describe('ErrorState', () => {
  it('renders title and description', () => {
    render(<ErrorState title="Network error" description="Check your connection." />);
    expect(screen.getByText('Network error')).toBeTruthy();
    expect(screen.getByText('Check your connection.')).toBeTruthy();
  });

  it('omits description when not provided', () => {
    render(<ErrorState title="Failed" />);
    expect(screen.queryByText('Check your connection.')).toBeNull();
  });

  it('renders retry button and fires onRetry', async () => {
    const onRetry = jest.fn();
    render(<ErrorState title="Failed" onRetry={onRetry} retryLabel="Try again" testID="err" />);
    expect(screen.getByText('Try again')).toBeTruthy();
    fireEvent.press(screen.getByTestId('err-retry'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders dismiss button and fires onDismiss', async () => {
    const onDismiss = jest.fn();
    render(<ErrorState title="Failed" onDismiss={onDismiss} testID="err" />);
    fireEvent.press(screen.getByTestId('err-dismiss'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders no actions when neither onRetry nor onDismiss provided', () => {
    render(<ErrorState title="Failed" testID="err" />);
    expect(screen.queryByTestId('err-retry')).toBeNull();
    expect(screen.queryByTestId('err-dismiss')).toBeNull();
  });

  it('applies fullscreen variant container', () => {
    render(<ErrorState title="Failed" variant="fullscreen" testID="err" />);
    const container = screen.getByTestId('err');
    expect(container.props.accessibilityRole).toBe('alert');
    // Style assertion: fullscreen has flex 1
    const flat = Array.isArray(container.props.style)
      ? Object.assign({}, ...container.props.style.flat())
      : container.props.style;
    expect(flat.flex).toBe(1);
  });
});
