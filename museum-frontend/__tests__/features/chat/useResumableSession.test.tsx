import { act, renderHook, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();

jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: (key: string) => mockGetItem(key),
    setItem: (key: string, value: string) => mockSetItem(key, value),
    removeItem: jest.fn(),
    getJSON: jest.fn(),
    setJSON: jest.fn(),
  },
}));

const mockListSessions = jest.fn<Promise<unknown>, [unknown]>();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    listSessions: (params: unknown) => mockListSessions(params),
  },
}));

import {
  useResumableSession,
  RESUMPTION_BANNER_DISMISS_STORAGE_KEY,
  RESUMPTION_BANNER_DISMISS_DURATION_MS,
  RESUMPTION_BANNER_WINDOW_MS,
} from '@/features/chat/application/useResumableSession';

const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 86_400_000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

function makeSessionListItem(
  overrides: Partial<{
    id: string;
    museumMode: boolean;
    museumName: string | null;
    museumId: number | null;
    lastArtworkTitle: string | null;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string | null;
    messageCount: number;
    locale: string;
    intent: 'default' | 'walk';
  }> = {},
) {
  const now = Date.now();
  const defaultTs = new Date(now - 2 * ONE_HOUR_MS).toISOString();
  return {
    id: overrides.id ?? 'sess-default',
    museumMode: overrides.museumMode ?? false,
    museumName: overrides.museumName ?? 'Louvre',
    museumId: overrides.museumId ?? 7,
    lastArtworkTitle: overrides.lastArtworkTitle ?? 'La Liseuse',
    title: overrides.title ?? null,
    createdAt: overrides.createdAt ?? defaultTs,
    updatedAt: overrides.updatedAt ?? defaultTs,
    lastMessageAt: overrides.lastMessageAt ?? overrides.updatedAt ?? defaultTs,
    messageCount: overrides.messageCount ?? 4,
    locale: overrides.locale ?? 'en-US',
    intent: overrides.intent ?? 'default',
  };
}

function listResponse(sessions: ReturnType<typeof makeSessionListItem>[]) {
  return {
    sessions,
    page: {
      nextCursor: null,
      hasMore: false,
      limit: 10,
    },
  };
}

