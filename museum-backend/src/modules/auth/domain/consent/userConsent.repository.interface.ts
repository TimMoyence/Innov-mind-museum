import type { ConsentScope, ConsentSource, UserConsent } from './userConsent.entity';

/**
 * Append-mostly GDPR consent store. Each grant opens a new active row;
 * revoke stamps `revokedAt` on the currently-active row for (user, scope).
 */
export interface IUserConsentRepository {
  grant(
    userId: number,
    scope: ConsentScope,
    version: string,
    source: ConsentSource,
  ): Promise<UserConsent>;

  /** No-op if no active grant. */
  revoke(userId: number, scope: ConsentScope): Promise<void>;

  /** True iff at least one row with `revokedAt IS NULL` for (user, scope). */
  isGranted(userId: number, scope: ConsentScope): Promise<boolean>;

  /** Ordered by `granted_at DESC` (history + current). */
  listForUser(userId: number): Promise<UserConsent[]>;
}
