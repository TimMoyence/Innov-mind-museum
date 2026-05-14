/**
 * Red tests for B2 — `useResumableSession` hook (conversation resumption
 * banner data layer : list-sessions filter, 7-day window, dismiss-until
 * storage gate).
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/B2.md` :
 *
 *   §1.1 (R1-R12) — hook shape + fetch + filter + max-by-updatedAt +
 *                   dismiss-until storage gate + telemetry counters.
 *   §4 (AC1-AC10) — exported constants + filter rules + dismiss flow +
 *                   error tolerance.
 *
 * Key invariants :
 *   - Exposed constants :
 *       RESUMPTION_BANNER_DISMISS_STORAGE_KEY === 'settings.resumption_banner_dismissed_until'
 *       RESUMPTION_BANNER_DISMISS_DURATION_MS === 86_400_000
 *       RESUMPTION_BANNER_WINDOW_MS === 604_800_000
 *   - Hook returns `{ session: ResumableSession | null; isLoading: boolean; dismiss: () => Promise<void> }`.
 *   - Filters OUT sessions with `messageCount === 0`.
 *   - Filters OUT sessions older than 7 days.
 *   - Picks the most recent `updatedAt` among eligible.
 *   - Dismiss-until storage gate : ISO timestamp in the future suppresses
 *     the banner ; expired/missing/unparseable → proceeds normally.
 *   - `dismiss()` writes `(now + 24h).toISOString()` AND sets local
 *     session to `null` synchronously.
 *   - No throw on API error / storage error.
 *
 * At baseline (B2 not yet implemented) :
 *   - `@/features/chat/application/useResumableSession` does not exist
 *     (verified : `ls museum-frontend/features/chat/application/useResumableSession*` → 0).
 *     → Jest fails with "Cannot find module" at module load time.
 *
 * Spec : `docs/chat-ux-refonte/specs/B2.md` §1.1 R1-R12 ; §4 AC1-AC10.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';

// ── storage façade mock — drives the hook deterministically ─────────────────
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

// ── chatApi.listSessions mock — drives BE response ──────────────────────────
const mockListSessions = jest.fn<Promise<unknown>, [unknown]>();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    listSessions: (params: unknown) => mockListSessions(params),
  },
}));

// RED ASSERTION 1 : module does not exist yet at baseline.
import {
  useResumableSession,
  RESUMPTION_BANNER_DISMISS_STORAGE_KEY,
  RESUMPTION_BANNER_DISMISS_DURATION_MS,
  RESUMPTION_BANNER_WINDOW_MS,
} from '@/features/chat/application/useResumableSession';

// ── small helpers ───────────────────────────────────────────────────────────

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
    messageCount: number;
    locale: string;
    intent: 'default' | 'walk';
  }> = {},
) {
  const now = Date.now();
  return {
    id: overrides.id ?? 'sess-default',
    museumMode: overrides.museumMode ?? false,
    museumName: overrides.museumName ?? 'Louvre',
    museumId: overrides.museumId ?? 7,
    lastArtworkTitle: overrides.lastArtworkTitle ?? 'La Liseuse',
    title: overrides.title ?? null,
    createdAt: overrides.createdAt ?? new Date(now - 2 * ONE_HOUR_MS).toISOString(),
    updatedAt: overrides.updatedAt ?? new Date(now - 2 * ONE_HOUR_MS).toISOString(),
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

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R12 / §4 AC1 — exported constants contract
  // ────────────────────────────────────────────────────────────────────────
  describe('exported constants (R12, AC1)', () => {
    it('exposes RESUMPTION_BANNER_DISMISS_STORAGE_KEY === "settings.resumption_banner_dismissed_until"', () => {
      expect(RESUMPTION_BANNER_DISMISS_STORAGE_KEY).toBe(
        'settings.resumption_banner_dismissed_until',
      );
    });

    it('exposes RESUMPTION_BANNER_DISMISS_DURATION_MS === 86_400_000 (24h)', () => {
      expect(RESUMPTION_BANNER_DISMISS_DURATION_MS).toBe(86_400_000);
    });

    it('exposes RESUMPTION_BANNER_WINDOW_MS === 604_800_000 (7 days)', () => {
      expect(RESUMPTION_BANNER_WINDOW_MS).toBe(604_800_000);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R1 / §4 AC2 — hook shape
  // ────────────────────────────────────────────────────────────────────────
  describe('shape (R1)', () => {
    it('returns { session, isLoading, dismiss } as documented', () => {
      mockListSessions.mockResolvedValue(listResponse([]));
      const { result } = renderHook(() => useResumableSession());

      // Shape check immediately — keys must exist.
      expect(result.current).toEqual(
        expect.objectContaining({
          session: null,
          isLoading: expect.any(Boolean),
          dismiss: expect.any(Function),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R2 / §4 AC2 — fetch + empty-list path
  // ────────────────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R3 / §4 AC3-AC5 — filter logic
  // ────────────────────────────────────────────────────────────────────────
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
        // 7 days + 1 minute in the past — outside the 7-day window.
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

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R4 / §4 AC3 — picks max updatedAt
  // ────────────────────────────────────────────────────────────────────────
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
      // Intentionally NOT pre-sorted — assert the hook does not rely on BE order.
      mockListSessions.mockResolvedValue(listResponse([older, newer]));
      const { result } = renderHook(() => useResumableSession());
      await waitFor(() => {
        expect(result.current.session).not.toBeNull();
      });
      expect(result.current.session?.id).toBe('sess-newer');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R9 — ResumableSession shape mirrors BE listSessions item
  // ────────────────────────────────────────────────────────────────────────
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
      // Legacy server (pre-T1) does NOT return museumId / lastArtworkTitle.
      const legacy = makeSessionListItem({ id: 'sess-legacy' });
      // Strip the new fields so the hook simulates a legacy payload.
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

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R6-R8 / §4 AC6-AC8 — dismiss-until storage gate
  // ────────────────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R7, R11 / §4 AC9-AC10 — error tolerance
  // ────────────────────────────────────────────────────────────────────────
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
