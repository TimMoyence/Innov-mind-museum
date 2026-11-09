import type { UserMemory } from './userMemory.entity';

export type UserMemoryUpdates = Partial<
  Pick<
    UserMemory,
    | 'preferredExpertise'
    | 'favoritePeriods'
    | 'favoriteArtists'
    | 'museumsVisited'
    | 'totalArtworksDiscussed'
    | 'notableArtworks'
    | 'interests'
    | 'summary'
    | 'sessionCount'
    | 'lastSessionId'
    | 'disabledByUser'
    | 'languagePreference'
    | 'sessionDurationP90Minutes'
  >
>;

export interface RecentSessionAggregate {
  sessionId: string;
  locale: string | null;
  createdAt: Date;
  lastMessageAt: Date | null;
}

export interface UserMemoryRepository {
  getByUserId(userId: number): Promise<UserMemory | null>;

  upsert(userId: number, updates: UserMemoryUpdates): Promise<UserMemory>;

  deleteByUserId(userId: number): Promise<void>;

  getRecentSessionsForUser(userId: number, limit: number): Promise<RecentSessionAggregate[]>;
}
