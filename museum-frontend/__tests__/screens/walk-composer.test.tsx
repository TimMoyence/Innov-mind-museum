import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import WalkComposerScreen from '@/app/(stack)/walk-composer';

const { router } = jest.requireMock<{ router: { back: jest.Mock; push: jest.Mock } }>(
  'expo-router',
);

describe('WalkComposerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the placeholder title and coming-soon badge', () => {
    render(<WalkComposerScreen />);

    expect(screen.getByTestId('walk-composer-title')).toBeTruthy();
    expect(screen.getByText('walkComposer.title')).toBeTruthy();
    expect(screen.getByText('walkComposer.coming_soon')).toBeTruthy();
  });

  it('navigates back when the back button is pressed', () => {
    render(<WalkComposerScreen />);

    fireEvent.press(screen.getByTestId('walk-composer-back'));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
