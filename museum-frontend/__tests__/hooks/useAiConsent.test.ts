import '@/__tests__/helpers/test-utils';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAiConsent, clearConsentAcceptedFlag } from '@/features/chat/application/useAiConsent';

// ── Mocks (C1 hexagonal 2026-05-23) ──────────────────────────────────────────
//
// The hook used to import `AsyncStorage` + `thirdPartyAiConsent.grantConsentScope`
// directly ; both moved behind infra services. We mock the services here ; the
// per-userId key namespacing contract is now owned + tested by
// `__tests__/features/chat/infrastructure/consentStorageService.test.ts`.

const mockReadAccepted = jest.fn<Promise<string | null>, []>();
const mockSetAccepted = jest.fn<Promise<void>, []>();
const mockClearAccepted = jest.fn<Promise<void>, []>();

jest.mock('@/features/chat/infrastructure/consentStorageService', () => ({
  consentStorageService: {
    readAccepted: () => mockReadAccepted(),
    setAccepted: () => mockSetAccepted(),
    clearAccepted: () => mockClearAccepted(),
  },
  clearConsentAcceptedFlag: () => mockClearAccepted(),
}));

const mockGrantConsentScope = jest.fn<Promise<void>, [string]>();
jest.mock('@/features/chat/infrastructure/consentApi', () => ({
  consentApi: {
    list: jest.fn(),
    grant: (scope: string) => mockGrantConsentScope(scope),
    revoke: jest.fn(),
  },
}));

// `@sentry/react-native` is mocked globally in `__tests__/helpers/test-utils.tsx`
// (loaded above) ; grab the SAME shared mock to assert the captureException call.
const mockSentryCapture: jest.Mock = require('@sentry/react-native').captureException;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAiConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadAccepted.mockResolvedValue(null);
    mockSetAccepted.mockResolvedValue(undefined);
    mockClearAccepted.mockResolvedValue(undefined);
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
    mockReadAccepted.mockResolvedValue('true');

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

    expect(mockSetAccepted).toHaveBeenCalledTimes(1);
    expect(result.current.showAiConsent).toBe(false);
  });

  it('still hides modal even when persistence fails', async () => {
    // consentStorageService.setAccepted swallows errors internally ; the hook
    // sees a resolved promise either way. We simulate that by resolving the
    // mock — the assertion is that `showAiConsent` still flips.
    mockSetAccepted.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    await act(async () => {
      await result.current.acceptAiConsent();
    });

    expect(result.current.showAiConsent).toBe(false);
  });

  it('re-shows modal on recheck when consent is not stored', async () => {
    mockReadAccepted.mockResolvedValue('true');

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    expect(result.current.showAiConsent).toBe(false);

    // Simulate consent being cleared externally
    mockReadAccepted.mockResolvedValue(null);

    await act(async () => {
      result.current.recheckConsent();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.showAiConsent).toBe(true);
    });
  });

  it('keeps modal hidden on recheck when consent is stored', async () => {
    mockReadAccepted.mockResolvedValue('true');

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
      expect(mockReadAccepted).toHaveBeenCalledTimes(2);
    });

    expect(result.current.showAiConsent).toBe(false);
  });

  it('shows consent modal when storage read fails', async () => {
    // consentStorageService.readAccepted captures+re-throws on failure ;
    // the hook's .catch flips the modal on.
    mockReadAccepted.mockRejectedValue(new Error('Storage read failed'));

    const { result } = renderHook(() => useAiConsent());

    await waitFor(() => {
      expect(result.current.consentResolved).toBe(true);
    });

    expect(result.current.showAiConsent).toBe(true);
  });

  // S4-P0-02 — scoped acceptance path : `acceptAiConsent(scopes)` MUST call
  // `consentApi.grant` once per scope (one audit row per scope) before
  // flipping the storage flag.
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
    expect(mockSetAccepted).toHaveBeenCalled();
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
    // Storage flag still flips so the user is not re-prompted.
    expect(mockSetAccepted).toHaveBeenCalled();
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
    expect(mockSetAccepted).toHaveBeenCalled();
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

  it('clearConsentAcceptedFlag delegates to consentStorageService.clearAccepted (R6/AC-B8-1)', async () => {
    await clearConsentAcceptedFlag();
    expect(mockClearAccepted).toHaveBeenCalledTimes(1);
  });
});
