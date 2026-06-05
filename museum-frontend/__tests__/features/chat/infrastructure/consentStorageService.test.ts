/**
 * C1 Red — consentStorageService infra service.
 *
 * Cluster C1 (hexagonal violations, 2026-05-23-frontend-dry-audit) — the
 * `features/chat/application/useAiConsent` hook currently imports
 * `AsyncStorage` directly + builds the per-userId namespaced key inline.
 * Plan T2.9 extracts the storage access to
 * `features/chat/infrastructure/consentStorageService.ts` exposing
 * `consentStorageService.{ readAccepted, setAccepted, clearAccepted,
 * __testMemoKey }` plus a back-compat re-export `clearConsentAcceptedFlag`
 * (still consumed by `AuthContext.clearPerUserFeatureStorage`).
 *
 * THIS TEST FILE IS RED-PHASE: it must FAIL because
 * `@/features/chat/infrastructure/consentStorageService` does not yet exist.
 *
 * Contract preserved byte-for-byte from `useAiConsent.ts:24-52,112-115`:
 *  - Key derivation: `musaium.consent.aiAccepted.<userId | __anon>`.
 *  - `readAccepted` failure → Sentry capture (tag `flow: 'consent.read'`)
 *    then re-throw so the hook can flip `showAiConsent=true`.
 *  - `setAccepted` failure → silent swallow (modal re-appears next session).
 *  - `clearAccepted` failure → Sentry capture (tag `flow: 'consent.clear'`)
 *    WITHOUT re-throw.
 *  - GDPR Art. 7: anonymous namespace MUST be used when token absent or
 *    `extractUserIdFromToken` throws (defense in depth).
 *
 * Note on AsyncStorage mock — the project's `jest.config.js` uses the
 * upstream `async-storage-mock` via moduleNameMapper. We override it
 * here so we can assert exact key/value byte-for-byte without the upstream
 * mock's in-memory store getting in the way.
 */

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();
const mockRemoveItem = jest.fn<Promise<void>, [string]>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockGetItem(k),
    setItem: (k: string, v: string) => mockSetItem(k, v),
    removeItem: (k: string) => mockRemoveItem(k),
  },
}));

const mockGetAccessToken = jest.fn<string | null, []>();
jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  getAccessToken: () => mockGetAccessToken(),
}));

const mockExtractUserId = jest.fn<string | null, [string]>();
jest.mock('@/features/auth/domain/authLogic.pure', () => ({
  extractUserIdFromToken: (t: string) => mockExtractUserId(t),
}));

const mockSentryCapture = jest.fn();
jest.mock('@sentry/react-native', () => ({
  captureException: (...args: unknown[]) => mockSentryCapture(...args),
}));

// eslint-disable-next-line import/order, import/first -- mock-first per Jest hoisting rules
import {
  consentStorageService,
  clearConsentAcceptedFlag,
} from '@/features/chat/infrastructure/consentStorageService';

describe('consentStorageService (C1 hexagonal façade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockRemoveItem.mockResolvedValue(undefined);
    mockGetAccessToken.mockReturnValue('token-user-A');
    mockExtractUserId.mockReturnValue('user-A');
  });

  describe('memo key namespacing (GDPR Art. 7 cross-user isolation)', () => {
    it('returns musaium.consent.aiAccepted.<userId> when token + userId present', () => {
      expect(consentStorageService.__testMemoKey()).toBe('musaium.consent.aiAccepted.user-A');
    });

    it('returns the __anon namespace when no access token is stored', () => {
      mockGetAccessToken.mockReturnValueOnce(null);
      expect(consentStorageService.__testMemoKey()).toBe('musaium.consent.aiAccepted.__anon');
    });

    it('returns the __anon namespace when token decoding throws (defensive)', () => {
      mockExtractUserId.mockImplementationOnce(() => {
        throw new Error('bad jwt');
      });
      expect(consentStorageService.__testMemoKey()).toBe('musaium.consent.aiAccepted.__anon');
    });
  });

  describe('readAccepted()', () => {
    it('returns "true" when AsyncStorage holds the accepted flag', async () => {
      mockGetItem.mockResolvedValueOnce('true');
      const value = await consentStorageService.readAccepted();
      expect(value).toBe('true');
      expect(mockGetItem).toHaveBeenCalledWith('musaium.consent.aiAccepted.user-A');
    });

    it('returns null when AsyncStorage has no value for the namespace', async () => {
      mockGetItem.mockResolvedValueOnce(null);
      await expect(consentStorageService.readAccepted()).resolves.toBeNull();
    });

    it('captures Sentry with flow=consent.read AND re-throws on storage failure', async () => {
      const storageError = new Error('asyncstorage init drift');
      mockGetItem.mockRejectedValueOnce(storageError);

      await expect(consentStorageService.readAccepted()).rejects.toBe(storageError);
      expect(mockSentryCapture).toHaveBeenCalledWith(
        storageError,
        expect.objectContaining({ tags: expect.objectContaining({ flow: 'consent.read' }) }),
      );
    });
  });

  describe('setAccepted()', () => {
    it('writes "true" under the current user namespace', async () => {
      await consentStorageService.setAccepted();
      expect(mockSetItem).toHaveBeenCalledWith('musaium.consent.aiAccepted.user-A', 'true');
    });

    it('swallows AsyncStorage failures silently (modal re-appears next session)', async () => {
      mockSetItem.mockRejectedValueOnce(new Error('disk full'));
      await expect(consentStorageService.setAccepted()).resolves.toBeUndefined();
      expect(mockSentryCapture).not.toHaveBeenCalled();
    });
  });

  describe('clearAccepted()', () => {
    it('removes the namespaced key from AsyncStorage', async () => {
      await consentStorageService.clearAccepted();
      expect(mockRemoveItem).toHaveBeenCalledWith('musaium.consent.aiAccepted.user-A');
    });

    it('captures Sentry with flow=consent.clear and does NOT re-throw on failure', async () => {
      const storageError = new Error('disk corrupt');
      mockRemoveItem.mockRejectedValueOnce(storageError);

      await expect(consentStorageService.clearAccepted()).resolves.toBeUndefined();
      expect(mockSentryCapture).toHaveBeenCalledWith(
        storageError,
        expect.objectContaining({ tags: expect.objectContaining({ flow: 'consent.clear' }) }),
      );
    });
  });

  describe('clearConsentAcceptedFlag (back-compat re-export)', () => {
    it('delegates to consentStorageService.clearAccepted', async () => {
      await clearConsentAcceptedFlag();
      expect(mockRemoveItem).toHaveBeenCalledWith('musaium.consent.aiAccepted.user-A');
    });
  });
});
