import type {
  ListAllTicketsInput,
  ListAllTicketsUseCase,
} from '@modules/support/useCase/listAllTickets.useCase';
import type {
  UpdateTicketStatusInput,
  UpdateTicketStatusUseCase,
} from '@modules/support/useCase/updateTicketStatus.useCase';

/**
 * Admin-side facade over the support (tickets) module.
 * See {@link AdminReviewFacade} for rationale.
 */
export class AdminSupportFacade {
  constructor(
    private readonly listAll: ListAllTicketsUseCase,
    private readonly updateStatus: UpdateTicketStatusUseCase,
  ) {}

  /** List support tickets (admin/moderator view) with status + priority filters. */
  list(input: ListAllTicketsInput): ReturnType<ListAllTicketsUseCase['execute']> {
    return this.listAll.execute(input);
  }

  /** Update ticket status / priority / assignment with audit trail. */
  update(input: UpdateTicketStatusInput): ReturnType<UpdateTicketStatusUseCase['execute']> {
    return this.updateStatus.execute(input);
  }
}
