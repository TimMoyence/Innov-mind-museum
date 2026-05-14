/**
 * Leads module composition root (R4 §3.4).
 * Picks the Brevo-backed notifier when `BREVO_API_KEY` is set, falls back to
 * the no-op notifier in local dev (R14). Routes to `B2B_INBOX_EMAIL` if
 * configured, otherwise reuses `SUPPORT_INBOX_EMAIL` (project-doctrine
 * `feedback_no_feature_flags_prelaunch` — `B2B_INBOX_EMAIL` is a config value,
 * not a feature flag, per AUDIT_CHAIN_ALERT_EMAIL precedent).
 */
import {
  EmailB2bLeadNotifier,
  NoopB2bLeadNotifier,
} from '@modules/leads/adapters/secondary/notifier/b2b-lead-email.notifier';
import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';

const b2bInbox = env.b2bInboxEmail ?? env.supportInboxEmail;

const b2bLeadNotifier = env.brevoApiKey
  ? new EmailB2bLeadNotifier(new BrevoEmailService(env.brevoApiKey), b2bInbox)
  : new NoopB2bLeadNotifier();

export const submitB2bLeadUseCase = new SubmitB2bLeadUseCase(b2bLeadNotifier);
