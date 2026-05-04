/**
 * Support module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';
import { AppDataSource } from '@src/data/db/data-source';

import { SubmitSupportContactUseCase } from './contact/submitSupportContact.useCase';
import { ListAllTicketsUseCase } from './ticket-admin/listAllTickets.useCase';
import { UpdateTicketStatusUseCase } from './ticket-admin/updateTicketStatus.useCase';
import { AddTicketMessageUseCase } from './ticket-user/addTicketMessage.useCase';
import { CreateTicketUseCase } from './ticket-user/createTicket.useCase';
import { GetTicketDetailUseCase } from './ticket-user/getTicketDetail.useCase';
import { ListUserTicketsUseCase } from './ticket-user/listUserTickets.useCase';
import {
  EmailSupportContactNotifier,
  NoopSupportContactNotifier,
} from '../adapters/secondary/notifier/support-contact-email.notifier';
import { SupportRepositoryPg } from '../adapters/secondary/pg/support.repository.pg';

const supportRepository = new SupportRepositoryPg(AppDataSource);
const supportContactNotifier = env.brevoApiKey
  ? new EmailSupportContactNotifier(new BrevoEmailService(env.brevoApiKey), env.supportInboxEmail)
  : new NoopSupportContactNotifier();

export const createTicketUseCase = new CreateTicketUseCase(supportRepository);
export const submitSupportContactUseCase = new SubmitSupportContactUseCase(supportContactNotifier);
export const listUserTicketsUseCase = new ListUserTicketsUseCase(supportRepository);
export const getTicketDetailUseCase = new GetTicketDetailUseCase(supportRepository);
export const addTicketMessageUseCase = new AddTicketMessageUseCase(supportRepository);
export const listAllTicketsUseCase = new ListAllTicketsUseCase(supportRepository);
export const updateTicketStatusUseCase = new UpdateTicketStatusUseCase(supportRepository);
