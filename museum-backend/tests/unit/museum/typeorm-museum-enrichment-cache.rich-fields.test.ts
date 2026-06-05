/**
 * QA-06 RED — rich JSONB fields exposure in MuseumEnrichmentView.
 *
 * Phase RED of the UFR-022 fresh-context 5-phase workflow. These tests
 * PROVE the bug/absence: the cache adapter's `toView` projection currently
 * OMITS the four rich JSONB columns (`admissionFees`, `collections`,
 * `currentExhibitions`, `accessibility`) that already exist on the
 * `MuseumEnrichment` entity. The detail screen therefore can never surface
 * them.
 *
 * Source-of-truth: audit-state/2026-05-30-qa-manual/QA-NOTES.md § QA-06
 * + team-runs/qa-06/spec.md R1/R2/R4.
 *
 * Discrimination:
 *  - `findFresh` → `toView(row)`. Today `toView` builds the view from only
 *    summary/wikidataQid/website/phone/imageUrl/openingHours/fetchedAt. The
 *    four rich keys are therefore `undefined` on the returned view → the
 *    assertions `.toEqual(<record>)` / `.toBeNull()` FAIL.
 *  - The UPDATE path (`applyViewToEntity`) test proves a worker refresh that
 *    carries `null` rich fields must NOT overwrite a pre-existing seeded rich
 *    value (R4). Today the view type has no such fields, so the green impl
 *    must add them AND preserve them on update.
 *
 * These tests do NOT touch the existing
 * `typeorm-museum-enrichment-cache.adapter.test.ts` (parsedToJsonb coverage)
 * — they live in a separate file so the existing green suite stays untouched.
 */

import { TypeOrmMuseumEnrichmentCacheAdapter } from '@modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter';

import type { MuseumEnrichmentView } from '@modules/museum/domain/enrichment/enrichment.types';
import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { DataSource } from 'typeorm';

// Minimal entity-row stand-in: a row as TypeORM would hydrate it, carrying
// the four rich JSONB columns the entity already declares (entity l.53-82).
interface FakeEnrichmentRow {
  id: string;
  museumId: number | null;
  locale: string;
  summary: string | null;
  wikidataQid: string | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
  openingHours: Record<string, unknown> | null;
  admissionFees: Record<string, unknown> | null;
  collections: Record<string, unknown> | null;
  currentExhibitions: Record<string, unknown> | null;
  accessibility: Record<string, unknown> | null;
  fetchedAt: Date;
  [key: string]: unknown;
}

const makeRichRow = (overrides: Partial<FakeEnrichmentRow> = {}): FakeEnrichmentRow => ({
  id: 'row-1',
  museumId: 42,
  locale: 'fr',
  summary: 'Un grand musée.',
  wikidataQid: 'Q3329534',
  website: 'https://www.musee-aquitaine-bordeaux.fr',
  phone: null,
  imageUrl: null,
  openingHours: null,
  admissionFees: { adult: '6 €', under18: 'gratuit' },
  collections: { highlights: ['Préhistoire', 'Bordeaux au XVIIIe siècle'] },
  currentExhibitions: null,
  accessibility: { wheelchairAccess: true, audioGuide: false },
  fetchedAt: new Date('2026-05-30T08:00:00.000Z'),
  ...overrides,
});

function makeFakeRepo() {
  const saved: FakeEnrichmentRow[] = [];
  let existing: FakeEnrichmentRow | null = null;
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
    setExisting: (row: FakeEnrichmentRow | null) => {
      existing = row;
    },
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((row: FakeEnrichmentRow) => ({ ...row })),
    save: jest.fn(async (row: FakeEnrichmentRow) => {
      saved.push(row);
      return row;
    }),
    findOne: jest.fn(async () => ({ id: 42, name: 'Musée test' })),
  };
}

