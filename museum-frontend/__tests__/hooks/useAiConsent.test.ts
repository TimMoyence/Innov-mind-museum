import '@/__tests__/helpers/test-utils';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAiConsent } from '@/features/chat/application/useAiConsent';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => mockGetItem(key),
  setItem: (key: string, value: string) => mockSetItem(key, value),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAiConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  it('shows consent modal when no consent is stored', async () => {
    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    expect(result.current.showAiConsent).toBe(true);
  });

  it('hides consent modal when consent was previously accepted', async () => {
    mockGetItem.mockResolvedValue('true');

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    expect(result.current.showAiConsent).toBe(false);
  });

  it('persists consent and hides modal on accept', async () => {
    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    expect(result.current.showAiConsent).toBe(true);

    await act(async () => {
      await result.current.acceptAiConsent();
    });

    expect(mockSetItem).toHaveBeenCalledWith('consent.ai_accepted', 'true');
    expect(result.current.showAiConsent).toBe(false);
  });

  it('still hides modal even when persistence fails', async () => {
    mockSetItem.mockRejectedValue(new Error('Storage write failed'));

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    await act(async () => {
      await result.current.acceptAiConsent();
    });

    // Modal should be hidden even though persistence failed
    expect(result.current.showAiConsent).toBe(false);
  });

  it('re-shows modal on recheck when consent is not stored', async () => {
    mockGetItem.mockResolvedValue('true');

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    expect(result.current.showAiConsent).toBe(false);

    // Simulate consent being cleared externally
    mockGetItem.mockResolvedValue(null);

    await act(async () => {
      result.current.recheckConsent();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.showAiConsent).toBe(true);
    });
  });

  it('keeps modal hidden on recheck when consent is stored', async () => {
    mockGetItem.mockResolvedValue('true');

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    await act(async () => {
      result.current.recheckConsent();
      await Promise.resolve();
    });

    // Wait for the async operation to settle
    await waitFor(() => {
      expect(mockGetItem).toHaveBeenCalledTimes(2);
    });

    expect(result.current.showAiConsent).toBe(false);
  });

  it('shows consent modal when storage read fails', async () => {
    mockGetItem.mockRejectedValue(new Error('Storage read failed'));

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    expect(result.current.showAiConsent).toBe(true);
  });
});
