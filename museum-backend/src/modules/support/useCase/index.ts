/**
 * Support module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { SupportRepositoryPg } from '../adapters/secondary/support.repository.pg';
import { CreateTicketUseCase } from './createTicket.useCase';
import { ListUserTicketsUseCase } from './listUserTickets.useCase';
import { GetTicketDetailUseCase } from './getTicketDetail.useCase';
import { AddTicketMessageUseCase } from './addTicketMessage.useCase';
import { ListAllTicketsUseCase } from './listAllTickets.useCase';
import { UpdateTicketStatusUseCase } from './updateTicketStatus.useCase';

const supportRepository = new SupportRepositoryPg();

export const createTicketUseCase = new CreateTicketUseCase(supportRepository);
export const listUserTicketsUseCase = new ListUserTicketsUseCase(supportRepository);
export const getTicketDetailUseCase = new GetTicketDetailUseCase(supportRepository);
export const addTicketMessageUseCase = new AddTicketMessageUseCase(supportRepository);
export const listAllTicketsUseCase = new ListAllTicketsUseCase(supportRepository);
export const updateTicketStatusUseCase = new UpdateTicketStatusUseCase(supportRepository);
