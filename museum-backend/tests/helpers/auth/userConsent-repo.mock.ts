import type {
  ConsentScope,
  ConsentSource,
  UserConsent,
} from '@modules/auth/domain/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/userConsent.repository.interface';

/**
 * In-memory factory for {@link IUserConsentRepository} — DRY helper used by
 * both the use-case unit tests and the HTTP route integration tests. Rows are
 * stored in a local array; grants append, revokes stamp `revokedAt`.
 */
export function makeUserConsentRepo(): IUserConsentRepository & {
  rows: UserConsent[];
  reset: () => void;
} {
  let rows: UserConsent[] = [];
  let nextId = 1;

  return {
    get rows(): UserConsent[] {
      return rows;
    },
    reset(): void {
      rows = [];
      nextId = 1;
    },
    async grant(
      userId: number,
      scope: ConsentScope,
      version: string,
      source: ConsentSource,
    ): Promise<UserConsent> {
      const now = new Date();
      const row = {
        id: nextId++,
        userId,
        scope,
        version,
        source,
        grantedAt: now,
        revokedAt: null,
        createdAt: now,
      } as UserConsent;
      rows.push(row);
      return await Promise.resolve(row);
    },
    async revoke(userId: number, scope: ConsentScope): Promise<void> {
      const now = new Date();
      for (const row of rows) {
        if (row.userId === userId && row.scope === scope && row.revokedAt === null) {
          row.revokedAt = now;
        }
      }
      await Promise.resolve();
    },
    async isGranted(userId: number, scope: ConsentScope): Promise<boolean> {
      return await Promise.resolve(
        rows.some((row) => row.userId === userId && row.scope === scope && row.revokedAt === null),
      );
    },
    async listForUser(userId: number): Promise<UserConsent[]> {
      return await Promise.resolve(
        rows
          .filter((row) => row.userId === userId)
          .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime()),
      );
    },
  };
}
