import type { PaginationParams } from '@shared/types/pagination';

// ─── Enums ───

/**
 *
 */
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
/**
 *
 */
export type TicketPriority = 'low' | 'medium' | 'high';

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high'];

// ─── Inputs ───

/**
 *
 */
export interface CreateTicketInput {
  userId: number;
  subject: string;
  description: string;
  priority?: TicketPriority;
  category?: string;
}

/**
 *
 */
export interface AddTicketMessageInput {
  ticketId: string;
  senderId: number;
  senderRole: string;
  text: string;
}

/**
 *
 */
export interface UpdateTicketInput {
  ticketId: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: number | null;
}

/**
 *
 */
export interface ListTicketsFilters {
  userId?: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  pagination: PaginationParams;
}

// ─── DTOs ───

/**
 *
 */
export interface TicketDTO {
  id: string;
  userId: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  assignedTo: number | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

/**
 *
 */
export interface TicketMessageDTO {
  id: string;
  ticketId: string;
  senderId: number;
  senderRole: string;
  text: string;
  createdAt: string;
}

/**
 *
 */
export interface TicketDetailDTO extends TicketDTO {
  messages: TicketMessageDTO[];
}
