/**
 * Support module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';
import { AppDataSource } from '@src/data/db/data-source';

import { AddTicketMessageUseCase } from './addTicketMessage.useCase';
import { CreateTicketUseCase } from './createTicket.useCase';
import { GetTicketDetailUseCase } from './getTicketDetail.useCase';
import { ListAllTicketsUseCase } from './listAllTickets.useCase';
import { ListUserTicketsUseCase } from './listUserTickets.useCase';
import { SubmitSupportContactUseCase } from './submitSupportContact.useCase';
import { UpdateTicketStatusUseCase } from './updateTicketStatus.useCase';
import {
  EmailSupportContactNotifier,
  NoopSupportContactNotifier,
} from '../adapters/secondary/support-contact-email.notifier';
import { SupportRepositoryPg } from '../adapters/secondary/support.repository.pg';

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
