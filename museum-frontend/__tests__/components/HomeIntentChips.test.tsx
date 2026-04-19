import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { HomeIntentChips } from '@/features/home/ui/HomeIntentChips';

describe('HomeIntentChips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all three intent chips with their testIDs', () => {
    render(<HomeIntentChips onPress={jest.fn()} />);

    expect(screen.getByTestId('home-intent-chips')).toBeTruthy();
    expect(screen.getByTestId('home-intent-chip-vocal')).toBeTruthy();
    expect(screen.getByTestId('home-intent-chip-camera')).toBeTruthy();
    expect(screen.getByTestId('home-intent-chip-walk')).toBeTruthy();
  });

  it.each([
    ['home-intent-chip-vocal', 'vocal'],
    ['home-intent-chip-camera', 'camera'],
    ['home-intent-chip-walk', 'walk'],
  ] as const)('dispatches %s intent when pressed', (testID, expected) => {
    const onPress = jest.fn();
    render(<HomeIntentChips onPress={onPress} />);

    fireEvent.press(screen.getByTestId(testID));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(expected);
  });

  it('does not dispatch when disabled', () => {
    const onPress = jest.fn();
    render(<HomeIntentChips onPress={onPress} disabled />);

    fireEvent.press(screen.getByTestId('home-intent-chip-vocal'));

    expect(onPress).not.toHaveBeenCalled();
  });
});
