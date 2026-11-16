import type { PaginationParams } from '@shared/types/pagination';

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface CreateTicketInput {
  userId: number;
  subject: string;
  description: string;
  priority?: TicketPriority;
  category?: string;
  museumId?: number | null;
}

export interface AddTicketMessageInput {
  ticketId: string;
  senderId: number;
  senderRole: string;
  text: string;
}

export interface UpdateTicketInput {
  ticketId: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: number | null;
}

export interface ListTicketsFilters {
  userId?: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  museumId?: number | null;
  pagination: PaginationParams;
}

export interface TicketDTO {
  id: string;
  userId: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  assignedTo: number | null;
  museumId: number | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface TicketMessageDTO {
  id: string;
  ticketId: string;
  senderId: number;
  senderRole: string;
  text: string;
  createdAt: string;
}

export interface TicketDetailDTO extends TicketDTO {
  messages: TicketMessageDTO[];
}

export interface TicketMessageView extends TicketMessageDTO {
  fromStaff: boolean;
}

export interface TicketDetailView extends TicketDTO {
  messages: TicketMessageView[];
}
