/**
 * Support module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { AppDataSource } from '@data/db/data-source';
import {
  EmailSupportContactNotifier,
  NoopSupportContactNotifier,
} from '@modules/support/adapters/secondary/notifier/support-contact-email.notifier';
import { SupportRepositoryPg } from '@modules/support/adapters/secondary/pg/support.repository.pg';
import { SubmitSupportContactUseCase } from '@modules/support/useCase/contact/submitSupportContact.useCase';
import { ListAllTicketsUseCase } from '@modules/support/useCase/ticket-admin/listAllTickets.useCase';
import { UpdateTicketStatusUseCase } from '@modules/support/useCase/ticket-admin/updateTicketStatus.useCase';
import { AddTicketMessageUseCase } from '@modules/support/useCase/ticket-user/addTicketMessage.useCase';
import { CreateTicketUseCase } from '@modules/support/useCase/ticket-user/createTicket.useCase';
import { GetTicketDetailUseCase } from '@modules/support/useCase/ticket-user/getTicketDetail.useCase';
import { ListUserTicketsUseCase } from '@modules/support/useCase/ticket-user/listUserTickets.useCase';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';

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
