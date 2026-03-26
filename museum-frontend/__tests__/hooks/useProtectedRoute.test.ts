import { renderHook, waitFor } from '@testing-library/react-native';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: jest.fn(() => ['(tabs)']),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(() => ({ isAuthenticated: false, isLoading: true })),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve('true')),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));

// Pull the mocked functions so we can change return values per test
import { useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockedUseSegments = useSegments as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedGetItem = AsyncStorage.getItem as jest.Mock;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: onboarding complete (not first launch)
    mockedGetItem.mockResolvedValue('true');
  });

  it('does not redirect while loading', async () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    mockedUseSegments.mockReturnValue(['(tabs)']);

    renderHook(() => { useProtectedRoute(); });

    await waitFor(() => {
      expect(mockedGetItem).toHaveBeenCalled();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to AUTH_ROUTE when not authenticated and not on auth screen', async () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    mockedUseSegments.mockReturnValue(['(tabs)']);

    renderHook(() => { useProtectedRoute(); });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/auth');
    });
  });

  it('redirects to HOME_ROUTE when authenticated and on auth screen (onboarding complete)', async () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockedUseSegments.mockReturnValue(['auth']);
    mockedGetItem.mockResolvedValue('true');

    renderHook(() => { useProtectedRoute(); });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });

  it('redirects to onboarding when authenticated, on auth screen, and first launch', async () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockedUseSegments.mockReturnValue(['auth']);
    mockedGetItem.mockResolvedValue(null);

    renderHook(() => { useProtectedRoute(); });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(stack)/onboarding');
    });
  });

  it('does not redirect when authenticated and not on auth screen (onboarding complete)', async () => {
    mockedUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockedUseSegments.mockReturnValue(['(tabs)']);
    mockedGetItem.mockResolvedValue('true');

    renderHook(() => { useProtectedRoute(); });

    await waitFor(() => {
      expect(mockedGetItem).toHaveBeenCalled();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
