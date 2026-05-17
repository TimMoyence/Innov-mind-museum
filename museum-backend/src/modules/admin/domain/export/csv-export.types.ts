// Admin CSV export domain rows + scope filter (R2). Columns spec'd in R2 §1
// (R17/R18/R19); fixtures in tests/helpers/admin/export.fixtures.ts.

/** R2 §1 R17 */
export interface ExportRowSessions {
  id: string;
  /** Raw integer for super_admin ; sha256-trunc16 for museum_manager + admin. */
  user_id: string;
  museum_id: number | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  locale: string | null;
}

/** R2 §1 R18 */
export interface ExportRowReview {
  id: string;
  /** ALWAYS pseudonymised — review authors are end-users. */
  user_id_pseudonym: string;
  user_name: string;
  rating: number;
  /** Raw text with N8 injection escaping applied at write time. */
  comment: string;
  status: string;
  created_at: string;
}

/** R2 §1 R19 */
export interface ExportRowTicket {
  id: string;
  /** ALWAYS pseudonymised — including for super_admin (D6 + Q7). */
  user_email_pseudonym: string;
  category: string | null;
  status: string;
  priority: string;
  subject: string;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
}

export type ExportActorRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin';

/** R2 §3.4 / D4 */
export interface ExportInput {
  actorId: number;
  actorRole: ExportActorRole;
  /** `req.user.museumId` — null for super_admin / visitor. */
  museumScope: number | null;
}

/**
 * R6/R7 — `scopeMuseumId = null` means "no tenant filter" (super_admin path).
 * For museum_manager + admin the use case fills it from `req.user.museumId`.
 */
export interface ExportSessionsFilter {
  scopeMuseumId: number | null;
}
