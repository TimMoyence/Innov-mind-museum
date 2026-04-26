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

/** Port for support ticket data access. */
export interface ISupportRepository {
  /** Create a new support ticket. */
  createTicket(input: CreateTicketInput): Promise<TicketDTO>;

  /** List tickets with optional filters and pagination. */
  listTickets(filters: ListTicketsFilters): Promise<PaginatedResult<TicketDTO>>;

  /** Get a single ticket with all its messages. Returns null if not found. */
  getTicketById(ticketId: string): Promise<TicketDetailDTO | null>;

  /** Add a message to a ticket and bump its updatedAt. */
  addMessage(input: AddTicketMessageInput): Promise<TicketMessageDTO>;

  /** Update ticket fields (status, priority, assignedTo). Returns null if not found. */
  updateTicket(input: UpdateTicketInput): Promise<TicketDTO | null>;

  /** Check whether a user owns a ticket. */
  isTicketOwner(ticketId: string, userId: number): Promise<boolean>;

  /**
   * List every ticket owned by a user, each with its full message thread,
   * ordered by createdAt DESC. Used by the GDPR Art. 15 / Art. 20 data
   * export — no pagination because a user's own ticket history is bounded.
   */
  listForUser(userId: number): Promise<TicketDetailDTO[]>;
}
