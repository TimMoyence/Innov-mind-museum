/**
 * Domain types + ports for GDPR Article 15 (right of access) + Article 20
 * (data portability) DSAR flow. Saved artworks live only on-device (mobile
 * local storage) and are NOT part of this server-side export.
 *
 * B3 (2026-05-21) — `schemaVersion` bumped `'1'` → `'2'`: adds UserMemory, the
 * subject's own audit_logs, message_feedback, message_reports, social_accounts,
 * api_keys (non-secret), plus previously-omitted User + ChatSession columns.
 * Secrets/credentials are excluded by EXPLICIT per-field allow-listing (never
 * entity spread) so a future column cannot leak by accident (R14, design D4).
 *
 * Cycle 4 / B-03 (2026-05-26) — `schemaVersion` bumped `'2'` → `'3'`: each
 * exported message now nests its recognised artworks (`artworkMatches[]`,
 * ArtworkMatch), closing the Art.15/17/20 asymmetry (erasure already cascades
 * them). Same allow-list discipline — only the business columns
 * `{ artworkId, title, artist, confidence, source, room, createdAt }`, never
 * the internal uuid PK nor the FK.
 */

/** Lazy-bound to avoid circular init. */
export interface ChatDataExportPort {
  getAllUserData(userId: number): Promise<UserChatExportData>;
}

/** Lazy-bound. */
export interface ReviewDataExportPort {
  listForUser(userId: number): Promise<UserReviewExportEntry[]>;
}

/** Lazy-bound. */
export interface SupportDataExportPort {
  listForUser(userId: number): Promise<UserSupportTicketExportEntry[]>;
}

// ─── B3 new export ports (lazy-bound, read-only) ────────────────────────────

/** UserMemory (chat module) — at most one record per user. */
export interface UserMemoryExportPort {
  getForUser(userId: number): Promise<UserMemorySource | null>;
}

/** The subject's own audit rows (`actor_id = userId`). */
export interface AuditLogExportPort {
  listForUser(userId: number): Promise<AuditLogSource[]>;
}

/** message_feedback rows owned by the user. */
export interface MessageFeedbackExportPort {
  listForUser(userId: number): Promise<MessageFeedbackSource[]>;
}

/** message_reports rows owned by the user (excludes moderator fields, D7). */
export interface MessageReportExportPort {
  listForUser(userId: number): Promise<MessageReportSource[]>;
}

/** social_accounts rows owned by the user (no secrets on the entity). */
export interface SocialAccountExportPort {
  listForUser(userId: number): Promise<SocialAccountSource[]>;
}

/** api_keys owned by the user. Source rows may carry `hash`/`salt`; the use case strips them. */
export interface ApiKeyExportPort {
  listForUser(userId: number): Promise<ApiKeySource[]>;
}

// ─── Source shapes (what the ports return — superset, may carry secrets) ────

/** A timestamp coming off an entity — `Date` from TypeORM, `string` if pre-serialized. */
type DateLike = Date | string;
/** Nullable timestamp. */
type NullableDateLike = Date | string | null;

/**
 * The fields the use case reads off the UserMemory source. Declared as the
 * subset actually exported so the mapping is allow-list by construction.
 */
export interface UserMemorySource {
  preferredExpertise?: string | null;
  favoritePeriods?: string[] | null;
  favoriteArtists?: string[] | null;
  museumsVisited?: string[] | null;
  totalArtworksDiscussed?: number | null;
  notableArtworks?: unknown[] | null;
  interests?: string[] | null;
  summary?: string | null;
  disabledByUser?: boolean | null;
  sessionCount?: number | null;
  languagePreference?: string | null;
  createdAt?: NullableDateLike;
  updatedAt?: NullableDateLike;
}

export interface AuditLogSource {
  action: string;
  actorType: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  requestId: string | null;
  createdAt: DateLike;
  // prevHash / rowHash MAY be present on the source entity — never exported.
}

export interface MessageFeedbackSource {
  messageId: string;
  value: string;
  createdAt: DateLike;
}

export interface MessageReportSource {
  messageId: string;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: DateLike;
}

export interface SocialAccountSource {
  provider: string;
  providerUserId: string;
  email: string | null;
  createdAt: DateLike;
}

export interface ApiKeySource {
  id: number;
  prefix: string;
  name: string;
  museumId?: number | null;
  expiresAt: NullableDateLike;
  lastUsedAt: NullableDateLike;
  isActive: boolean;
  createdAt: DateLike;
  // hash / salt MAY be present on the source entity — never exported.
}

