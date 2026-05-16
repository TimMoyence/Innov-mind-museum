/**
 * Red tests for B1 — `useVisitCarnet` hook (visit notebook list data layer :
 * fetch + filter empty + group by museum + sort + telemetry).
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/B1.md` :
 *
 *   §1.1 (R1-R10) — hook shape + fetch + filter + group + sort + error path.
 *   §1.6 (R34) — carnet_list_viewed_total counter on first non-empty render.
 *   §4 (AC1-AC7, AC14) — invariants for groups, empty state, error state.
 *
 * Key invariants :
 *   - Hook returns `{ isLoading, error, groups, refresh }`.
 *   - Calls `chatApi.listSessions({ limit: 50 })` exactly once on mount.
 *   - Filters out sessions with `messageCount === 0`.
 *   - Groups by `museumId` first, then `museumName`, else `unknown`.
 *   - Sorts groups by max(updatedAt) DESC ; sessions within DESC by updatedAt.
 *   - On API throw : `error: string`, `groups: []`, NO throw to caller.
 *   - `refresh()` re-fires the API call.
 *
 * At baseline (B1 not yet implemented) :
 *   - `@/features/chat/application/useVisitCarnet` does NOT exist
 *     (verified : `ls museum-frontend/features/chat/application/useVisitCarnet*` → 0).
 *     → Jest fails with "Cannot find module" at module load time.
 *
 * Spec : `docs/chat-ux-refonte/specs/B1.md` §1.1 R1-R10 ; §1.6 R34 ; §4 AC1-AC7, AC14.
 */

import '../../helpers/test-utils';
import { act, renderHook, waitFor } from '@testing-library/react-native';

// ── chatApi.listSessions mock — drives BE response ─────────────────────────
const mockListSessions = jest.fn<Promise<unknown>, [unknown]>();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    listSessions: (params: unknown) => mockListSessions(params),
  },
}));

// ── Runtime settings — locale ──────────────────────────────────────────────
jest.mock('@/features/settings/infrastructure/runtimeSettingsStore', () => ({
  useRuntimeSettingsStore: Object.assign(() => ({ defaultLocale: 'en-US' }), {
    getState: () => ({ defaultLocale: 'en-US' }),
  }),
}));

// ── Telemetry counter spy — drives AC14 ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- jest.fn typing requires explicit return slot. Approved-by: green-code-agent-2026-05-15-B1-001
const mockIncrement = jest.fn<void, [string]>();
jest.mock('@/features/chat/application/phase-telemetry', () => ({
  incrementCounter: (name: string) => {
    mockIncrement(name);
  },
}));

// RED ASSERTION — module DOES NOT EXIST at baseline.
import { useVisitCarnet } from '@/features/chat/application/useVisitCarnet';

// ── helpers ────────────────────────────────────────────────────────────────

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
    preview: { text: string; createdAt: string; role: 'user' | 'assistant' | 'system' };
  }> = {},
) {
  const now = Date.now();
  // Spread overrides AFTER defaults so explicit `null` overrides reach the SUT —
  // `?? 12` would silently swallow the `museumId: null` cases that exercise the
  // museumName-fallback branch (R3).
  return {
    id: 'sess-default',
    museumMode: true,
    museumName: 'Louvre' as string | null,
    museumId: 12 as number | null,
    lastArtworkTitle: 'La Joconde' as string | null,
    title: null as string | null,
    createdAt: new Date(now - 3_600_000).toISOString(),
    updatedAt: new Date(now - 3_600_000).toISOString(),
    messageCount: 4,
    locale: 'en-US',
    intent: 'default' as 'default' | 'walk',
    preview: undefined as
      | { text: string; createdAt: string; role: 'user' | 'assistant' | 'system' }
      | undefined,
    ...overrides,
  };
}

function listResponse(sessions: ReturnType<typeof makeSessionListItem>[]) {
  return {
    sessions,
    page: { nextCursor: null, hasMore: false, limit: 50 },
  };
}

