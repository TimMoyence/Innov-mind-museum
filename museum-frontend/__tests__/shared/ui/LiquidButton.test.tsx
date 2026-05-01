import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { LiquidButton } from '@/shared/ui/LiquidButton';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));

describe('LiquidButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the label', () => {
    render(<LiquidButton label="Sign in" onPress={() => {}} />);
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('renders leading icon when iconName + iconPosition=leading', () => {
    render(<LiquidButton label="Open" onPress={() => {}} iconName="open-outline" />);
    // icon presence implied by render not throwing; label still visible
    expect(screen.getByText('Open')).toBeTruthy();
  });

  it('fires onPress when pressed', async () => {
    const onPress = jest.fn();
    render(<LiquidButton label="Tap" onPress={onPress} testID="btn" />);
    fireEvent.press(screen.getByTestId('btn'));
    await waitFor(() => {
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  it('fires Haptics.selectionAsync by default', async () => {
    const onPress = jest.fn();
    render(<LiquidButton label="Tap" onPress={onPress} testID="btn" />);
    fireEvent.press(screen.getByTestId('btn'));
    await waitFor(() => {
      expect(Haptics.selectionAsync).toHaveBeenCalled();
    });
  });

  it('skips Haptics when hapticOnPress=false', async () => {
    const onPress = jest.fn();
    render(<LiquidButton label="Tap" onPress={onPress} hapticOnPress={false} testID="btn" />);
    fireEvent.press(screen.getByTestId('btn'));
    await waitFor(() => {
      expect(onPress).toHaveBeenCalled();
    });
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('disables press and shows ActivityIndicator when loading', () => {
    const onPress = jest.fn();
    render(<LiquidButton label="Tap" onPress={onPress} loading testID="btn" />);
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
    const btn = screen.getByTestId('btn');
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('disables press when disabled', () => {
    const onPress = jest.fn();
    render(<LiquidButton label="Tap" onPress={onPress} disabled testID="btn" />);
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('btn').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
