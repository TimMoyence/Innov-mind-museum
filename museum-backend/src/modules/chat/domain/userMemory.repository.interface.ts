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
    | 'languagePreference'
    | 'sessionDurationP90Minutes'
  >
>;

/**
 * Aggregated recent-session row used by the personalization mergers
 * (locale mode merger, session-duration p90 merger). Computed by joining
 * `chat_sessions` to its newest `chat_messages` row per session.
 */
export interface RecentSessionAggregate {
  sessionId: string;
  locale: string;
  createdAt: Date;
  /** null when the session has no messages yet. */
  lastMessageAt: Date | null;
}

/** Port for user-memory persistence operations. */
export interface UserMemoryRepository {
  /** Retrieve the memory row for a given user, or `null` if none exists. */
  getByUserId(userId: number): Promise<UserMemory | null>;

  /** Insert or update the memory row for a given user. Returns the persisted entity. */
  upsert(userId: number, updates: UserMemoryUpdates): Promise<UserMemory>;

  /** Hard-delete the memory row for a given user. */
  deleteByUserId(userId: number): Promise<void>;

  /**
   * Returns the last `limit` chat sessions for a user, each annotated with
   * its locale + most-recent message timestamp. Used by the locale-mode
   * and session-duration-p90 mergers in `UserMemoryService`.
   */
  getRecentSessionsForUser(userId: number, limit: number): Promise<RecentSessionAggregate[]>;
}
