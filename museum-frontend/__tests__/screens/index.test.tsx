import '../helpers/test-utils';
import { render } from '@testing-library/react-native';
import { View } from 'react-native';

jest.mock('@/features/auth/routes', () => ({
  AUTH_ROUTE: '/auth',
  HOME_ROUTE: '/(tabs)/home',
}));

const mockUseAuth = jest.fn();
jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Patch the expo-router mock to include Redirect (not present in test-utils)
const expoRouter = require('expo-router');
const mockRedirect = jest.fn(() => null);
expoRouter.Redirect = mockRedirect;

import IndexScreen from '@/app/index';

describe('IndexScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    expoRouter.Redirect = mockRedirect;
  });

  it('renders empty view while loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    render(<IndexScreen />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects to home when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    render(<IndexScreen />);
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/(tabs)/home' }),
      undefined,
    );
  });

  it('redirects to auth when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    render(<IndexScreen />);
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/auth' }),
      undefined,
    );
  });
});
