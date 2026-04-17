import '@/__tests__/helpers/test-utils';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocation } from '@/features/museum/application/useLocation';
import { locationCache } from '@/features/museum/infrastructure/locationCache';

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
  beforeEach(async () => {
    jest.clearAllMocks();
    await locationCache.clear();
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
    if (!resolvePermission) throw new Error('Expected resolvePermission to be assigned');
    resolvePermission({ status: 'granted' });

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

  // ── Permission request throws exception ──────────────────────────────────

  it('sets error when requestForegroundPermissionsAsync throws', async () => {
    mockRequestForegroundPermissionsAsync.mockRejectedValue(new Error('Permission API crashed'));

    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.error).toBe('Permission API crashed');
    });

    expect(result.current.latitude).toBeNull();
    expect(result.current.longitude).toBeNull();
  });

  // ── Permission status is unexpected value (not 'granted') ────────────────

  it('sets status to denied for unexpected permission status value', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.status).toBe('denied');
    });

    expect(result.current.latitude).toBeNull();
    expect(result.current.longitude).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // ── Position coords have NaN values ──────────────────────────────────────

  it('stores NaN coordinates when position returns NaN values', async () => {
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: NaN, longitude: NaN },
    });

    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.status).toBe('granted');
    });

    expect(result.current.latitude).toBeNaN();
    expect(result.current.longitude).toBeNaN();
  });

  // ── precision field reflects fresh vs cached source ─────────────────────

  it('reports precision=fresh after a successful GPS fix', async () => {
    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.precision).toBe('fresh');
    });
  });

  it('hydrates from cache and reports precision=cached before GPS resolves', async () => {
    await locationCache.save({ latitude: 38.7223, longitude: -9.1393 });

    // Keep GPS pending so the cached value is what's surfaced.
    mockGetCurrentPositionAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLocation());

    await waitFor(() => {
      expect(result.current.precision).toBe('cached');
    });
    expect(result.current.latitude).toBe(38.7223);
    expect(result.current.longitude).toBe(-9.1393);
  });

  // ── GPS timeout falls back to cache ──────────────────────────────────────

  it('falls back to cached position and sets error=timeout when GPS exceeds timeout', async () => {
    jest.useFakeTimers();
    await locationCache.save({ latitude: 38.7223, longitude: -9.1393 });

    // GPS never resolves — must trigger the 8s timeout sentinel.
    mockGetCurrentPositionAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLocation());

    // Advance past the 8s GPS timeout (wrapped in act to flush React state updates).
    await act(async () => {
      await jest.advanceTimersByTimeAsync(8_500);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('timeout');
    });
    expect(result.current.latitude).toBe(38.7223);
    expect(result.current.longitude).toBe(-9.1393);
    expect(result.current.precision).toBe('cached');

    jest.useRealTimers();
  });

  // ── Rapid unmount during async permission request → cancelled flag ──────

  it('does not update state when unmounted during getCurrentPositionAsync', async () => {
    let resolvePosition:
      | ((val: { coords: { latitude: number; longitude: number } }) => void)
      | undefined;
    mockGetCurrentPositionAsync.mockReturnValue(
      new Promise<{ coords: { latitude: number; longitude: number } }>((resolve) => {
        resolvePosition = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useLocation());

    // Wait for permission to be granted (position still pending)
    await waitFor(() => {
      expect(result.current.status).toBe('granted');
    });

    // Unmount before position resolves
    unmount();

    // Resolve position after unmount — cancelled flag prevents setState
    if (!resolvePosition) throw new Error('Expected resolvePosition to be assigned');
    resolvePosition({ coords: { latitude: 48.86, longitude: 2.34 } });

    // No assertion beyond no-throw — the cancelled guard prevents state updates
  });
});
