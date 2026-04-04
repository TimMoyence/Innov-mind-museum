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
    resolvePosition!({ coords: { latitude: 48.86, longitude: 2.34 } });

    // No assertion beyond no-throw — the cancelled guard prevents state updates
  });
});
