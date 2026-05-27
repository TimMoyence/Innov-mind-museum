/**
 * Composition root (R4 §3.4 + R3 §3.4 + Cycle B). Each use case picks the Brevo
 * adapter when creds set, else noop (R14 — local dev / pre-prod). `BREVO_BETA_LIST_ID`
 * is config, NOT a feature flag (UFR-015, mirror `B2B_INBOX_EMAIL` /
 * `AUDIT_CHAIN_ALERT_EMAIL`).
 *
 * Cycle B (« Aucun lead perdu », T3.5) — the 3 use-cases now persist-then-notify,
 * so they receive the shared `LeadRepositoryPg(AppDataSource)` in addition to
 * their notifier. The notifier-by-type resolver (`leadNotifierByType`) is exported
 * for reuse by the async retry job (`RedeliverPendingLeadsUseCase`, Phase 5).
 */
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

// R3 — needs both BREVO_API_KEY + BREVO_BETA_LIST_ID for live notifier; else
// noop so deploy succeeds without Brevo list (operator monitors `beta_signup_notifier_noop`).
const betaSignupNotifier =
  env.brevoApiKey && env.brevoBetaListId
    ? new BrevoBetaSignupNotifier(env.brevoApiKey, env.brevoBetaListId)
    : new NoopBetaSignupNotifier();

// Cycle B — single PG-backed repository shared by the 3 capture use-cases (and,
// from Phase 5, the retry job). Hexagonal: use-cases depend on `ILeadRepository`.
const leadRepository = new LeadRepositoryPg(AppDataSource);

/**
 * Resolves the notifier `subscribe`/`notify` path for a persisted lead by its
 * `type`. Exported so the async retry job re-delivers a `failed`/`pending` lead
 * through the SAME adapter the capture use-case used.
 */
export function leadNotifierByType(
  type: LeadType,
):
  | { notify: (payload: never) => Promise<void> }
  | { subscribe: typeof betaSignupNotifier.subscribe } {
  return type === 'b2b'
    ? { notify: b2bLeadNotifier.notify.bind(b2bLeadNotifier) as (payload: never) => Promise<void> }
    : { subscribe: betaSignupNotifier.subscribe.bind(betaSignupNotifier) };
}

export const submitB2bLeadUseCase = new SubmitB2bLeadUseCase(b2bLeadNotifier, leadRepository);

export const submitBetaSignupUseCase = new SubmitBetaSignupUseCase(
  betaSignupNotifier,
  leadRepository,
);

// R1 (C6) — paywall reuses the SAME notifier singleton. Discriminator is
// `source: 'paywall_premium_interest'` injected by the use case (D9).
export const submitPaywallInterestUseCase = new SubmitPaywallInterestUseCase(
  betaSignupNotifier,
  leadRepository,
);
