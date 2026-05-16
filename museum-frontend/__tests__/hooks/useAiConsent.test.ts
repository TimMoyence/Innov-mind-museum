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

const mockGrantConsentScope = jest.fn<Promise<void>, [string]>();
jest.mock('@/features/chat/application/thirdPartyAiConsent', () => ({
  grantConsentScope: (scope: string) => mockGrantConsentScope(scope),
  THIRD_PARTY_AI_SCOPES: [],
  CONSENT_POLICY_VERSION: '2026-06-01',
  listUserConsents: jest.fn(),
  revokeConsentScope: jest.fn(),
}));

// `@sentry/react-native` is mocked globally in `__tests__/helpers/test-utils.tsx`
// (loaded above) ; grab the SAME shared mock to assert the captureException call.
const mockSentryCapture: jest.Mock = require('@sentry/react-native').captureException;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAiConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockGrantConsentScope.mockResolvedValue(undefined);
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

  // S4-P0-02 — scoped acceptance path : `acceptAiConsent(scopes)` MUST POST
  // each scope to BE (one audit row per scope) before flipping AsyncStorage.
  it('POSTs each granted scope to BE on scoped acceptance', async () => {
    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    await act(async () => {
      await result.current.acceptAiConsent([
        'third_party_ai_text_openai',
        'third_party_ai_image_openai',
      ]);
    });

    expect(mockGrantConsentScope).toHaveBeenCalledTimes(2);
    expect(mockGrantConsentScope).toHaveBeenNthCalledWith(1, 'third_party_ai_text_openai');
    expect(mockGrantConsentScope).toHaveBeenNthCalledWith(2, 'third_party_ai_image_openai');
    expect(mockSetItem).toHaveBeenCalledWith('consent.ai_accepted', 'true');
    expect(result.current.showAiConsent).toBe(false);
  });

  it('reports per-scope BE failures to Sentry without aborting the remaining grants', async () => {
    mockGrantConsentScope
      .mockImplementationOnce(() => Promise.reject(new Error('Network down')))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAiConsent());
    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    await act(async () => {
      await result.current.acceptAiConsent([
        'third_party_ai_text_openai',
        'third_party_ai_image_openai',
      ]);
    });

    expect(mockGrantConsentScope).toHaveBeenCalledTimes(2);
    expect(mockSentryCapture).toHaveBeenCalledTimes(1);
    expect(mockSentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          flow: 'consent.grant',
          scope: 'third_party_ai_text_openai',
        }),
      }),
    );
    // AsyncStorage still flips so the user is not re-prompted.
    expect(mockSetItem).toHaveBeenCalledWith('consent.ai_accepted', 'true');
    expect(result.current.showAiConsent).toBe(false);
  });

  it('skips BE round-trips entirely on legacy back-compat acceptAiConsent() call', async () => {
    const { result } = renderHook(() => useAiConsent());
    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    await act(async () => {
      await result.current.acceptAiConsent();
    });

    expect(mockGrantConsentScope).not.toHaveBeenCalled();
    expect(mockSentryCapture).not.toHaveBeenCalled();
    expect(mockSetItem).toHaveBeenCalledWith('consent.ai_accepted', 'true');
  });

  it('skips BE round-trips when scopes array is empty', async () => {
    const { result } = renderHook(() => useAiConsent());
    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    await act(async () => {
      await result.current.acceptAiConsent([]);
    });

    expect(mockGrantConsentScope).not.toHaveBeenCalled();
  });
});
