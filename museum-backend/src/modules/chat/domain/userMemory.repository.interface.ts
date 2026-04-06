import type { UserMemory } from './userMemory.entity';

/** Partial update payload for user memory fields. */
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
  >
>;

/** Port for user-memory persistence operations. */
export interface UserMemoryRepository {
  /** Retrieve the memory row for a given user, or `null` if none exists. */
  getByUserId(userId: number): Promise<UserMemory | null>;

  /** Insert or update the memory row for a given user. Returns the persisted entity. */
  upsert(userId: number, updates: UserMemoryUpdates): Promise<UserMemory>;

  /** Hard-delete the memory row for a given user. */
  deleteByUserId(userId: number): Promise<void>;
}