describe('useVisitCarnet (B1 — visit notebook list data layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R10 — hook shape
  // ────────────────────────────────────────────────────────────────────────
  describe('hook shape (R10)', () => {
    it('returns { isLoading, error, groups, refresh } as documented', () => {
      mockListSessions.mockResolvedValue(listResponse([]));
      const { result } = renderHook(() => useVisitCarnet());

      expect(result.current).toEqual(
        expect.objectContaining({
          isLoading: expect.any(Boolean),
          error: null,
          groups: expect.any(Array),
          refresh: expect.any(Function),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R1 / §4 AC2 — fetch contract
  // ────────────────────────────────────────────────────────────────────────
  describe('fetch (R1)', () => {
    it('calls chatApi.listSessions exactly once on mount with limit=50', async () => {
      mockListSessions.mockResolvedValue(listResponse([]));
      renderHook(() => useVisitCarnet());

      await waitFor(() => {
        expect(mockListSessions).toHaveBeenCalledTimes(1);
      });
      expect(mockListSessions).toHaveBeenCalledWith({ limit: 50 });
    });

    it('exposes isLoading=true while fetch in flight (R8)', () => {
      mockListSessions.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useVisitCarnet());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.groups).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R2 / §4 AC2 — empty filter
  // ────────────────────────────────────────────────────────────────────────
  describe('filter empty sessions (R2, AC2)', () => {
    it('filters out sessions with messageCount === 0', async () => {
      mockListSessions.mockResolvedValue(
        listResponse([
          makeSessionListItem({ id: 'sess-empty', messageCount: 0 }),
          makeSessionListItem({ id: 'sess-keep', messageCount: 5 }),
        ]),
      );

      const { result } = renderHook(() => useVisitCarnet());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const allIds = result.current.groups.flatMap((g) => g.sessions.map((s) => s.id));
      expect(allIds).toContain('sess-keep');
      expect(allIds).not.toContain('sess-empty');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R3-R4 / §4 AC1 — group + sort
  // ────────────────────────────────────────────────────────────────────────
  describe('grouping and sorting (R3, R4, AC1)', () => {
    it('groups by museumId then museumName, sorts groups by max(updatedAt) DESC', async () => {
      // s3 (Orsay, 22 apr) > s1 (Louvre, 21 apr) > s2 (Louvre, 20 apr) > s4 (Unknown, 19 apr)
      mockListSessions.mockResolvedValue(
        listResponse([
          makeSessionListItem({
            id: 's1',
            museumId: 12,
            museumName: 'Louvre',
            updatedAt: '2026-04-21T12:00:00.000Z',
          }),
          makeSessionListItem({
            id: 's2',
            museumId: 12,
            museumName: 'Louvre',
            updatedAt: '2026-04-20T12:00:00.000Z',
          }),
          makeSessionListItem({
            id: 's3',
            museumId: 14,
            museumName: 'Orsay',
            updatedAt: '2026-04-22T12:00:00.000Z',
          }),
          makeSessionListItem({
            id: 's4',
            museumId: null,
            museumName: null,
            updatedAt: '2026-04-19T12:00:00.000Z',
          }),
        ]),
      );

      const { result } = renderHook(() => useVisitCarnet());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const groups = result.current.groups;
      // 3 groups : Orsay, Louvre, Unknown — Orsay first
      expect(groups.length).toBe(3);
      expect(groups[0]?.museumKey).toBe('museumId:14');
      expect(groups[0]?.sessions.map((s) => s.id)).toEqual(['s3']);

      // Louvre second, sessions DESC inside
      expect(groups[1]?.museumKey).toBe('museumId:12');
      expect(groups[1]?.sessions.map((s) => s.id)).toEqual(['s1', 's2']);

      // Unknown last
      expect(groups[2]?.museumKey).toBe('unknown');
      expect(groups[2]?.sessions.map((s) => s.id)).toEqual(['s4']);
    });

    it('groups by museumName (case-insensitive trim) when museumId is null', async () => {
      mockListSessions.mockResolvedValue(
        listResponse([
          makeSessionListItem({
            id: 'a',
            museumId: null,
            museumName: '  Louvre  ',
            updatedAt: '2026-04-21T12:00:00.000Z',
          }),
          makeSessionListItem({
            id: 'b',
            museumId: null,
            museumName: 'LOUVRE',
            updatedAt: '2026-04-22T12:00:00.000Z',
          }),
        ]),
      );

      const { result } = renderHook(() => useVisitCarnet());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.groups.length).toBe(1);
      expect(result.current.groups[0]?.museumKey).toMatch(/^museumName:/);
      expect(result.current.groups[0]?.sessions.map((s) => s.id)).toEqual(['b', 'a']);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R7 / §4 AC6 — error path
  // ────────────────────────────────────────────────────────────────────────
  describe('error path (R7, AC6)', () => {
    it('exposes error: string and groups: [] when API throws', async () => {
      mockListSessions.mockRejectedValueOnce(new Error('Network down'));

      const { result } = renderHook(() => useVisitCarnet());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network down');
      expect(result.current.groups).toEqual([]);
    });

    it('does NOT throw to caller on error', () => {
      mockListSessions.mockRejectedValueOnce(new Error('boom'));
      expect(() => renderHook(() => useVisitCarnet())).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R10 — refresh
  // ────────────────────────────────────────────────────────────────────────
  describe('refresh() (R10)', () => {
    it('refresh() re-fires chatApi.listSessions', async () => {
      mockListSessions.mockResolvedValue(listResponse([]));
      const { result } = renderHook(() => useVisitCarnet());
      await waitFor(() => {
        expect(mockListSessions).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockListSessions).toHaveBeenCalledTimes(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.6 R34 / §4 AC14 — telemetry
  // ────────────────────────────────────────────────────────────────────────
  describe('telemetry (R34, AC14)', () => {
    it('increments carnet_list_viewed_total when groups becomes non-empty', async () => {
      mockListSessions.mockResolvedValue(listResponse([makeSessionListItem({ id: 's1' })]));

      const { result } = renderHook(() => useVisitCarnet());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockIncrement).toHaveBeenCalledWith('carnet_list_viewed_total');
    });

    it('does NOT increment when result is empty', async () => {
      mockListSessions.mockResolvedValue(listResponse([]));

      const { result } = renderHook(() => useVisitCarnet());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockIncrement).not.toHaveBeenCalledWith('carnet_list_viewed_total');
    });
  });
});
