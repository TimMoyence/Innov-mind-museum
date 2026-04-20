import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockChangeEmail = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    changeEmail: (...args: unknown[]) => mockChangeEmail(...args),
  },
}));

import ChangeEmailScreen from '@/app/(stack)/change-email';

describe('ChangeEmailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ChangeEmailScreen />);
    expect(screen.getByText('change_email.title')).toBeTruthy();
  });

  it('renders all form fields', () => {
    render(<ChangeEmailScreen />);
    expect(screen.getByLabelText('change_email.new_email')).toBeTruthy();
    expect(screen.getByLabelText('change_email.password')).toBeTruthy();
  });

  it('renders the submit button', () => {
    render(<ChangeEmailScreen />);
    expect(screen.getByLabelText('change_email.submit')).toBeTruthy();
  });

  it('renders the back button', () => {
    render(<ChangeEmailScreen />);
    expect(screen.getByLabelText('common.back')).toBeTruthy();
  });

  it('calls changeEmail on valid submit', async () => {
    mockChangeEmail.mockResolvedValue({ message: 'ok' });
    render(<ChangeEmailScreen />);

    fireEvent.changeText(screen.getByLabelText('change_email.new_email'), 'new@test.com');
    fireEvent.changeText(screen.getByLabelText('change_email.password'), 'mypassword');
    fireEvent.press(screen.getByLabelText('change_email.submit'));

    await waitFor(() => {
      expect(mockChangeEmail).toHaveBeenCalledWith('new@test.com', 'mypassword');
    });
  });

  it('shows success message after successful submit', async () => {
    mockChangeEmail.mockResolvedValue({ message: 'ok' });
    render(<ChangeEmailScreen />);

    fireEvent.changeText(screen.getByLabelText('change_email.new_email'), 'new@test.com');
    fireEvent.changeText(screen.getByLabelText('change_email.password'), 'mypassword');
    fireEvent.press(screen.getByLabelText('change_email.submit'));

    await waitFor(() => {
      expect(screen.getByText('change_email.success')).toBeTruthy();
    });
  });

  it('shows error message on API failure', async () => {
    mockChangeEmail.mockRejectedValue(new Error('Email already taken'));
    render(<ChangeEmailScreen />);

    fireEvent.changeText(screen.getByLabelText('change_email.new_email'), 'taken@test.com');
    fireEvent.changeText(screen.getByLabelText('change_email.password'), 'mypassword');
    fireEvent.press(screen.getByLabelText('change_email.submit'));

    await waitFor(() => {
      expect(screen.getByText('Email already taken')).toBeTruthy();
    });
  });
});
