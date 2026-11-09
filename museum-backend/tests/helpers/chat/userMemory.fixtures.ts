import { UserMemory } from '@modules/chat/domain/memory/userMemory.entity';

import type {
  RecentSessionAggregate,
  UserMemoryRepository,
  UserMemoryUpdates,
} from '@modules/chat/domain/memory/userMemory.repository.interface';

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

export function makeInMemoryUserMemoryRepository(
  recentSessions = new Map<number, RecentSessionAggregate[]>(),
): UserMemoryRepository & {
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

export function makeUserMemoryRepoStub(initial?: Partial<UserMemory>): UserMemoryRepository & {
  upsertCalls: [number, UserMemoryUpdates][];
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

    async deleteByUserId(_userId: number): Promise<void> {},

    async getRecentSessionsForUser(
      _userId: number,
      limit: number,
    ): Promise<RecentSessionAggregate[]> {
      return stub.recentSessions.slice(0, limit);
    },
  };
  return stub;
}
