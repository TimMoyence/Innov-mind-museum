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

export type ExportActorRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin';

export interface ExportInput {
  actorId: number;
  actorRole: ExportActorRole;
  museumScope: number | null;
}

export interface ExportSessionsFilter {
  scopeMuseumId: number | null;
}
