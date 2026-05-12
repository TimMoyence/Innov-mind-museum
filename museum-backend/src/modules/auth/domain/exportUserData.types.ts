/**
 * Domain types and ports for the GDPR Article 15 (right of access) +
 * Article 20 (data portability) data-subject access request (DSAR) flow.
 *
 * The export aggregates every personal-data record the user is entitled to
 * receive: profile, consent history, chat sessions + messages, public reviews,
 * support tickets (and their messages). Saved artworks live only on-device
 * (mobile local storage) and are therefore not part of this server-side export.
 */

/** Port for accessing chat data from the auth module (lazy-bound to avoid circular init). */
export interface ChatDataExportPort {
  getAllUserData(userId: number): Promise<UserChatExportData>;
}

/** Port for accessing public-review data from the auth module (lazy-bound). */
export interface ReviewDataExportPort {
  listForUser(userId: number): Promise<UserReviewExportEntry[]>;
}

/** Port for accessing support-ticket data from the auth module (lazy-bound). */
export interface SupportDataExportPort {
  listForUser(userId: number): Promise<UserSupportTicketExportEntry[]>;
}

/** Public review row, scoped to a single user (DSAR-safe shape). */
export interface UserReviewExportEntry {
  id: string;
  rating: number;
  comment: string;
  status: string;
  userName: string;
  createdAt: string;
}

/** Support ticket + nested messages, scoped to a single user (DSAR-safe shape). */
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

/** Chat sessions and messages owned by the user. */
export interface UserChatExportData {
  sessions: {
    id: string;
    locale?: string | null;
    museumMode: boolean;
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
    }[];
  }[];
}

/** Single recorded consent grant (history-preserving — revoked rows still appear). */
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
  schemaVersion: '1';
  user: {
    id: number;
    email: string;
    role: string;
    firstname: string | null;
    lastname: string | null;
    locale: string | null;
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
}
