import { AppDataSource } from '@data/db/data-source';
import {
  EmailB2bLeadNotifier,
  NoopB2bLeadNotifier,
} from '@modules/leads/adapters/secondary/notifier/b2b-lead-email.notifier';
import {
  BrevoBetaSignupNotifier,
  NoopBetaSignupNotifier,
} from '@modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier';
import { LeadRepositoryPg } from '@modules/leads/adapters/secondary/pg/lead.repository.pg';
import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';

import type { LeadType } from '@modules/leads/domain/lead/lead.types';

const b2bInbox = env.b2bInboxEmail ?? env.supportInboxEmail;

const b2bLeadNotifier = env.brevoApiKey
  ? new EmailB2bLeadNotifier(new BrevoEmailService(env.brevoApiKey), b2bInbox)
  : new NoopB2bLeadNotifier();

const betaSignupNotifier =
  env.brevoApiKey && env.brevoBetaListId
    ? new BrevoBetaSignupNotifier(env.brevoApiKey, env.brevoBetaListId)
    : new NoopBetaSignupNotifier();

const leadRepository = new LeadRepositoryPg(AppDataSource);

export function leadNotifierByType(
  type: LeadType,
):
  | { notify: (payload: never) => Promise<void> }
  | { subscribe: typeof betaSignupNotifier.subscribe } {
  if (type === 'b2b') {
    return {
      notify: b2bLeadNotifier.notify.bind(b2bLeadNotifier) as (payload: never) => Promise<void>,
    };
  }
  if (type === 'brevo_erasure') {
    return {
      subscribe: (async (payload: { email: string }) =>
        await betaSignupNotifier.removeContact(
          payload.email,
        )) as typeof betaSignupNotifier.subscribe,
    };
  }
  return { subscribe: betaSignupNotifier.subscribe.bind(betaSignupNotifier) };
}

export const submitB2bLeadUseCase = new SubmitB2bLeadUseCase(b2bLeadNotifier, leadRepository);

export const submitBetaSignupUseCase = new SubmitBetaSignupUseCase(
  betaSignupNotifier,
  leadRepository,
);

export const submitPaywallInterestUseCase = new SubmitPaywallInterestUseCase(
  betaSignupNotifier,
  leadRepository,
);
