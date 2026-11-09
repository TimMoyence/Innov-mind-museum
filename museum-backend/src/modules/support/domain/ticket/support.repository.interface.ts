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

  getTicketById(ticketId: string): Promise<TicketDetailDTO | null>;

  addMessage(input: AddTicketMessageInput): Promise<TicketMessageDTO>;

  updateTicket(input: UpdateTicketInput): Promise<TicketDTO | null>;

  isTicketOwner(ticketId: string, userId: number): Promise<boolean>;

  listForUser(userId: number): Promise<TicketDetailDTO[]>;
}
