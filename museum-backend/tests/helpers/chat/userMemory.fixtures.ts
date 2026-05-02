import { UserMemory } from '@modules/chat/domain/userMemory.entity';

import type {
  RecentSessionAggregate,
  UserMemoryRepository,
  UserMemoryUpdates,
} from '@modules/chat/domain/userMemory.repository.interface';

/**
 * Creates a UserMemory entity with sensible defaults.
 * Override any field via the `overrides` parameter.
 * @param overrides
 */
export function makeMemory(overrides: Partial<UserMemory> = {}): UserMemory {
  return Object.assign(new UserMemory(), {
    id: 'mem-uuid',
    userId: 42,
    preferredExpertise: 'beginner',
    favoritePeriods: [],
    favoriteArtists: ['Monet'],
    museumsVisited: ['Louvre'],
    totalArtworksDiscussed: 3,
    notableArtworks: [],
    interests: [],
    summary: null,
    disabledByUser: false,
    sessionCount: 2,
    lastSessionId: 'sess-prev',
    languagePreference: null,
    sessionDurationP90Minutes: null,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

/**
 * In-memory implementation of {@link UserMemoryRepository} for unit tests.
 *
 * Holds a `Map<userId, UserMemory>` plus an injectable `recentSessions`
 * fixture for {@link UserMemoryRepository.getRecentSessionsForUser}. Tests
 * that need recent-session data can pre-populate via the optional
 * constructor argument (see Spec C T1.5+ mergers).
 * @param recentSessions
 */
export function makeInMemoryUserMemoryRepository(
  recentSessions = new Map<number, RecentSessionAggregate[]>(),
): UserMemoryRepository & {
  /** Test-only hook — seed recent-session aggregates for a user. */
  __setRecentSessions(userId: number, rows: RecentSessionAggregate[]): void;
} {
  const store = new Map<number, UserMemory>();
  const recent = recentSessions;

  return {
    async getByUserId(userId: number): Promise<UserMemory | null> {
      return store.get(userId) ?? null;
    },

    async upsert(userId: number, updates: UserMemoryUpdates): Promise<UserMemory> {
      const existing = store.get(userId);
      const next = makeMemory({ ...(existing ?? {}), userId, ...updates });
      store.set(userId, next);
      return next;
    },

    async deleteByUserId(userId: number): Promise<void> {
      store.delete(userId);
      recent.delete(userId);
    },

    async getRecentSessionsForUser(
      userId: number,
      limit: number,
    ): Promise<RecentSessionAggregate[]> {
      const rows = recent.get(userId) ?? [];
      return rows.slice(0, limit);
    },

    __setRecentSessions(userId: number, rows: RecentSessionAggregate[]) {
      recent.set(userId, rows);
    },
  };
}

/**
 * Capture-style stub of {@link UserMemoryRepository} used by the merger unit
 * tests (Spec C T1.5/T1.6/T1.7). Unlike {@link makeInMemoryUserMemoryRepository}
 * (which keeps a Map-backed store), this stub:
 * - returns a single fixed `UserMemory` from {@link makeMemory} on `getByUserId`,
 *   shaped by the optional `initial` overrides;
 * - records every `upsert` call as `[userId, UserMemoryUpdates]` tuples on
 *   `upsertCalls` so tests can assert against the *exact* updates payload
 *   rather than the round-tripped entity;
 * - exposes a settable `recentSessions` property to seed
 *   {@link UserMemoryRepository.getRecentSessionsForUser} for the locale-mode
 *   and session-duration-p90 mergers.
 * @param initial - Partial UserMemory shape returned by `getByUserId`.
 *   When omitted, returns `null` (no memory yet).
 */
export function makeUserMemoryRepoStub(initial?: Partial<UserMemory>): UserMemoryRepository & {
  /** Captured `[userId, updates]` pairs from every `upsert` call, in order. */
  upsertCalls: [number, UserMemoryUpdates][];
  /** Mutable seed for `getRecentSessionsForUser` (defaults to empty array). */
  recentSessions: RecentSessionAggregate[];
} {
  const upsertCalls: [number, UserMemoryUpdates][] = [];
  const memory = initial ? makeMemory(initial) : null;
  const stub = {
    upsertCalls,
    recentSessions: [] as RecentSessionAggregate[],

    async getByUserId(_userId: number): Promise<UserMemory | null> {
      return memory;
    },

    async upsert(userId: number, updates: UserMemoryUpdates): Promise<UserMemory> {
      upsertCalls.push([userId, updates]);
      return makeMemory({ ...(memory ?? {}), userId, ...updates });
    },

    async deleteByUserId(_userId: number): Promise<void> {
      /* no-op for stub */
    },

    async getRecentSessionsForUser(
      _userId: number,
      limit: number,
    ): Promise<RecentSessionAggregate[]> {
      return stub.recentSessions.slice(0, limit);
    },
  };
  return stub;
}
