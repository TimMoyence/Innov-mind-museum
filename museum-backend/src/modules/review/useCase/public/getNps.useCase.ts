import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { NpsAggregate } from '@modules/review/domain/review/review.types';

interface GetNpsUseCaseInput {
  /**
   * RBAC-resolved tenant scope (C2 / R13). The route owns the RBAC decision
   * (super_admin/admin/moderator free ; museum_manager forced to JWT claim ;
   * 403 on NULL claim) and hands a resolved `museumId | undefined`. This
   * use-case is scope-AGNOSTIC — `undefined` → global aggregate (incl.
   * `museum_id IS NULL`), a value → per-museum.
   */
  museumId?: number;
}

/** Reads the NPS aggregate over approved reviews (global or per-museum). */
export class GetNpsUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  async execute(input: GetNpsUseCaseInput): Promise<NpsAggregate> {
    return await this.repository.aggregateNps(input.museumId);
  }
}
