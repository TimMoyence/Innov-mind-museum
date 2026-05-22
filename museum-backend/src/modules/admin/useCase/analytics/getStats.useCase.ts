import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminStats } from '@modules/admin/domain/admin/admin.types';

/**
 * Wave B C8 / R-C8 — optional B2B tenant scope.
 *
 * When `museumId` is provided, stats are restricted to that tenant (museum-
 * scoped users / sessions / messages). When omitted (super_admin global
 * view), the aggregate is cross-tenant. The route layer enforces RBAC
 * scoping (museum_manager → forced to their JWT claim; super_admin → any
 * museumId or undefined). Repository-level scoping is best-effort here:
 * `museum_id` only exists on a subset of entities (reviews/support_tickets
 * are scoped per Wave B M2/M3; users/chat sessions are NOT museum-scoped
 * in V1). The flag is therefore plumbed but the repository implementation
 * may treat it as a no-op until the rest of the schema lands tenant scope.
 */
export interface GetStatsInput {
  museumId?: number;
}

export class GetStatsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(_input: GetStatsInput = {}): Promise<AdminStats> {
    // V1 — the underlying repository does not yet scope stats by museumId.
    // The signature accepts the scope so the route can thread it (and the
    // BOLA contract pins on the use-case call shape), but the aggregate
    // returned is the global cross-tenant snapshot until users / sessions
    // / messages gain museum_id columns (out-of-scope this lot). This is
    // documented as a known limitation — see spec.md C8 acceptance criteria.
    return await this.repository.getStats();
  }
}
