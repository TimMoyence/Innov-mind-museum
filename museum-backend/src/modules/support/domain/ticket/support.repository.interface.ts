import type {
  CreateTicketInput,
  TicketDTO,
  ListTicketsFilters,
  TicketDetailDTO,
  AddTicketMessageInput,
  TicketMessageDTO,
  UpdateTicketInput,
} from './support.types';
import type { PaginatedResult } from '@shared/types/pagination';

export interface ISupportRepository {
  createTicket(input: CreateTicketInput): Promise<TicketDTO>;

  listTickets(filters: ListTicketsFilters): Promise<PaginatedResult<TicketDTO>>;

  /** Returns null if not found. */
  getTicketById(ticketId: string): Promise<TicketDetailDTO | null>;

  /** Atomic: insert message + bump parent ticket's updatedAt. */
  addMessage(input: AddTicketMessageInput): Promise<TicketMessageDTO>;

  /** Returns null if not found. */
  updateTicket(input: UpdateTicketInput): Promise<TicketDTO | null>;

  isTicketOwner(ticketId: string, userId: number): Promise<boolean>;

  /**
   * GDPR Art. 15 / Art. 20 data export. No pagination — a user's own ticket
   * history is bounded. Ordered by createdAt DESC.
   */
  listForUser(userId: number): Promise<TicketDetailDTO[]>;
}
