/**
 * I-SEC8 (RUN_ID 2026-05-25-isec8-museum-scope) — RED unit test.
 *
 * Locks down the museum_id (internal tenant axis) read scope that
 * `TypeOrmArtworkKnowledgeRepo.findById` MUST grow, mirroring the C7 precedent
 * shipped on `artwork_embeddings`
 * (`tests/unit/chat/visual-similarity/artwork-embedding.repository.museum-id.test.ts`).
 *
 * Target behaviour (OWASP LLM08 cross-tenant read, spec AC-1..AC-4):
 *   - `findById(id, 42)` → the read goes through a QueryBuilder whose tenant
 *     predicate carries both `museum_id` and the `:museumId` bind, the bound
 *     `museumId` param is the tenant id, and NO unscoped warn is logged.
 *     (AC-3 self-tenant hit ; AC-1 cross-tenant row excluded by the predicate ;
 *     AC-2 the `museum_id IS NULL` disjunct keeps global rows visible.)
 *   - `findById(id)` / `findById(id, null)` → the bound `museumId` param is
 *     `null` (global-only read) AND the repo logs the stable, grep-able event
 *     `artwork_knowledge_find_by_id_unscoped` exactly once. (AC-4.)
 *
 * RED rationale: the current `findById(id)` implementation calls
 * `repo.findOne({ where: { id } })` — it never touches `createQueryBuilder`
 * and never logs a warn — so every assertion below fails on the current code.
 * The integration round-trip (migration no-drift / down) is verified
 * procedurally in the GREEN/verify gate, not here.
 */

import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo';

import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import type { Repository } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- mock access after jest.mock hoisting (matches the C7 sibling suite convention). */
const { logger: mockLogger } = require('@shared/logger/logger') as {
  logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const ARTWORK_UUID = '00000000-0000-4000-8000-0000000000aa';
const TENANT_A = 42;

/**
 * Target shape of the scoped read, valid against BOTH the current 1-arg
 * `findById(id)` signature (RED) and the future `findById(id, museumId?)`
 * signature (GREEN) — assignment-compatible, so no `as` cast is needed and the
 * file stays byte-frozen across the red→green handoff.
 */
type ScopedFindById = (id: string, museumId?: number | null) => Promise<ArtworkKnowledge | null>;

/**
 * Builds a mock TypeORM `Repository<ArtworkKnowledge>` exposing both the legacy
 * `findOne` path (current impl) and the `createQueryBuilder` path (target
 * impl) so the same fixture proves RED now and stays valid GREEN later.
 * @returns The repo double + the captured QueryBuilder double for assertions.
 */
function buildRepoMock(): {
  repo: Repository<ArtworkKnowledge>;
  qb: Record<string, jest.Mock>;
} {
  const qb = makeMockQb();
  const repo = {
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<ArtworkKnowledge>;
  return { repo, qb };
}

describe('TypeOrmArtworkKnowledgeRepo.findById — OWASP LLM08 museum_id scope (I-SEC8)', () => {
  beforeEach(() => {
    mockLogger.warn.mockClear();
  });

  it('routes through a QueryBuilder whose tenant predicate carries museum_id + :museumId bind when museumId is set, with no warn (AC-1/AC-2/AC-3)', async () => {
    const { repo, qb } = buildRepoMock();
    const sut = new TypeOrmArtworkKnowledgeRepo(repo);
    const findById: ScopedFindById = sut.findById.bind(sut);

    await findById(ARTWORK_UUID, TENANT_A);

    // The scoped read MUST go through the QueryBuilder, not the unscoped findOne.
    const andWhereCalls: [string, Record<string, unknown>][] = qb.andWhere.mock.calls;
    expect(andWhereCalls.length).toBeGreaterThan(0);
    const tenantClause = andWhereCalls.find(([sql]) => sql.includes(':museumId'));
    expect(tenantClause).toBeDefined();
    const [predicateSql, binds] = tenantClause!;
    // AC-1/AC-3: tenant-scoped equality. AC-2: NULL rows stay globally visible.
    expect(predicateSql).toContain('museum_id');
    expect(predicateSql).toContain('museum_id IS NULL');
    expect(binds.museumId).toBe(TENANT_A);
    // Scope provided ⇒ the unscoped warn stays silent.
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('binds null and emits the stable unscoped warn exactly once when museumId is omitted (AC-4)', async () => {
    const { repo, qb } = buildRepoMock();
    const sut = new TypeOrmArtworkKnowledgeRepo(repo);
    const findById: ScopedFindById = sut.findById.bind(sut);

    await findById(ARTWORK_UUID);

    const andWhereCalls: [string, Record<string, unknown>][] = qb.andWhere.mock.calls;
    const tenantClause = andWhereCalls.find(([sql]) => sql.includes(':museumId'));
    expect(tenantClause).toBeDefined();
    const [, binds] = tenantClause!;
    expect(binds.museumId).toBeNull();

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [event] = mockLogger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe('artwork_knowledge_find_by_id_unscoped');
  });

  it('treats explicit null museumId as omitted: null bind + warn once (AC-4)', async () => {
    const { repo, qb } = buildRepoMock();
    const sut = new TypeOrmArtworkKnowledgeRepo(repo);
    const findById: ScopedFindById = sut.findById.bind(sut);

    await findById(ARTWORK_UUID, null);

    const andWhereCalls: [string, Record<string, unknown>][] = qb.andWhere.mock.calls;
    const tenantClause = andWhereCalls.find(([sql]) => sql.includes(':museumId'));
    expect(tenantClause).toBeDefined();
    const [, binds] = tenantClause!;
    expect(binds.museumId).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });
});
