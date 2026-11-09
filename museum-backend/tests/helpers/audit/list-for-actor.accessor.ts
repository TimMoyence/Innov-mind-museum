import { AuditRepositoryPg } from '@shared/audit/audit.repository.pg';

import type { AuditLog } from '@shared/audit/auditLog.entity';

type ListForActorFn = (actorId: number) => Promise<AuditLog[]>;

export function getListForActor(repo: AuditRepositoryPg): ListForActorFn | undefined {
  const candidate = (repo as unknown as Record<string, unknown>).listForActor;
  if (typeof candidate !== 'function') return undefined;
  return (candidate as ListForActorFn).bind(repo);
}
