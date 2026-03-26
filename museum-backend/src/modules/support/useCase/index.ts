/**
 * Support module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { AddTicketMessageUseCase } from './addTicketMessage.useCase';
import { CreateTicketUseCase } from './createTicket.useCase';
import { GetTicketDetailUseCase } from './getTicketDetail.useCase';
import { ListAllTicketsUseCase } from './listAllTickets.useCase';
import { ListUserTicketsUseCase } from './listUserTickets.useCase';
import { UpdateTicketStatusUseCase } from './updateTicketStatus.useCase';
import { SupportRepositoryPg } from '../adapters/secondary/support.repository.pg';

const supportRepository = new SupportRepositoryPg();

export const createTicketUseCase = new CreateTicketUseCase(supportRepository);
export const listUserTicketsUseCase = new ListUserTicketsUseCase(supportRepository);
export const getTicketDetailUseCase = new GetTicketDetailUseCase(supportRepository);
export const addTicketMessageUseCase = new AddTicketMessageUseCase(supportRepository);
export const listAllTicketsUseCase = new ListAllTicketsUseCase(supportRepository);
export const updateTicketStatusUseCase = new UpdateTicketStatusUseCase(supportRepository);
