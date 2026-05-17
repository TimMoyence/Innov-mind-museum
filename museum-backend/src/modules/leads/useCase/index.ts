/**
 * Composition root (R4 §3.4 + R3 §3.4). Each use case picks Brevo adapter when
 * creds set, else noop (R14 — local dev / pre-prod). `BREVO_BETA_LIST_ID` is
 * config, NOT a feature flag (UFR-015, mirror `B2B_INBOX_EMAIL` /
 * `AUDIT_CHAIN_ALERT_EMAIL`).
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
import { SubmitPaywallInterestUseCase } from '@modules/leads/useCase/submitPaywallInterest.useCase';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';

const b2bInbox = env.b2bInboxEmail ?? env.supportInboxEmail;

const b2bLeadNotifier = env.brevoApiKey
  ? new EmailB2bLeadNotifier(new BrevoEmailService(env.brevoApiKey), b2bInbox)
  : new NoopB2bLeadNotifier();

export const submitB2bLeadUseCase = new SubmitB2bLeadUseCase(b2bLeadNotifier);

// R3 — needs both BREVO_API_KEY + BREVO_BETA_LIST_ID for live notifier; else
// noop so deploy succeeds without Brevo list (operator monitors `beta_signup_notifier_noop`).
const betaSignupNotifier =
  env.brevoApiKey && env.brevoBetaListId
    ? new BrevoBetaSignupNotifier(env.brevoApiKey, env.brevoBetaListId)
    : new NoopBetaSignupNotifier();

export const submitBetaSignupUseCase = new SubmitBetaSignupUseCase(betaSignupNotifier);

// R1 (C6) — paywall reuses the SAME notifier singleton. Discriminator is
// `source: 'paywall_premium_interest'` injected by the use case (D9).
export const submitPaywallInterestUseCase = new SubmitPaywallInterestUseCase(betaSignupNotifier);
