/**
 * T-API-3 (RED — S-BE-API, UFR-022 fresh-context red phase 2026-05-26).
 *
 * Proves the future `GetNpsUseCase` threads the (already RBAC-resolved) scope
 * through to `repo.aggregateNps`:
 *   - `execute({ museumId: 42 })` → `repo.aggregateNps(42)`
 *   - `execute({})`              → `repo.aggregateNps(undefined)` (global, R13)
 * The use-case is scope-AGNOSTIC: the route owns the RBAC decision and hands it
 * a resolved `museumId | undefined` (design-c2.md §3, mirrors C1 `/stats`).
 *
 * Baseline FAILS (success of red phase per UFR-022): `getNps.useCase.ts` does
 * NOT exist yet (created in green T-API-9), so this suite fails to resolve the
 * import — failure mode = `missing-schema` (Cannot find module). After green the
 * import resolves and the assertions hold.
 *
 * lib-docs/typeorm/PATTERNS.md §9.1 (UC depends on IReviewRepository interface).
 */
import { GetNpsUseCase } from '@modules/review/useCase/public/getNps.useCase';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';

function makeRepo(): jest.Mocked<IReviewRepository> {
  return {
    createReview: jest.fn().mockResolvedValue(undefined),
    listReviews: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    getReviewById: jest.fn().mockResolvedValue(null),
    moderateReview: jest.fn().mockResolvedValue(null),
    getAverageRating: jest.fn().mockResolvedValue({ average: 0, count: 0 }),
    listForUser: jest.fn().mockResolvedValue([]),
    findByMuseum: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    aggregateNps: jest
      .fn()
      .mockResolvedValue({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 }),
  };
}

describe('GetNpsUseCase (S-BE-API / T-API-3)', () => {
  it('passes the museumId scope through to repo.aggregateNps(42)', async () => {
    const repo = makeRepo();
    const uc = new GetNpsUseCase(repo);

    await uc.execute({ museumId: 42 });

    expect(repo.aggregateNps).toHaveBeenCalledWith(42);
  });

  it('calls repo.aggregateNps(undefined) for the global aggregate (no museumId)', async () => {
    const repo = makeRepo();
    const uc = new GetNpsUseCase(repo);

    await uc.execute({});

    expect(repo.aggregateNps).toHaveBeenCalledWith(undefined);
  });

  it('returns the aggregate produced by the repository', async () => {
    const repo = makeRepo();
    repo.aggregateNps.mockResolvedValue({
      nps: 50,
      promoters: 5,
      passives: 3,
      detractors: 2,
      count: 10,
    });
    const uc = new GetNpsUseCase(repo);

    const result = await uc.execute({ museumId: 42 });

    expect(result).toEqual({ nps: 50, promoters: 5, passives: 3, detractors: 2, count: 10 });
  });
});
