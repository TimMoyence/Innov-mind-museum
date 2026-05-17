import type {
  ListAllTicketsInput,
  ListAllTicketsUseCase,
} from '@modules/support/useCase/ticket-admin/listAllTickets.useCase';
import type {
  UpdateTicketStatusInput,
  UpdateTicketStatusUseCase,
} from '@modules/support/useCase/ticket-admin/updateTicketStatus.useCase';

/** See {@link AdminReviewFacade} for rationale. */
export class AdminSupportFacade {
  constructor(
    private readonly listAll: ListAllTicketsUseCase,
    private readonly updateStatus: UpdateTicketStatusUseCase,
  ) {}

  list(input: ListAllTicketsInput): ReturnType<ListAllTicketsUseCase['execute']> {
    return this.listAll.execute(input);
  }

  update(input: UpdateTicketStatusInput): ReturnType<UpdateTicketStatusUseCase['execute']> {
    return this.updateStatus.execute(input);
  }
}
