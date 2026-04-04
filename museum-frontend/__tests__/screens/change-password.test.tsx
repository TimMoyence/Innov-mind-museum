import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockChangePassword = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    changePassword: (...args: unknown[]) => mockChangePassword(...args),
  },
}));

import ChangePasswordScreen from '@/app/(stack)/change-password';

describe('ChangePasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ChangePasswordScreen />);
    expect(screen.getByText('change_password.title')).toBeTruthy();
  });

  it('renders all form fields', () => {
    render(<ChangePasswordScreen />);
    expect(screen.getByLabelText('change_password.current')).toBeTruthy();
    expect(screen.getByLabelText('change_password.new')).toBeTruthy();
    expect(screen.getByLabelText('change_password.confirm')).toBeTruthy();
  });

  it('renders the submit button', () => {
    render(<ChangePasswordScreen />);
    expect(screen.getByLabelText('change_password.submit')).toBeTruthy();
  });

  it('renders the back button', () => {
    render(<ChangePasswordScreen />);
    expect(screen.getByLabelText('common.back')).toBeTruthy();
  });

  it('shows validation error for short password', async () => {
    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByLabelText('change_password.current'), 'oldpass123');
    fireEvent.changeText(screen.getByLabelText('change_password.new'), 'short');
    fireEvent.changeText(screen.getByLabelText('change_password.confirm'), 'short');
    fireEvent.press(screen.getByLabelText('change_password.submit'));

    await waitFor(() => {
      expect(screen.getByText('change_password.error_short')).toBeTruthy();
    });
  });

  it('shows mismatch error when passwords do not match', async () => {
    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByLabelText('change_password.current'), 'oldpass123');
    fireEvent.changeText(screen.getByLabelText('change_password.new'), 'newpassword1');
    fireEvent.changeText(screen.getByLabelText('change_password.confirm'), 'newpassword2');
    fireEvent.press(screen.getByLabelText('change_password.submit'));

    await waitFor(() => {
      expect(screen.getByText('change_password.error_mismatch')).toBeTruthy();
    });
  });

  it('calls changePassword on valid submit', async () => {
    mockChangePassword.mockResolvedValue(undefined);
    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByLabelText('change_password.current'), 'oldpass123');
    fireEvent.changeText(screen.getByLabelText('change_password.new'), 'newpass123');
    fireEvent.changeText(screen.getByLabelText('change_password.confirm'), 'newpass123');
    fireEvent.press(screen.getByLabelText('change_password.submit'));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith('oldpass123', 'newpass123');
    });
  });
});
