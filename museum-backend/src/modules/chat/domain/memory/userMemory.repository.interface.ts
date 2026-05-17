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

/**
 * Used by personalization mergers (locale mode, session-duration p90). Computed
 * by joining `chat_sessions` to its newest `chat_messages` row per session.
 */
export interface RecentSessionAggregate {
  sessionId: string;
  /**
   * Nullable because `chat_sessions.locale` is `varchar(32) NULL`. Mergers
   * (e.g. `mergeLanguagePreference` T1.6) MUST filter out null entries rather
   * than push not-null assumption into the aggregate layer.
   */
  locale: string | null;
  createdAt: Date;
  /** null when the session has no messages yet. */
  lastMessageAt: Date | null;
}

export interface UserMemoryRepository {
  getByUserId(userId: number): Promise<UserMemory | null>;

  upsert(userId: number, updates: UserMemoryUpdates): Promise<UserMemory>;

  /** Hard delete. */
  deleteByUserId(userId: number): Promise<void>;

  /**
   * Last `limit` sessions annotated with locale + most-recent message timestamp.
   * Used by locale-mode + session-duration-p90 mergers in `UserMemoryService`.
   */
  getRecentSessionsForUser(userId: number, limit: number): Promise<RecentSessionAggregate[]>;
}