// ─── Exported entry shapes ──────────────────────────────────────────────────

export interface UserReviewExportEntry {
  id: string;
  rating: number;
  comment: string;
  status: string;
  userName: string;
  createdAt: string;
}

export interface UserSupportTicketExportEntry {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  messages: {
    id: string;
    senderRole: string;
    text: string;
    createdAt: string;
  }[];
}

export interface UserMemoryExportEntry {
  preferredExpertise: string | null;
  favoritePeriods: string[];
  favoriteArtists: string[];
  museumsVisited: string[];
  totalArtworksDiscussed: number;
  notableArtworks: unknown[];
  interests: string[];
  summary: string | null;
  disabledByUser: boolean;
  sessionCount: number;
  languagePreference: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** No `prevHash` / `rowHash` — chain internals are excluded (R14). */
export interface UserAuditLogExportEntry {
  action: string;
  actorType: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface UserMessageFeedbackExportEntry {
  messageId: string;
  value: string;
  createdAt: string;
}

/** No `reviewedBy` / `reviewerNotes` / `reviewedAt` — third-party moderator data (D7). */
export interface UserMessageReportExportEntry {
  messageId: string;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: string;
}

export interface UserSocialAccountExportEntry {
  provider: string;
  providerUserId: string;
  email: string | null;
  createdAt: string;
}

/** No `hash` / `salt` — security credentials are excluded (R14). */
export interface UserApiKeyExportEntry {
  id: number;
  prefix: string;
  name: string;
  museumId: number | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface UserChatExportData {
  sessions: {
    id: string;
    locale?: string | null;
    museumMode: boolean;
    // B3 — previously-omitted ChatSession columns (R13).
    intent?: string | null;
    museumId?: number | null;
    coordinates?: { lat: number; lng: number } | null;
    visitContext?: unknown;
    currentRoom?: string | null;
    currentArtworkId?: string | null;
    title?: string | null;
    museumName?: string | null;
    createdAt: string;
    updatedAt: string;
    messages: {
      id: string;
      role: string;
      text?: string | null;
      imageRef?: string | null;
      audioUrl?: string | null;
      createdAt: string;
      metadata?: Record<string, unknown> | null;
      // Cycle 4 (DSAR Art.15/20 — B-03) — recognised artworks (ArtworkMatch)
      // nested in each message (design D-1). Allow-listed business fields only
      // (D-2): never the internal uuid PK nor the FK. `[]` when none (EARS-3).
      artworkMatches: {
        artworkId: string | null;
        title: string | null;
        artist: string | null;
        confidence: number;
        source: string | null;
        room: string | null;
        createdAt: string;
      }[];
    }[];
  }[];
}

/** History-preserving — revoked rows still appear. */
export interface UserConsentExportEntry {
  scope: string;
  version: string;
  source: string;
  grantedAt: string;
  revokedAt: string | null;
}

/** GDPR Art. 15 / Art. 20 export payload. */
export interface UserExportPayload {
  exportedAt: string;
  schemaVersion: '3';
  user: {
    id: number;
    email: string;
    role: string;
    firstname: string | null;
    lastname: string | null;
    // B3 — `defaultLocale` replaces the former `locale: null` placeholder (R13).
    defaultLocale: string;
    tier: string;
    dateOfBirth: string | null;
    contentPreferences: string[];
    ttsVoice: string | null;
    notifyOnReviewModeration: boolean;
    defaultMuseumMode: boolean;
    guideLevel: string;
    dataMode: string;
    audioDescriptionMode: boolean;
    suspended: boolean;
    museumId: number | null;
    emailVerified: boolean;
    onboardingCompleted: boolean;
    createdAt: string;
    updatedAt: string;
  };
  consent: UserConsentExportEntry[];
  chatSessions: UserChatExportData['sessions'];
  savedArtworks: never[];
  reviews: UserReviewExportEntry[];
  supportTickets: UserSupportTicketExportEntry[];
  // B3 — new personal-data categories (R12).
  userMemory: UserMemoryExportEntry | null;
  auditLogs: UserAuditLogExportEntry[];
  messageFeedback: UserMessageFeedbackExportEntry[];
  messageReports: UserMessageReportExportEntry[];
  socialAccounts: UserSocialAccountExportEntry[];
  apiKeys: UserApiKeyExportEntry[];
}
