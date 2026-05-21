/**
 * GDPR DSAR run — typed accessor for `AuditRepositoryPg.listForActor`, which
 * DOES NOT EXIST YET at red-phase time (T1.9 adds it). Reaching the method
 * through a cast (allowed in `tests/helpers/`) keeps the red test typechecking;
 * the test fails at runtime because the method is `undefined`.
 *
 * GREEN contract (T1.9): `listForActor(actorId: number): Promise<AuditLog[]>`
 * on `IAuditLogRepository` + `AuditRepositoryPg`, reading rows where
 * `actor_id = actorId`.
 */
import { AuditRepositoryPg } from '@shared/audit/audit.repository.pg';

import type { AuditLog } from '@shared/audit/auditLog.entity';

type ListForActorFn = (actorId: number) => Promise<AuditLog[]>;

/** Returns the bound `listForActor` method or `undefined` if not yet implemented. */
export function getListForActor(repo: AuditRepositoryPg): ListForActorFn | undefined {
  const candidate = (repo as unknown as Record<string, unknown>).listForActor;
  if (typeof candidate !== 'function') return undefined;
  return (candidate as ListForActorFn).bind(repo);
}
