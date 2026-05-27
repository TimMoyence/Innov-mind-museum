/**
 * Cycle B (« Aucun lead perdu », T8.1) — sanitiser for the persisted
 * `Lead.lastError` (spec R16, design §7, NFR Privacy(c)).
 *
 * When the Brevo notifier throws, the use-case records the upstream error
 * message on the durable lead so an operator (and the retry job) can diagnose
 * the failure. That recorded string is a NEW, log-bound, erasure-escaping copy
 * of whatever the upstream error happened to embed — so before it is persisted
 * it MUST be defanged:
 *   (a) the Brevo api-key (or any `xkeysib-*` fragment) is stripped — a secret
 *       must NEVER be persisted/logged/exposed (CLAUDE.md AI-Safety / OWASP API
 *       sensitive-data-exposure),
 *   (b) any full email address is reduced to `[redacted-email]@<domain>` — the
 *       recipient already lives in `payload`; `lastError` must not duplicate the
 *       full address as a second copy that the email-keyed erasure path (R20)
 *       would miss, and
 *   (c) the result stays bounded (≤ 800 chars, mirror the Brevo notifier
 *       `.slice(0, 800)` posture).
 *
 * Pure: no logger, no IO, no framework imports — same posture as
 * `extractEmailDomain` (the email-domain helper this reuses).
 */
import { extractEmailDomain } from '@shared/pii/extractEmailDomain';

/** Mirror the Brevo notifier slice bound (`brevo-beta-signup.notifier.ts`). */
const LAST_ERROR_MAX = 800;

/**
 * Brevo personal api-keys are `xkeysib-` followed by a key-shaped suffix. Match
 * the whole token (any run of key chars after the prefix) so no fragment
 * survives. Lower-case-only class (no `i` flag — keys are lower-case; avoids the
 * `A-Z`/`a-z` duplicate under case-insensitivity).
 */
const BREVO_API_KEY_RE = /xkeysib-[a-z0-9._-]+/g;

/**
 * Email matcher (good enough to catch a leaked recipient in an error string —
 * we are scrubbing, not validating). Mirrors the project's `validateEmail`
 * pattern (`shared/validation/email.ts`): three quantified non-overlapping char
 * classes separated by the literal `@` and `.`, no alternation → linear time
 * (no catastrophic backtracking). Global so every address in the message is
 * reduced; un-anchored since we scrub inside a larger string.
 */
// eslint-disable-next-line sonarjs/slow-regex -- three quantified non-overlapping char classes separated by literal `@` and `.`, no alternation: linear time (mirror shared/validation/email.ts)
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

const REDACTED_KEY = '[redacted-key]';

/**
 * Sanitises a raw notifier error message for durable persistence as
 * `Lead.lastError`. Strips the Brevo api-key, reduces any full email to
 * `[redacted-email]@<domain>` (domain kept for diagnostics, local part never
 * retained), then truncates to {@link LAST_ERROR_MAX} chars.
 *
 * @param raw - The upstream error message (may embed secrets / PII).
 * @returns A bounded, secret-free, PII-minimised string safe to persist + log.
 */
export function sanitizeLeadError(raw: string): string {
  const withoutKey = raw.replace(BREVO_API_KEY_RE, REDACTED_KEY);
  const withoutEmail = withoutKey.replace(EMAIL_RE, (match) => {
    const domain = extractEmailDomain(match);
    return `[redacted-email]@${domain}`;
  });
  return withoutEmail.slice(0, LAST_ERROR_MAX);
}

/**
 * Normalises an unknown thrown value into a sanitised, bounded `lastError`
 * string. `Error` → sanitised `.message`; anything else → the literal
 * `'unknown'` (never serialise an arbitrary thrown object — it could carry a
 * secret-bearing field).
 *
 * @param err - The value caught from the notifier (`unknown` in a catch block).
 * @returns A safe-to-persist `lastError`.
 */
export function toSanitizedLeadError(err: unknown): string {
  return err instanceof Error ? sanitizeLeadError(err.message) : 'unknown';
}
