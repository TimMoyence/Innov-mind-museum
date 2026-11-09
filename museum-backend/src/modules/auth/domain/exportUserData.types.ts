export interface ChatDataExportPort {
  getAllUserData(userId: number): Promise<UserChatExportData>;
}

export interface ReviewDataExportPort {
  listForUser(userId: number): Promise<UserReviewExportEntry[]>;
}

export interface SupportDataExportPort {
  listForUser(userId: number): Promise<UserSupportTicketExportEntry[]>;
}

export interface UserMemoryExportPort {
  getForUser(userId: number): Promise<UserMemorySource | null>;
}

export interface AuditLogExportPort {
  listForUser(userId: number): Promise<AuditLogSource[]>;
}

export interface MessageFeedbackExportPort {
  listForUser(userId: number): Promise<MessageFeedbackSource[]>;
}

export interface MessageReportExportPort {
  listForUser(userId: number): Promise<MessageReportSource[]>;
}

export interface SocialAccountExportPort {
  listForUser(userId: number): Promise<SocialAccountSource[]>;
}

type DateLike = Date | string;
type NullableDateLike = Date | string | null;

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

export interface UserChatExportData {
  sessions: {
    id: string;
    locale?: string | null;
    museumMode: boolean;
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

export interface UserConsentExportEntry {
  scope: string;
  version: string;
  source: string;
  grantedAt: string;
  revokedAt: string | null;
}

export interface UserExportPayload {
  exportedAt: string;
  schemaVersion: '3';
  user: {
    id: number;
    email: string;
    role: string;
    firstname: string | null;
    lastname: string | null;
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
  userMemory: UserMemoryExportEntry | null;
  auditLogs: UserAuditLogExportEntry[];
  messageFeedback: UserMessageFeedbackExportEntry[];
  messageReports: UserMessageReportExportEntry[];
  socialAccounts: UserSocialAccountExportEntry[];
}
