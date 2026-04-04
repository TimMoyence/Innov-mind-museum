/**
 * Shared mock SelectQueryBuilder factory.
 *
 * Provides ALL chainable methods found across repository tests.
 * Chainable methods default to `.mockReturnThis()`.
 * Terminal methods (getMany, getOne, etc.) default to sensible no-op returns.
 *
 * Usage:
 *   const qb = makeMockQb();
 *   qb.getMany.mockResolvedValue([entity1, entity2]);
 */
export function makeMockQb(overrides: Record<string, jest.Mock> = {}): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = {
    // ── Chainable (SELECT) ──
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    distinctOn: jest.fn().mockReturnThis(),

    // ── Chainable (INSERT/UPDATE/DELETE) ──
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),

    // ── Terminal ──
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getCount: jest.fn().mockResolvedValue(0),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),

    // ── Utility ──
    clone: jest.fn(),

    // Apply overrides
    ...overrides,
  };

  // clone returns the same qb by default for chaining
  if (!overrides.clone) {
    qb.clone.mockReturnValue(qb);
  }

  return qb;
}
