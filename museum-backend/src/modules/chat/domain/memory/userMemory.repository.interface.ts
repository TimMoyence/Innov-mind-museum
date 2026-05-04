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
  /**
   * Session locale (e.g. `'fr'`, `'en-US'`). Nullable because
   * `chat_sessions.locale` is itself nullable at the entity/DB level — the
   * column is `varchar(32) NULL` and `ChatSession.locale` is typed
   * `string | null`. Mergers (e.g. `mergeLanguagePreference` in T1.6) MUST
   * filter out null entries from their tally rather than push the
   * not-null assumption down into the aggregate layer.
   */
  locale: string | null;
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
