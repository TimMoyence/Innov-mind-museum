/**
 * R2 — Test factories for admin CSV-export row DTOs.
 *
 * Production types live in (R2 §0.3) :
 *   museum-backend/src/modules/admin/domain/export/csv-export.types.ts
 *
 * At baseline `a77e48aa` the production file does NOT exist yet ; the parallel
 * type declarations below let test files typecheck against the spec'd row
 * shape without referencing the green-code-agent's not-yet-written module.
 *
 * Per CLAUDE.md §Test Discipline — DRY Factories: inline domain objects in
 * tests are forbidden. Tests for the admin export module MUST use these.
 */

// ── Spec §1 R17 — sessions row shape ─────────────────────────────────────
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

// ── Spec §1 R18 — reviews row shape ──────────────────────────────────────
export interface ExportRowReview {
  id: string;
  /** ALWAYS pseudonymised (sha256-trunc16) — review authors are end-users. */
  user_id_pseudonym: string;
  user_name: string;
  rating: number;
  /** Raw text with R15 / N8 injection escaping at write time. */
  comment: string;
  status: string;
  created_at: string;
}

// ── Spec §1 R19 — tickets row shape ──────────────────────────────────────
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

/**
 * Builds a valid chat-session export row (R17).
 * @param overrides - Partial row override; merged on top of defaults.
 * @returns A fully-formed `ExportRowSessions` with overrides applied.
 */
export function makeExportSessionRow(
  overrides: Partial<ExportRowSessions> = {},
): ExportRowSessions {
  return {
    id: 'sess-001',
    user_id: '42',
    museum_id: 7,
    started_at: '2026-05-01T10:00:00.000Z',
    ended_at: '2026-05-01T10:15:00.000Z',
    message_count: 12,
    locale: 'fr',
    ...overrides,
  };
}

/**
 * Builds a valid review export row (R18).
 * @param overrides - Partial row override; merged on top of defaults.
 * @returns A fully-formed `ExportRowReview` with overrides applied.
 */
export function makeExportReviewRow(overrides: Partial<ExportRowReview> = {}): ExportRowReview {
  return {
    id: 'rev-001',
    user_id_pseudonym: 'a1b2c3d4e5f60718',
    user_name: 'Jane Doe',
    rating: 5,
    comment: 'Loved the visit.',
    status: 'approved',
    created_at: '2026-05-01T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * Builds a valid support-ticket export row (R19).
 * @param overrides - Partial row override; merged on top of defaults.
 * @returns A fully-formed `ExportRowTicket` with overrides applied.
 */
export function makeExportTicketRow(overrides: Partial<ExportRowTicket> = {}): ExportRowTicket {
  return {
    id: 'tkt-001',
    user_email_pseudonym: '9a8b7c6d5e4f3210',
    category: 'bug',
    status: 'open',
    priority: 'medium',
    subject: 'Issue with audio playback',
    assigned_to: null,
    created_at: '2026-05-01T08:00:00.000Z',
    updated_at: '2026-05-01T08:30:00.000Z',
    ...overrides,
  };
}
