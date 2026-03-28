import { renderHook } from '@testing-library/react-native';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: jest.fn(() => ['(tabs)']),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(() => ({ isAuthenticated: false, isLoading: true, isFirstLaunch: null })),
}));

// Pull the mocked functions so we can change return values per test
import { useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

const mockedUseSegments = useSegments as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not redirect while loading', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      isFirstLaunch: false,
    });
    mockedUseSegments.mockReturnValue(['(tabs)']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect while isFirstLaunch is null', () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, isFirstLaunch: null });
    mockedUseSegments.mockReturnValue(['(tabs)']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to AUTH_ROUTE when not authenticated and not on auth screen', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isFirstLaunch: false,
    });
    mockedUseSegments.mockReturnValue(['(tabs)']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).toHaveBeenCalledWith('/auth');
  });

  it('redirects to HOME_ROUTE when authenticated and on auth screen (onboarding complete)', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isFirstLaunch: false,
    });
    mockedUseSegments.mockReturnValue(['auth']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('redirects to onboarding when authenticated, on auth screen, and first launch', () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, isFirstLaunch: true });
    mockedUseSegments.mockReturnValue(['auth']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).toHaveBeenCalledWith('/(stack)/onboarding');
  });

  it('does not redirect when authenticated and not on auth screen (onboarding complete)', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isFirstLaunch: false,
    });
    mockedUseSegments.mockReturnValue(['(tabs)']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to onboarding when authenticated, first launch, not on onboarding', () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, isFirstLaunch: true });
    mockedUseSegments.mockReturnValue(['(tabs)']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).toHaveBeenCalledWith('/(stack)/onboarding');
  });

  it('does not redirect when on onboarding screen during first launch', () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, isFirstLaunch: true });
    mockedUseSegments.mockReturnValue(['(stack)', 'onboarding']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
