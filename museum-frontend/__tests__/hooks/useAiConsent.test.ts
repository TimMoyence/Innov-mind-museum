import '@/__tests__/helpers/test-utils';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAiConsent, clearConsentAcceptedFlag } from '@/features/chat/application/useAiConsent';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();
const mockRemoveItem = jest.fn<Promise<void>, [string]>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => mockGetItem(key),
  setItem: (key: string, value: string) => mockSetItem(key, value),
  removeItem: (key: string) => mockRemoveItem(key),
}));

const mockGrantConsentScope = jest.fn<Promise<void>, [string]>();
jest.mock('@/features/chat/application/thirdPartyAiConsent', () => ({
  grantConsentScope: (scope: string) => mockGrantConsentScope(scope),
  THIRD_PARTY_AI_SCOPES: [],
  CONSENT_POLICY_VERSION: '2026-06-01',
  listUserConsents: jest.fn(),
  revokeConsentScope: jest.fn(),
}));

// B8 — the memo key is namespaced per-userId, derived from the access token.
// userId comes from `extractUserIdFromToken(getAccessToken())` (design §9 D2).
const mockGetAccessToken = jest.fn<string, []>(() => 'token-user-A');
jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  getAccessToken: () => mockGetAccessToken(),
}));

const mockExtractUserId = jest.fn<string | null, [string]>(() => 'user-A');
jest.mock('@/features/auth/domain/authLogic.pure', () => ({
  extractUserIdFromToken: (token: string) => mockExtractUserId(token),
}));

/** Per-userId namespaced memo key convention (TD-AS-01). */
const memoKey = (userId: string): string => `musaium.consent.aiAccepted.${userId}`;

// `@sentry/react-native` is mocked globally in `__tests__/helpers/test-utils.tsx`
// (loaded above) ; grab the SAME shared mock to assert the captureException call.
const mockSentryCapture: jest.Mock = require('@sentry/react-native').captureException;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAiConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockRemoveItem.mockResolvedValue(undefined);
    mockGrantConsentScope.mockResolvedValue(undefined);
    mockGetAccessToken.mockReturnValue('token-user-A');
    mockExtractUserId.mockReturnValue('user-A');
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

    expect(mockSetItem).toHaveBeenCalledWith(memoKey('user-A'), 'true');
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
    expect(mockSetItem).toHaveBeenCalledWith(memoKey('user-A'), 'true');
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
    expect(mockSetItem).toHaveBeenCalledWith(memoKey('user-A'), 'true');
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
    expect(mockSetItem).toHaveBeenCalledWith(memoKey('user-A'), 'true');
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

  // ── B8: cross-user consent isolation (spec R6/R7/R10, design §9 D2) ──────────

  it('reads the per-userId namespaced memo key, not the legacy global key (R7)', async () => {
    mockExtractUserId.mockReturnValue('user-A');
    renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(mockGetItem).toHaveBeenCalled();
    });
    // Every read goes through the per-user namespace — never the legacy
    // global `consent.ai_accepted` (which would let user B inherit user A's
    // acceptance on a shared device).
    expect(mockGetItem).toHaveBeenCalledWith(memoKey('user-A'));
    expect(mockGetItem).not.toHaveBeenCalledWith('consent.ai_accepted');
  });

  it("does NOT suppress user B's prompt after user A accepted on the same device (R7/AC-B8-3)", async () => {
    // Simulate a device store: ONLY user A's namespace holds 'true'.
    const store: Record<string, string> = { [memoKey('user-A')]: 'true' };
    mockGetItem.mockImplementation((key: string) => Promise.resolve(store[key] ?? null));

    // Now user B is logged in (token + extracted id swapped to B).
    mockGetAccessToken.mockReturnValue('token-user-B');
    mockExtractUserId.mockReturnValue('user-B');

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    // B has no acceptance under their own namespace → must be re-prompted.
    expect(result.current.showAiConsent).toBe(true);
    expect(mockGetItem).toHaveBeenCalledWith(memoKey('user-B'));
  });

  it('re-prompts (no inheritance, no throw) on a device carrying ONLY the legacy global key (R10/AC-B8-4)', async () => {
    // Legacy device: only the old global key is set ; the per-user namespace
    // is absent. The legacy key MUST NOT be honoured for the new namespace.
    const store: Record<string, string> = { 'consent.ai_accepted': 'true' };
    mockGetItem.mockImplementation((key: string) => Promise.resolve(store[key] ?? null));
    mockExtractUserId.mockReturnValue('user-A');

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    expect(result.current.showAiConsent).toBe(true);
  });

  it('clearConsentAcceptedFlag removes the per-userId namespaced key (R6/AC-B8-1)', async () => {
    mockExtractUserId.mockReturnValue('user-A');

    await clearConsentAcceptedFlag();

    expect(mockRemoveItem).toHaveBeenCalledWith(memoKey('user-A'));
    expect(mockRemoveItem).not.toHaveBeenCalledWith('consent.ai_accepted');
  });
});
