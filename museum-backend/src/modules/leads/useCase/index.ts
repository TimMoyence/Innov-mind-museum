/**
 * Leads module composition root (R4 §3.4 + R3 §3.4).
 * Wires the two parallel use cases :
 *  - `submitB2bLeadUseCase` — R4 W4.3 transactional Brevo email.
 *  - `submitBetaSignupUseCase` — R3 W4.2 Brevo contact-list subscription.
 *
 * Each use case picks its Brevo-backed adapter when the relevant credentials
 * are set, otherwise falls back to a no-op adapter (R14 — local dev / pre-prod
 * boot before Brevo list is provisioned). `BREVO_BETA_LIST_ID` is a config
 * value, NOT a feature flag (mirror `B2B_INBOX_EMAIL` /
 * `AUDIT_CHAIN_ALERT_EMAIL` precedents, project-doctrine
 * `feedback_no_feature_flags_prelaunch`).
 */
import {
  EmailB2bLeadNotifier,
  NoopB2bLeadNotifier,
} from '@modules/leads/adapters/secondary/notifier/b2b-lead-email.notifier';
import {
  BrevoBetaSignupNotifier,
  NoopBetaSignupNotifier,
} from '@modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier';
import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';

const b2bInbox = env.b2bInboxEmail ?? env.supportInboxEmail;

const b2bLeadNotifier = env.brevoApiKey
  ? new EmailB2bLeadNotifier(new BrevoEmailService(env.brevoApiKey), b2bInbox)
  : new NoopB2bLeadNotifier();

export const submitB2bLeadUseCase = new SubmitB2bLeadUseCase(b2bLeadNotifier);

// R3 — Brevo list subscription notifier. Both `BREVO_API_KEY` and
// `BREVO_BETA_LIST_ID` must be set for the live notifier; otherwise the noop
// adapter resolves silently so the deploy succeeds without a Brevo list
// provisioned (the operator monitors `beta_signup_notifier_noop` warns).
const betaSignupNotifier =
  env.brevoApiKey && env.brevoBetaListId
    ? new BrevoBetaSignupNotifier(env.brevoApiKey, env.brevoBetaListId)
    : new NoopBetaSignupNotifier();

export const submitBetaSignupUseCase = new SubmitBetaSignupUseCase(betaSignupNotifier);
