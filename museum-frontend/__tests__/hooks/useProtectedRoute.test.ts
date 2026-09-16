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

  // ── Public magic-link routes (reset-password / verify-email /
  //    confirm-email-change) are reached from an email link precisely when the
  //    user is NOT authenticated. The guard must NOT bounce them to /auth, or
  //    the magic-link flows are unreachable (the reset-password form never
  //    renders → the deep-link is dead for every forgot-password user).
  it.each([['reset-password'], ['verify-email'], ['confirm-email-change']])(
    'does not redirect an unauthenticated user away from the public magic-link route (stack)/%s',
    (route) => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        isFirstLaunch: false,
      });
      mockedUseSegments.mockReturnValue(['(stack)', route]);

      renderHook(() => {
        useProtectedRoute();
      });

      expect(mockReplace).not.toHaveBeenCalled();
    },
  );

  // The register flow auto-logs the user in (useEmailPasswordAuth → loginWithSession),
  // so a brand-new registrant is `isAuthenticated` with `isFirstLaunch: true` and
  // `hasSeenOnboarding: false` when they leave for Mail and tap their verification
  // link. If the onboarding branch does not honour the public allow-list, the guard
  // bounces them to /(stack)/onboarding and the verify-email screen never mounts —
  // i.e. the most common magic link of all stays broken for the exact population
  // that receives it.
  it.each([['verify-email'], ['confirm-email-change'], ['reset-password']])(
    'does not bounce a freshly-registered (authenticated, pre-onboarding) user off the public magic-link route (stack)/%s',
    (route) => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        isFirstLaunch: true,
      });
      mockedUseSegments.mockReturnValue(['(stack)', route]);
      mockedUseUserProfileStore.mockImplementation(
        (selector: (s: { hasSeenOnboarding: boolean }) => unknown) =>
          selector({ hasSeenOnboarding: false }),
      );

      renderHook(() => {
        useProtectedRoute();
      });

      expect(mockReplace).not.toHaveBeenCalled();
    },
  );

  it('still forces onboarding for a freshly-registered user on a NON-public route', () => {
    // Regression guard: the allow-list must not disable the onboarding gate at large.
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, isFirstLaunch: true });
    mockedUseSegments.mockReturnValue(['(tabs)']);
    mockedUseUserProfileStore.mockImplementation(
      (selector: (s: { hasSeenOnboarding: boolean }) => unknown) =>
        selector({ hasSeenOnboarding: false }),
    );

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).toHaveBeenCalledWith('/(stack)/onboarding');
  });

  it('still redirects an unauthenticated user away from a genuinely protected (stack) route', () => {
    // Regression guard: the public allow-list must NOT open every (stack) route.
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isFirstLaunch: false,
    });
    mockedUseSegments.mockReturnValue(['(stack)', 'settings']);

    renderHook(() => {
      useProtectedRoute();
    });

    expect(mockReplace).toHaveBeenCalledWith('/auth');
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
