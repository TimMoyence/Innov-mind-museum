import type {
  ExportRowReview,
  ExportRowSessions,
  ExportRowTicket,
  ExportSessionsFilter,
} from '@modules/admin/domain/export/csv-export.types';

export interface ExportSessionsRepository {
  streamChatSessions(filter: ExportSessionsFilter): AsyncIterable<ExportRowSessions>;
}

export interface ExportReviewsRepository {
  streamReviews(): AsyncIterable<ExportRowReview>;
}

export interface ExportTicketsRepository {
  streamSupportTickets(): AsyncIterable<ExportRowTicket>;
}
