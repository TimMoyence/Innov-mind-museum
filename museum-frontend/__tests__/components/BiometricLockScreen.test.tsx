import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { BiometricLockScreen } from '@/features/auth/ui/BiometricLockScreen';

describe('BiometricLockScreen', () => {
  const mockOnUnlock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders lock title and subtitle', () => {
    render(<BiometricLockScreen biometricLabel="Face ID" onUnlock={mockOnUnlock} />);
    expect(screen.getByText('biometric.lock_title')).toBeTruthy();
    expect(screen.getByText('biometric.lock_subtitle')).toBeTruthy();
  });

  it('shows unlock button with biometric label when not failed', () => {
    render(<BiometricLockScreen biometricLabel="Face ID" onUnlock={mockOnUnlock} />);
    expect(screen.getByText('biometric.unlock Face ID')).toBeTruthy();
  });

  it('shows retry text when failed is true', () => {
    render(<BiometricLockScreen biometricLabel="Face ID" onUnlock={mockOnUnlock} failed={true} />);
    expect(screen.getByText('biometric.retry')).toBeTruthy();
    expect(screen.getByText('biometric.failed')).toBeTruthy();
  });

  it('does not show failed text when failed is false', () => {
    render(<BiometricLockScreen biometricLabel="Face ID" onUnlock={mockOnUnlock} />);
    expect(screen.queryByText('biometric.failed')).toBeNull();
  });

  it('calls onUnlock when button is pressed', () => {
    render(<BiometricLockScreen biometricLabel="Face ID" onUnlock={mockOnUnlock} />);
    fireEvent.press(screen.getByLabelText('biometric.unlock'));
    expect(mockOnUnlock).toHaveBeenCalledTimes(1);
  });
});
