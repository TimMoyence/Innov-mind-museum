/**
 * Domain types + ports for GDPR Article 15 (right of access) + Article 20
 * (data portability) DSAR flow. Saved artworks live only on-device (mobile
 * local storage) and are NOT part of this server-side export.
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
