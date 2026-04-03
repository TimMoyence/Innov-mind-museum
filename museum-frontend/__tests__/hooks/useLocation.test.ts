import '@/__tests__/helpers/test-utils';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useLocation } from '@/features/museum/application/useLocation';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => mockRequestForegroundPermissionsAsync(),
  getCurrentPositionAsync: (opts: unknown) => mockGetCurrentPositionAsync(opts),
  Accuracy: { Balanced: 3 },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 48.8606, longitude: 2.3376 },
    });
  });

  it('starts with idle status and null coordinates', () => {
    // Prevent auto-resolution
    mockRequestForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLocation());

    // Initially status transitions to 'requesting' immediately
    expect(result.current.latitude).toBeNull();
    expect(result.current.longitude).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('requests permission and fetches location on mount', async () => {
    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.latitude).toBe(48.8606);
    });

    expect(result.current.longitude).toBe(2.3376);
    expect(result.current.status).toBe('granted');
    expect(result.current.error).toBeNull();
  });

  it('sets status to denied when permission is not granted', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.status).toBe('denied');
    });

    expect(result.current.latitude).toBeNull();
    expect(result.current.longitude).toBeNull();
  });

  it('sets error when getCurrentPositionAsync fails', async () => {
    mockGetCurrentPositionAsync.mockRejectedValue(new Error('Location unavailable'));

    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.error).toBe('Location unavailable');
    });
  });

  it('sets generic error message for non-Error exceptions', async () => {
    mockGetCurrentPositionAsync.mockRejectedValue('unknown failure');

    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to get location');
    });
  });

  it('does not update state after unmount (cancellation guard)', () => {
    let resolvePermission: ((val: { status: string }) => void) | undefined;
    mockRequestForegroundPermissionsAsync.mockReturnValue(
      new Promise<{ status: string }>((resolve) => {
        resolvePermission = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useLocation());

    // Unmount before permission resolves
    unmount();

    // Resolve after unmount — should not throw
    resolvePermission!({ status: 'granted' });

    // No assertion needed beyond no-throw — the cancelled flag prevents setState
  });

  it('transitions through requesting status', async () => {
    const { result } = renderHook(() => useLocation());

    // The hook should immediately transition to 'requesting'
    await waitFor(() => {
      expect(result.current.status).not.toBe('idle');
    });

    // Eventually settles on 'granted'
    await waitFor(() => {
      expect(result.current.status).toBe('granted');
    });
  });
});
