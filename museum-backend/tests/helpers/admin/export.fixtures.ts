export interface ExportRowSessions {
  id: string;
  user_id: string;
  museum_id: number | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  locale: string | null;
}

export interface ExportRowReview {
  id: string;
  user_id_pseudonym: string;
  user_name: string;
  rating: number;
  comment: string;
  status: string;
  created_at: string;
}

export interface ExportRowTicket {
  id: string;
  user_email_pseudonym: string;
  category: string | null;
  status: string;
  priority: string;
  subject: string;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
}

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
