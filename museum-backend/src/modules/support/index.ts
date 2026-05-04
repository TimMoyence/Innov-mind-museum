export {
  createTicketUseCase,
  submitSupportContactUseCase,
  listUserTicketsUseCase,
  getTicketDetailUseCase,
  addTicketMessageUseCase,
  listAllTicketsUseCase,
  updateTicketStatusUseCase,
} from './useCase';
export type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
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
} from '@modules/support/domain/ticket/support.types';
