import type { ConsentScope, ConsentSource, UserConsent } from './userConsent.entity';

/**
 * Port for the GDPR consent store. Implementations are append-mostly: each
 * grant opens a new active row and each revoke stamps `revokedAt` on the
 * currently-active row for the (user, scope) pair. `isGranted` returns true
 * iff at least one row exists with `revokedAt IS NULL` for that pair.
 */
export interface IUserConsentRepository {
  /** Record a new consent grant. Returns the persisted record. */
  grant(
    userId: number,
    scope: ConsentScope,
    version: string,
    source: ConsentSource,
  ): Promise<UserConsent>;

  /** Stamp revokedAt on the current active grant (no-op if none active). */
  revoke(userId: number, scope: ConsentScope): Promise<void>;

  /** True iff at least one active (revokedAt IS NULL) grant exists. */
  isGranted(userId: number, scope: ConsentScope): Promise<boolean>;

  /** All rows for this user, ordered by granted_at DESC (history + current). */
  listForUser(userId: number): Promise<UserConsent[]>;
}
