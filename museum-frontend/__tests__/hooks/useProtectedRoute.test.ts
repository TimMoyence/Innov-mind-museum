import { renderHook } from '@testing-library/react-native';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: jest.fn(() => ['(tabs)']),
}));

jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: jest.fn(() => ({ isAuthenticated: false, isLoading: true, isFirstLaunch: null })),
}));

jest.mock('@/features/settings/infrastructure/userProfileStore', () => ({
  useUserProfileStore: jest.fn((selector: (s: { hasSeenOnboarding: boolean }) => unknown) =>
    selector({ hasSeenOnboarding: false }),
  ),
}));

// Pull the mocked functions so we can change return values per test
import { useSegments } from 'expo-router';
import { useAuth } from '@/features/auth/application/AuthContext';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';

const mockedUseSegments = useSegments as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedUseUserProfileStore = useUserProfileStore as unknown as jest.Mock;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: user has NOT yet seen onboarding
    mockedUseUserProfileStore.mockImplementation(
      (selector: (s: { hasSeenOnboarding: boolean }) => unknown) =>
        selector({ hasSeenOnboarding: false }),
    );
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

  it('skips onboarding redirect when hasSeenOnboarding is true (offline-complete case)', () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, isFirstLaunch: true });
    mockedUseSegments.mockReturnValue(['(tabs)']);
    mockedUseUserProfileStore.mockImplementation(
      (selector: (s: { hasSeenOnboarding: boolean }) => unknown) =>
        selector({ hasSeenOnboarding: true }),
    );

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to HOME_ROUTE from auth screen when isFirstLaunch but hasSeenOnboarding', () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, isFirstLaunch: true });
    mockedUseSegments.mockReturnValue(['auth']);
    mockedUseUserProfileStore.mockImplementation(
      (selector: (s: { hasSeenOnboarding: boolean }) => unknown) =>
        selector({ hasSeenOnboarding: true }),
    );

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  });
});
