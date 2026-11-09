import { extractEmailDomain } from '@shared/pii/extractEmailDomain';
import { replaceEmails } from '@shared/pii/mask-personal-data';

const LAST_ERROR_MAX = 800;

const BREVO_API_KEY_RE = /xkeysib-[a-z0-9._-]+/g;

const REDACTED_KEY = '[redacted-key]';

export function sanitizeLeadError(raw: string): string {
  const withoutKey = raw.replace(BREVO_API_KEY_RE, REDACTED_KEY);
  const withoutEmail = replaceEmails(
    withoutKey,
    (email) => `[redacted-email]@${extractEmailDomain(email)}`,
  ).text;
  return withoutEmail.slice(0, LAST_ERROR_MAX);
}

export function toSanitizedLeadError(err: unknown): string {
  return err instanceof Error ? sanitizeLeadError(err.message) : 'unknown';
}
