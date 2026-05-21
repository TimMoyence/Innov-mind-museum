/**
 * GDPR erasure run — typed accessor for `removeContact`, which DOES NOT EXIST
 * YET at red-phase time (T1.5 adds it to `BrevoBetaSignupNotifier` +
 * `NoopBetaSignupNotifier`). Reaching the method through a cast (allowed in
 * `tests/helpers/`) keeps the red test typechecking; the test fails at runtime
 * because the method is `undefined`.
 *
 * GREEN contract (T1.5):
 *   removeContact(email: string): Promise<{ outcome: BetaSignupOutcome } | void>
 *   - DELETE https://api.brevo.com/v3/contacts/<encodeURIComponent(email)>?identifierType=email_id
 *   - header `api-key`
 *   - 404 → idempotent success (no throw)
 *   - other non-2xx → throws WITHOUT the api-key in the message
 *   - Noop notifier → resolves `{ outcome: 'noop' }`
 */

export interface RemoveContactOutcome {
  outcome: string;
}

type RemoveContactFn = (email: string) => Promise<RemoveContactOutcome | void>;

/** Returns the bound `removeContact` method or `undefined` if not yet implemented. */
export function getRemoveContact(notifier: object): RemoveContactFn | undefined {
  const candidate = (notifier as Record<string, unknown>).removeContact;
  if (typeof candidate !== 'function') return undefined;
  return (candidate as RemoveContactFn).bind(notifier);
}