describe('useResumableSession (B2 — conversation resumption hook)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  describe('exported constants (R12, AC1)', () => {
    it('exposes RESUMPTION_BANNER_DISMISS_STORAGE_KEY === "musaium.settings.resumptionBannerDismissedUntil"', () => {
      expect(RESUMPTION_BANNER_DISMISS_STORAGE_KEY).toBe(
        'musaium.settings.resumptionBannerDismissedUntil',
      );
    });

    it('exposes RESUMPTION_BANNER_DISMISS_DURATION_MS === 86_400_000 (24h)', () => {
      expect(RESUMPTION_BANNER_DISMISS_DURATION_MS).toBe(86_400_000);
    });

    it('exposes RESUMPTION_BANNER_WINDOW_MS === 604_800_000 (7 days)', () => {
      expect(RESUMPTION_BANNER_WINDOW_MS).toBe(604_800_000);
    });
  });

  describe('shape (R1)', () => {
    it('returns { session, isLoading, dismiss } as documented', () => {
      mockListSessions.mockResolvedValue(listResponse([]));
      const { result } = renderHook(() => useResumableSession());

      expect(result.current).toEqual(
        expect.objectContaining({
          session: null,
          isLoading: expect.any(Boolean),
          dismiss: expect.any(Function),
        }),
      );
    });
  });

  describe('fetch + empty response (R2, AC2)', () => {
    it('calls chatApi.listSessions exactly once on mount with limit=10', async () => {
      mockListSessions.mockResolvedValue(listResponse([]));
      renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(mockListSessions).toHaveBeenCalledTimes(1);
      });
      expect(mockListSessions).toHaveBeenCalledWith({ limit: 10 });
    });

    it('resolves session=null when listSessions returns empty sessions array', async () => {
      mockListSessions.mockResolvedValue(listResponse([]));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.session).toBeNull();
    });
  });

  describe('filter rules (R3, AC3-AC5)', () => {
    it('keeps sessions with messageCount > 0 AND age < 7 days (AC3)', async () => {
      const now = Date.now();
      const recent = makeSessionListItem({
        id: 'sess-recent',
        updatedAt: new Date(now - 2 * ONE_HOUR_MS).toISOString(),
        messageCount: 3,
      });
      mockListSessions.mockResolvedValue(listResponse([recent]));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.session).not.toBeNull();
      expect(result.current.session?.id).toBe('sess-recent');
    });

    it('filters OUT sessions with messageCount === 0 (AC4)', async () => {
      const empty = makeSessionListItem({
        id: 'sess-empty',
        messageCount: 0,
      });
      mockListSessions.mockResolvedValue(listResponse([empty]));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.session).toBeNull();
    });

    it('filters OUT sessions older than 7 days (AC5)', async () => {
      const now = Date.now();
      const stale = makeSessionListItem({
        id: 'sess-stale',
        updatedAt: new Date(now - SEVEN_DAYS_MS - 60_000).toISOString(),
        messageCount: 5,
      });
      mockListSessions.mockResolvedValue(listResponse([stale]));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.session).toBeNull();
    });

    it('keeps sessions exactly under 7 days (boundary < not ≤)', async () => {
      const now = Date.now();
      const justUnder = makeSessionListItem({
        id: 'sess-edge',
        updatedAt: new Date(now - SEVEN_DAYS_MS + 60_000).toISOString(),
        messageCount: 1,
      });
      mockListSessions.mockResolvedValue(listResponse([justUnder]));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.session?.id).toBe('sess-edge');
    });
  });

  describe('selection by max updatedAt (R4)', () => {
    it('picks the most recent session when multiple are eligible', async () => {
      const now = Date.now();
      const older = makeSessionListItem({
        id: 'sess-older',
        updatedAt: new Date(now - 3 * ONE_DAY_MS).toISOString(),
      });
      const newer = makeSessionListItem({
        id: 'sess-newer',
        updatedAt: new Date(now - ONE_HOUR_MS).toISOString(),
      });
      mockListSessions.mockResolvedValue(listResponse([older, newer]));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session).not.toBeNull();
      });
      expect(result.current.session?.id).toBe('sess-newer');
    });
  });

  describe('selection by max lastMessageAt (QA-09 regression)', () => {
    it('ranks by lastMessageAt, not the frozen updatedAt — the most recently CHATTED session wins', async () => {
      const now = Date.now();
      const stale = makeSessionListItem({
        id: 'sess-stale',
        createdAt: new Date(now - 5 * ONE_DAY_MS + 60_000).toISOString(),
        updatedAt: new Date(now - 5 * ONE_DAY_MS + 60_000).toISOString(),
        lastMessageAt: new Date(now - 4 * ONE_DAY_MS).toISOString(),
        messageCount: 2,
      });
      const active = makeSessionListItem({
        id: 'sess-active',
        createdAt: new Date(now - 5 * ONE_DAY_MS).toISOString(),
        updatedAt: new Date(now - 5 * ONE_DAY_MS).toISOString(),
        lastMessageAt: new Date(now - ONE_HOUR_MS).toISOString(),
        messageCount: 2,
      });
      mockListSessions.mockResolvedValue(listResponse([stale, active]));

      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session).not.toBeNull();
      });
      expect(result.current.session?.id).toBe('sess-active');
    });

    it('falls back to updatedAt for ranking when lastMessageAt is null (legacy/no-message rows)', async () => {
      const now = Date.now();
      const older = makeSessionListItem({
        id: 'sess-older-null',
        updatedAt: new Date(now - 3 * ONE_DAY_MS).toISOString(),
        lastMessageAt: null,
      });
      const newer = makeSessionListItem({
        id: 'sess-newer-null',
        updatedAt: new Date(now - ONE_HOUR_MS).toISOString(),
        lastMessageAt: null,
      });
      mockListSessions.mockResolvedValue(listResponse([older, newer]));

      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session).not.toBeNull();
      });
      expect(result.current.session?.id).toBe('sess-newer-null');
    });
  });

  describe('ResumableSession shape (R9)', () => {
    it('exposes id, museumId, museumName, lastArtworkTitle, updatedAt', async () => {
      const item = makeSessionListItem({
        id: 'sess-shape',
        museumId: 42,
        museumName: "Musée d'Orsay",
        lastArtworkTitle: 'Olympia',
      });
      mockListSessions.mockResolvedValue(listResponse([item]));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session).not.toBeNull();
      });
      expect(result.current.session).toEqual({
        id: 'sess-shape',
        museumId: 42,
        museumName: "Musée d'Orsay",
        lastArtworkTitle: 'Olympia',
        updatedAt: item.updatedAt,
      });
    });

    it('falls back to null on museumId / lastArtworkTitle when absent from BE response (NFR5 backward-compat)', async () => {
      const legacy = makeSessionListItem({ id: 'sess-legacy' });
      const sanitized: Record<string, unknown> = { ...legacy };
      delete sanitized.museumId;
      delete sanitized.lastArtworkTitle;

      mockListSessions.mockResolvedValue(
        listResponse([sanitized as ReturnType<typeof makeSessionListItem>]),
      );
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session).not.toBeNull();
      });
      expect(result.current.session?.museumId).toBeNull();
      expect(result.current.session?.lastArtworkTitle).toBeNull();
    });
  });

  describe('dismiss-until storage gate (R6-R8, AC6-AC8)', () => {
    it('returns session=null when storage holds an ISO in the future (AC6)', async () => {
      const futureISO = new Date(Date.now() + 2 * ONE_HOUR_MS).toISOString();
      mockGetItem.mockImplementation((key) =>
        Promise.resolve(key === RESUMPTION_BANNER_DISMISS_STORAGE_KEY ? futureISO : null),
      );
      const recent = makeSessionListItem({ id: 'sess-suppressed' });
      mockListSessions.mockResolvedValue(listResponse([recent]));

      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.session).toBeNull();
    });

    it('IGNORES the dismiss flag when its ISO is in the past — banner reappears post-24h (AC7)', async () => {
      const pastISO = new Date(Date.now() - 5 * ONE_HOUR_MS).toISOString();
      mockGetItem.mockImplementation((key) =>
        Promise.resolve(key === RESUMPTION_BANNER_DISMISS_STORAGE_KEY ? pastISO : null),
      );
      const recent = makeSessionListItem({ id: 'sess-revived' });
      mockListSessions.mockResolvedValue(listResponse([recent]));

      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session?.id).toBe('sess-revived');
      });
    });

    it('dismiss() writes (now + 24h).toISOString() under the correct storage key (AC8)', async () => {
      const recent = makeSessionListItem({ id: 'sess-dismissable' });
      mockListSessions.mockResolvedValue(listResponse([recent]));

      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session).not.toBeNull();
      });

      const before = Date.now();
      await act(async () => {
        await result.current.dismiss();
      });
      const after = Date.now();

      expect(mockSetItem).toHaveBeenCalledTimes(1);
      const firstCall = mockSetItem.mock.calls[0] ?? [];
      const [key, value] = firstCall;
      expect(key).toBe(RESUMPTION_BANNER_DISMISS_STORAGE_KEY);
      const writtenMs = new Date(value ?? '').getTime();
      expect(writtenMs).toBeGreaterThanOrEqual(before + ONE_DAY_MS);
      expect(writtenMs).toBeLessThanOrEqual(after + ONE_DAY_MS);
    });

    it('dismiss() sets local session to null synchronously (optimistic UI, AC8)', async () => {
      const recent = makeSessionListItem({ id: 'sess-optimistic' });
      mockListSessions.mockResolvedValue(listResponse([recent]));

      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session).not.toBeNull();
      });

      await act(async () => {
        await result.current.dismiss();
      });
      expect(result.current.session).toBeNull();
    });
  });

  describe('error tolerance (R7, R11, AC9-AC10)', () => {
    it('does NOT throw when chatApi.listSessions rejects — session stays null (AC9)', async () => {
      mockListSessions.mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.session).toBeNull();
    });

    it('does NOT throw when storage.getItem rejects — proceeds as if not dismissed (AC10)', async () => {
      mockGetItem.mockRejectedValue(new Error('Storage unavailable'));
      const recent = makeSessionListItem({ id: 'sess-tolerant' });
      mockListSessions.mockResolvedValue(listResponse([recent]));

      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session?.id).toBe('sess-tolerant');
      });
    });

    it('tolerates an unparseable dismiss-until value and proceeds normally (R7)', async () => {
      mockGetItem.mockImplementation((key) =>
        Promise.resolve(key === RESUMPTION_BANNER_DISMISS_STORAGE_KEY ? 'not-an-iso-date' : null),
      );
      const recent = makeSessionListItem({ id: 'sess-bad-iso' });
      mockListSessions.mockResolvedValue(listResponse([recent]));

      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session?.id).toBe('sess-bad-iso');
      });
    });
  });
});