function makeAdapter() {
  const enrichmentRepo = makeFakeRepo();
  const museumRepo = makeFakeRepo();
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

const FRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

describe('QA-06 — TypeOrmMuseumEnrichmentCacheAdapter exposes rich JSONB fields (R1/R2)', () => {
  it('findFresh → toView returns admissionFees/collections/currentExhibitions/accessibility from the entity', async () => {
    const { adapter, enrichmentRepo } = makeAdapter();
    const row = makeRichRow();
    enrichmentRepo.setExisting(row);

    const view = await adapter.findFresh({
      museumId: 42,
      locale: 'fr',
      freshWindowMs: FRESH_WINDOW_MS,
      now: new Date('2026-05-30T09:00:00.000Z'),
    });

    expect(view).not.toBeNull();
    const v = view as MuseumEnrichmentView;
    // The four rich fields MUST round-trip from the entity to the view.
    expect(v.admissionFees).toEqual({ adult: '6 €', under18: 'gratuit' });
    expect(v.collections).toEqual({ highlights: ['Préhistoire', 'Bordeaux au XVIIIe siècle'] });
    expect(v.currentExhibitions).toBeNull();
    expect(v.accessibility).toEqual({ wheelchairAccess: true, audioGuide: false });
  });

  it('findFresh → toView exposes null for each rich field when the entity column is null', async () => {
    const { adapter, enrichmentRepo } = makeAdapter();
    enrichmentRepo.setExisting(
      makeRichRow({
        admissionFees: null,
        collections: null,
        currentExhibitions: null,
        accessibility: null,
      }),
    );

    const view = await adapter.findFresh({
      museumId: 42,
      locale: 'fr',
      freshWindowMs: FRESH_WINDOW_MS,
      now: new Date('2026-05-30T09:00:00.000Z'),
    });

    expect(view).not.toBeNull();
    const v = view as MuseumEnrichmentView;
    expect(v.admissionFees).toBeNull();
    expect(v.collections).toBeNull();
    expect(v.currentExhibitions).toBeNull();
    expect(v.accessibility).toBeNull();
  });

  it('upsert UPDATE path: a worker refresh carrying null rich fields does NOT overwrite a pre-existing seeded rich value (R4)', async () => {
    const { adapter, enrichmentRepo } = makeAdapter();
    // A previously seeded row already holds rich data.
    const existing = makeRichRow({
      summary: 'stale',
      admissionFees: { adult: '6 €' },
      collections: { highlights: ['Préhistoire'] },
      accessibility: { wheelchairAccess: true },
    });
    enrichmentRepo.setExisting(existing);

    // The worker P3 builds a view WITHOUT the rich fields (they are null).
    const workerView: MuseumEnrichmentView = {
      museumId: 42,
      locale: 'fr',
      summary: 'fresh summary from worker',
      wikidataQid: 'Q3329534',
      website: null,
      phone: null,
      imageUrl: null,
      openingHours: null,
      admissionFees: null,
      collections: null,
      currentExhibitions: null,
      accessibility: null,
      fetchedAt: new Date('2026-05-30T10:00:00.000Z').toISOString(),
    };

    await adapter.upsert(workerView);

    expect(enrichmentRepo.saved).toHaveLength(1);
    const persisted = enrichmentRepo.saved[0];
    expect(persisted).toBeDefined();
    // Legacy/base columns updated by the worker.
    expect(persisted.summary).toBe('fresh summary from worker');
    // Rich seeded fields PRESERVED on the entity — the worker null view must
    // not wipe them.
    expect(persisted.admissionFees).toEqual({ adult: '6 €' });
    expect(persisted.collections).toEqual({ highlights: ['Préhistoire'] });
    expect(persisted.accessibility).toEqual({ wheelchairAccess: true });

    // And the preserved values MUST be observable through the view projection
    // (`findFresh` → `toView`). This is the discriminator: today `toView`
    // omits the four rich fields → the read-back view exposes `undefined`,
    // failing the assertions below. After GREEN the view carries them.
    enrichmentRepo.setExisting(persisted);
    const readBack = await adapter.findFresh({
      museumId: 42,
      locale: 'fr',
      freshWindowMs: FRESH_WINDOW_MS,
      now: new Date('2026-05-30T11:00:00.000Z'),
    });
    expect(readBack).not.toBeNull();
    const v = readBack as MuseumEnrichmentView;
    expect(v.admissionFees).toEqual({ adult: '6 €' });
    expect(v.collections).toEqual({ highlights: ['Préhistoire'] });
    expect(v.accessibility).toEqual({ wheelchairAccess: true });
  });
});
