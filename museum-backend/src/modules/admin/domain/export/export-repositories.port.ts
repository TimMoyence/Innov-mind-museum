/**
 * Domain ports for the admin CSV-export read models. Relocated from the
 * `useCase/export/*` files so the infrastructure adapter
 * (`adapters/secondary/pg/admin-export.repository.pg.ts`) implements DOMAIN
 * ports rather than importing the interfaces from the application layer
 * (C1 close, run 2026-06-04-hexagonal-boundaries-enforcement). The use-cases
 * re-export each port so their public surface + constructor signatures are
 * unchanged (spec R5).
 */
import type {
  ExportRowReview,
  ExportRowSessions,
  ExportRowTicket,
  ExportSessionsFilter,
} from '@modules/admin/domain/export/csv-export.types';

/** Async stream so route pipes to HTTP response without buffering (R13). */
export interface ExportSessionsRepository {
  streamChatSessions(filter: ExportSessionsFilter): AsyncIterable<ExportRowSessions>;
}

/** Reviews are unscoped (Q1 BLOCKER: no `museum_id` column). */
export interface ExportReviewsRepository {
  streamReviews(): AsyncIterable<ExportRowReview>;
}

/** Tickets are unscoped (Q1 BLOCKER: no `museum_id` column). */
export interface ExportTicketsRepository {
  streamSupportTickets(): AsyncIterable<ExportRowTicket>;
}
