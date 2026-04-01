export {
  createTicketUseCase,
  submitSupportContactUseCase,
  listUserTicketsUseCase,
  getTicketDetailUseCase,
  addTicketMessageUseCase,
  listAllTicketsUseCase,
  updateTicketStatusUseCase,
} from './useCase';
export type { ISupportRepository } from './domain/support.repository.interface';
export type {
  TicketDTO,
  TicketMessageDTO,
  TicketDetailDTO,
  TicketStatus,
  TicketPriority,
  CreateTicketInput,
  AddTicketMessageInput,
  UpdateTicketInput,
  ListTicketsFilters,
} from './domain/support.types';
