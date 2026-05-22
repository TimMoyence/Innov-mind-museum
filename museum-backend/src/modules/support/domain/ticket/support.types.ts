import type { PaginationParams } from '@shared/types/pagination';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high'];

export interface CreateTicketInput {
  userId: number;
  subject: string;
  description: string;
  priority?: TicketPriority;
  category?: string;
  /**
   * B2B multi-tenant scope (Wave B C7 / R-C7a / R-C7c). Threaded from the
   * authenticated user's JWT `museumId` claim. `null`/undefined for tickets
   * not attached to a specific tenant museum.
   */
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
  /**
   * B2B multi-tenant scope (Wave B C7 / R-C7c). When set, only tickets
   * belonging to this museum are returned (OWASP API3 / BOLA guard).
   */
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
  /** B2B multi-tenant scope (Wave B C7). Null for tickets unscoped to a tenant. */
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
