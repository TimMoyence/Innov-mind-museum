/**
 * T1.7.b3 — `parsedToJsonb` variance helper coverage.
 *
 * The helper is module-internal to
 * `typeorm-museum-enrichment-cache.adapter.ts` (no export). We exercise it
 * indirectly via the `upsert` code path, which calls it twice (once for the
 * INSERT branch, once for the UPDATE branch via `applyViewToEntity`). The
 * assertions verify the post-T1.7 contract:
 *   - `ParsedOpeningHours | null` input → `Record<string, unknown> | null`
 *     output assignable to the JSONB column.
 *   - `null` in → `null` out (no `{}` regression).
 *   - Non-null in → fresh top-level object (defensive copy, ref-inequality),
 *     with the same enumerable keys.
 */

import { TypeOrmMuseumEnrichmentCacheAdapter } from '@modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter';

import type {
  MuseumEnrichmentView,
  ParsedOpeningHours,
} from '@modules/museum/domain/enrichment/enrichment.types';
import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { DataSource } from 'typeorm';

interface FakeMuseumRow {
  museumId: number | null;
  locale: string;
  openingHours: Record<string, unknown> | null;
  [key: string]: unknown;
}

const makeParsedHours = (): ParsedOpeningHours => ({
  raw: 'Mo-Su 09:00-18:00',
  status: 'open',
  statusReason: 'currently_open',
  closesAtLocal: '18:00',
  opensAtLocal: '09:00',
  weekly: [
    { day: 'mon', opens: '09:00', closes: '18:00' },
    { day: 'tue', opens: '09:00', closes: '18:00' },
    { day: 'wed', opens: '09:00', closes: '18:00' },
    { day: 'thu', opens: '09:00', closes: '18:00' },
    { day: 'fri', opens: '09:00', closes: '18:00' },
    { day: 'sat', opens: '09:00', closes: '18:00' },
    { day: 'sun', opens: '09:00', closes: '18:00' },
  ],
});

const makeView = (overrides: Partial<MuseumEnrichmentView> = {}): MuseumEnrichmentView => ({
  museumId: 42,
  locale: 'en',
  summary: 'A great museum.',
  wikidataQid: 'Q12345',
  website: 'https://example.com',
  phone: '+33 1 23 45 67 89',
  imageUrl: 'https://example.com/banner.jpg',
  openingHours: makeParsedHours(),
  admissionFees: null,
  collections: null,
  currentExhibitions: null,
  accessibility: null,
  fetchedAt: new Date('2026-05-16T10:00:00.000Z').toISOString(),
  ...overrides,
});

/**
 * Tiny in-memory stand-in for a TypeORM repository — enough surface to drive
 * `upsert` without spinning up a real DataSource. We capture `save` calls so
 * the test can assert on the JSONB shape produced by `parsedToJsonb`.
 */
function makeFakeRepo() {
  const saved: FakeMuseumRow[] = [];
  let existing: FakeMuseumRow | null = null;
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
    getOne: jest.fn(async () => existing),
    getMany: jest.fn(async () => []),
  };

  return {
    saved,
    setExisting: (row: FakeMuseumRow | null) => {
      existing = row;
    },
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((row: FakeMuseumRow) => ({ ...row })),
    save: jest.fn(async (row: FakeMuseumRow) => {
      saved.push(row);
      return row;
    }),
    findOne: jest.fn(async () => ({ id: 42, name: 'Test Museum' })),
  };
}

function makeAdapter() {
  const enrichmentRepo = makeFakeRepo();
  const museumRepo = makeFakeRepo();
  // Ctor calls `getRepository` twice: first for MuseumEnrichment, then for
  // Museum. We dispatch by call index instead of identity-checking the entity
  // class to keep the fake DataSource minimal.
  let getRepoCallIndex = 0;
  const fakeDataSource = {
    getRepository: jest.fn(() => {
      getRepoCallIndex += 1;
      return getRepoCallIndex === 1 ? enrichmentRepo : museumRepo;
    }),
  } as unknown as DataSource;
  const adapter = new TypeOrmMuseumEnrichmentCacheAdapter(
    fakeDataSource,
    {} as unknown as typeof Museum,
  );
  return { adapter, enrichmentRepo, museumRepo };
}

describe('TypeOrmMuseumEnrichmentCacheAdapter — parsedToJsonb variance helper', () => {
  it('upsert INSERT path: parsedToJsonb returns a fresh Record (ref-inequal to input view) when openingHours is non-null', async () => {
    const { adapter, enrichmentRepo } = makeAdapter();
    enrichmentRepo.setExisting(null);

    const view = makeView();
    await adapter.upsert(view);

    expect(enrichmentRepo.saved).toHaveLength(1);
    const persisted = enrichmentRepo.saved[0];
    expect(persisted).toBeDefined();
    expect(persisted.openingHours).not.toBeNull();
    // Defensive copy: NOT the same reference as the caller's view object.
    expect(persisted.openingHours).not.toBe(view.openingHours);
    // Same enumerable shape (shallow spread preserves keys + primitive values).
    expect(persisted.openingHours).toEqual({ ...view.openingHours });
    // Specifically: status + raw round-tripped as Record-indexable values.
    expect(persisted.openingHours!.raw).toBe('Mo-Su 09:00-18:00');
    expect(persisted.openingHours!.status).toBe('open');
  });

  it('upsert INSERT path: parsedToJsonb returns null when openingHours is null (no `{}` regression)', async () => {
    const { adapter, enrichmentRepo } = makeAdapter();
    enrichmentRepo.setExisting(null);

    await adapter.upsert(makeView({ openingHours: null }));

    expect(enrichmentRepo.saved).toHaveLength(1);
    expect(enrichmentRepo.saved[0].openingHours).toBeNull();
  });

  it('upsert UPDATE path: parsedToJsonb result is assigned to the existing entity as a fresh Record', async () => {
    const { adapter, enrichmentRepo } = makeAdapter();
    const existing: FakeMuseumRow = {
      museumId: 42,
      locale: 'en',
      openingHours: { stale: true },
      summary: 'stale',
      wikidataQid: null,
      website: null,
      phone: null,
      imageUrl: null,
      fetchedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    enrichmentRepo.setExisting(existing);

    const view = makeView();
    await adapter.upsert(view);

    expect(enrichmentRepo.saved).toHaveLength(1);
    const persisted = enrichmentRepo.saved[0];
    expect(persisted).toBeDefined();
    // applyViewToEntity mutated the existing row in place, then saved it.
    expect(persisted).toBe(existing);
    expect(persisted.openingHours).not.toBeNull();
    // Fresh top-level object, NOT the caller's view.openingHours.
    expect(persisted.openingHours).not.toBe(view.openingHours);
    expect(persisted.openingHours).toEqual({ ...view.openingHours });
  });
});
