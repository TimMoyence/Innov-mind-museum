/**
 * Domain row DTOs + scope filter input for the admin CSV export feature (R2).
 *
 * Each row interface mirrors the columns documented in R2 §1 (R17 / R18 / R19)
 * and the fixture shapes asserted by the tests in
 * `museum-backend/tests/helpers/admin/export.fixtures.ts`.
 */

/** Spec §1 R17 — sessions CSV row. */
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

/** Spec §1 R18 — reviews CSV row. */
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

/** Spec §1 R19 — tickets CSV row. */
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

/** R2 §1 — allowed admin actor roles when invoking an export use case. */
export type ExportActorRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin';

/** Input shape for any of the three export use cases (R2 §3.4 / D4). */
export interface ExportInput {
  actorId: number;
  actorRole: ExportActorRole;
  /** `req.user.museumId` — null for super_admin / visitor. */
  museumScope: number | null;
}

/**
 * Repository-facing filter for the chat-sessions stream (R6 / R7).
 *
 * `scopeMuseumId = null` means "no tenant filter" (super_admin path).
 * For museum_manager + admin the use case fills the integer scope from
 * the authenticated user's `museumId`.
 */
export interface ExportSessionsFilter {
  scopeMuseumId: number | null;
}
