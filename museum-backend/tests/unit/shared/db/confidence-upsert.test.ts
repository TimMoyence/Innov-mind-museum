/**
 * UFR-022 red phase — PR-16 `confidenceUpsert<T>` shared helper.
 * RUN_ID: 2026-05-23-pr-16-confidenceUpsert.
 *
 * Behavioural unit tests for the confidence-based merge helper that PR-16
 * extracts from the two TypeORM repos (B10-#1, ~87 LOC duplicated). The helper
 * is PURE/SYNC: it receives an already-resolved `existing` row + incoming
 * `data` + an explicit options bag, mutates `existing` in place per the
 * confidence branch, and returns it. It does NOT do the find or the save
 * (caller-side, divergent lookup per repo) — see spec §2 + design §1.
 *
 * Scenarios (spec §6 — the helper-pure subset; insert #1 is repo-method scope,
 * covered by the green sweep keeping `repo.create({...data, sourceUrls:[url]})`):
 *   - Higher confidence → overwrite-preserve (id, createdAt, sourceUrls kept).
 *   - Equal confidence (strict `>` ⇒ `==` falls to backfill branch).
 *   - Lower confidence → backfill nulls only (non-null fields untouched).
 *   - sourceUrls dedup-append (immutable spread, order preserved).
 *   - needsReview ALWAYS updated (both branches).
 *   - nullableFields explicit: P3 hybrid cols (summary/...) NOT backfilled.
 *   - preserveFields museumId (museum overwrite keeps museumId).
 *
 * Factories: `makeArtworkKnowledge` / `makeMuseumEnrichment` (DRY — Test
 * Discipline doctrine). No inline `as Entity` (R4.4).
 *
 * Pre-green: this file FAILS — `@shared/db/confidence-upsert` does not exist
 * yet, so the import does not resolve and the whole suite errors out. That is
 * the intended Red signal (absence of feature, not a buggy test).
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected test bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP (re-spawn red), never
 * edit here.
 *
 * libDocsConsulted: ["typeorm"] — lib-docs/typeorm/PATTERNS.md (§3.1 Data-Mapper
 * `repo.save(entity)`, helper mutates a loaded entity then caller persists) +
 * LESSONS.md (no `.set({field: undefined})` — helper uses entity mutation, not
 * `.update`/`.set`, so the silent-skip gotcha does not apply).
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-16-confidenceUpsert/spec.md §2 / §6 / R3
 *   .claude/skills/team/team-state/2026-05-23-pr-16-confidenceUpsert/design.md §1 / §2
 *   .claude/skills/team/team-state/2026-05-23-pr-16-confidenceUpsert/tasks.md T1 / T4
 */
import { confidenceUpsert } from '@shared/db/confidence-upsert';

import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';

import {
  makeArtworkKnowledge,
  makeMuseumEnrichment,
} from '../../../helpers/knowledge-extraction/extraction.fixtures';

// Option bags mirroring the two real call-sites (design §3). Declared once so
// the tests assert the SAME explicit lists the green repos must pass — never a
// list derived from the entity (spec §2 critical note).
const ARTWORK_NULLABLE_FIELDS = [
  'artist',
  'period',
  'technique',
  'historicalContext',
  'dimensions',
  'currentLocation',
] as const;
const ARTWORK_PRESERVE_FIELDS = ['id', 'sourceUrls', 'createdAt'] as const;

const MUSEUM_NULLABLE_FIELDS = [
  'openingHours',
  'admissionFees',
  'website',
  'collections',
  'currentExhibitions',
  'accessibility',
] as const;
const MUSEUM_PRESERVE_FIELDS = ['id', 'museumId', 'sourceUrls', 'createdAt'] as const;

/**
 * Builds the `data` payload from an entity factory, stripping the fields the
 * caller's `Omit<...>` excludes so the test object matches the real call-site
 * shape (no `id`/`createdAt`/`updatedAt`; museum also no `museum` relation).
 * The helper only reads business + confidence/needsReview/sourceUrls fields, so
 * the strip keeps the contract honest without inline entity literals (R4.4).
 * @param overrides
 */
function artworkData(
  overrides?: Partial<ArtworkKnowledge>,
): Omit<ArtworkKnowledge, 'id' | 'createdAt' | 'updatedAt'> {
  const full = makeArtworkKnowledge(overrides);
  const { id, createdAt, updatedAt, ...data } = full;
  void id;
  void createdAt;
  void updatedAt;
  return data;
}

function museumData(
  overrides?: Partial<MuseumEnrichment>,
): Omit<MuseumEnrichment, 'id' | 'museum' | 'createdAt' | 'updatedAt'> {
  const full = makeMuseumEnrichment(overrides);
  const { id, museum, createdAt, updatedAt, ...data } = full;
  void id;
  void museum;
  void createdAt;
  void updatedAt;
  return data;
}

describe('confidenceUpsert<T> — higher confidence overwrite (R3.1)', () => {
  it('overwrites all data fields but PRESERVES id/createdAt/sourceUrls (artwork)', () => {
    const existing = makeArtworkKnowledge({
      id: '00000000-0000-0000-0000-0000000000aa',
      title: 'Mona Lisa',
      artist: 'Old Artist',
      confidence: 0.5,
      needsReview: true,
      sourceUrls: ['https://existing.example/a'],
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const data = artworkData({
      title: 'Mona Lisa',
      artist: 'Leonardo da Vinci',
      confidence: 0.9,
      needsReview: false,
      sourceUrls: ['https://payload.example/should-be-ignored'],
    });

    const result = confidenceUpsert<ArtworkKnowledge>(existing, data, {
      sourceUrl: 'https://new.example/source',
      nullableFields: ARTWORK_NULLABLE_FIELDS,
      preserveFields: ARTWORK_PRESERVE_FIELDS,
    });

    // Mutates and returns the same object reference.
    expect(result).toBe(existing);
    // data overwrites business fields.
    expect(result.artist).toBe('Leonardo da Vinci');
    expect(result.confidence).toBe(0.9);
    // identity + creation timestamp preserved from existing.
    expect(result.id).toBe('00000000-0000-0000-0000-0000000000aa');
    expect(result.createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    // sourceUrls preserved = the merged existing list (union dedup-append),
    // NOT the payload's sourceUrls.
    expect(result.sourceUrls).toEqual(['https://existing.example/a', 'https://new.example/source']);
  });

  it('preserves museumId in addition to id/createdAt/sourceUrls (museum divergence)', () => {
    const existing = makeMuseumEnrichment({
      id: '00000000-0000-0000-0000-0000000000bb',
      museumId: 42,
      name: 'Louvre Museum',
      confidence: 0.3,
      sourceUrls: ['https://existing.example/m'],
      createdAt: new Date('2026-02-02T00:00:00Z'),
    });
    const data = museumData({
      name: 'Louvre Museum',
      museumId: 999, // higher-confidence payload tries to change it…
      confidence: 0.95,
    });

    const result = confidenceUpsert<MuseumEnrichment>(existing, data, {
      sourceUrl: 'https://new.example/m-source',
      nullableFields: MUSEUM_NULLABLE_FIELDS,
      preserveFields: MUSEUM_PRESERVE_FIELDS,
    });

    expect(result.confidence).toBe(0.95);
    // …but museumId is in preserveFields, so the existing value wins.
    expect(result.museumId).toBe(42);
    expect(result.id).toBe('00000000-0000-0000-0000-0000000000bb');
    expect(result.createdAt).toEqual(new Date('2026-02-02T00:00:00Z'));
  });
});

describe('confidenceUpsert<T> — equal confidence falls to backfill branch (R3.6)', () => {
  it('does NOT overwrite when data.confidence == existing.confidence (strict >)', () => {
    const existing = makeArtworkKnowledge({
      artist: 'Original Artist',
      period: null,
      confidence: 0.7,
    });
    const data = artworkData({
      artist: 'Replacement Artist', // would win only on strict-greater overwrite
      period: 'Renaissance',
      confidence: 0.7, // EQUAL → backfill branch
    });

    const result = confidenceUpsert<ArtworkKnowledge>(existing, data, {
      sourceUrl: 'https://eq.example/source',
      nullableFields: ARTWORK_NULLABLE_FIELDS,
      preserveFields: ARTWORK_PRESERVE_FIELDS,
    });

    // backfill branch: non-null `artist` is NOT overwritten.
    expect(result.artist).toBe('Original Artist');
    // backfill branch: null `period` IS filled.
    expect(result.period).toBe('Renaissance');
  });
});

describe('confidenceUpsert<T> — lower confidence backfills nulls only (R3.2)', () => {
  it('fills null nullableFields, leaves non-null fields untouched', () => {
    const existing = makeArtworkKnowledge({
      period: 'Existing Period', // must stay
      confidence: 0.9,
    });
    // The factory defaults via `??`, which drops `null` overrides; set the
    // backfill-target nulls explicitly so `existing` actually holds null.
    existing.artist = null; // will be backfilled
    existing.technique = null; // will be backfilled
    const data = artworkData({
      artist: 'Backfilled Artist',
      period: 'Payload Period (ignored)',
      technique: 'Backfilled Technique',
      confidence: 0.4, // lower → backfill branch
    });

    const result = confidenceUpsert<ArtworkKnowledge>(existing, data, {
      sourceUrl: 'https://low.example/source',
      nullableFields: ARTWORK_NULLABLE_FIELDS,
      preserveFields: ARTWORK_PRESERVE_FIELDS,
    });

    expect(result.artist).toBe('Backfilled Artist');
    expect(result.technique).toBe('Backfilled Technique');
    expect(result.period).toBe('Existing Period');
    expect(result.confidence).toBe(0.9); // existing confidence untouched
  });
});

describe('confidenceUpsert<T> — sourceUrls dedup-append (R3.4 / R1.5)', () => {
  it('appends a new sourceUrl to the end, preserving order (immutable spread)', () => {
    const original = ['https://a.example/1', 'https://b.example/2'];
    const existing = makeArtworkKnowledge({
      sourceUrls: original,
      confidence: 0.5,
    });
    const data = artworkData({ confidence: 0.4 }); // backfill branch, irrelevant to urls

    const result = confidenceUpsert<ArtworkKnowledge>(existing, data, {
      sourceUrl: 'https://c.example/3',
      nullableFields: ARTWORK_NULLABLE_FIELDS,
      preserveFields: ARTWORK_PRESERVE_FIELDS,
    });

    expect(result.sourceUrls).toEqual([
      'https://a.example/1',
      'https://b.example/2',
      'https://c.example/3',
    ]);
  });

  it('does NOT duplicate a sourceUrl already present', () => {
    const existing = makeArtworkKnowledge({
      sourceUrls: ['https://a.example/1', 'https://b.example/2'],
      confidence: 0.5,
    });
    const data = artworkData({ confidence: 0.4 });

    const result = confidenceUpsert<ArtworkKnowledge>(existing, data, {
      sourceUrl: 'https://b.example/2', // already present → dedup
      nullableFields: ARTWORK_NULLABLE_FIELDS,
      preserveFields: ARTWORK_PRESERVE_FIELDS,
    });

    expect(result.sourceUrls).toEqual(['https://a.example/1', 'https://b.example/2']);
  });
});

describe('confidenceUpsert<T> — needsReview ALWAYS updated (R3.3)', () => {
  it('updates needsReview in the backfill (lower confidence) branch', () => {
    const existing = makeArtworkKnowledge({ needsReview: false, confidence: 0.9 });
    const data = artworkData({ needsReview: true, confidence: 0.4 });

    const result = confidenceUpsert<ArtworkKnowledge>(existing, data, {
      sourceUrl: 'https://nr.example/source',
      nullableFields: ARTWORK_NULLABLE_FIELDS,
      preserveFields: ARTWORK_PRESERVE_FIELDS,
    });

    expect(result.needsReview).toBe(true);
  });

  it('updates needsReview in the overwrite (higher confidence) branch', () => {
    const existing = makeArtworkKnowledge({ needsReview: true, confidence: 0.2 });
    const data = artworkData({ needsReview: false, confidence: 0.95 });

    const result = confidenceUpsert<ArtworkKnowledge>(existing, data, {
      sourceUrl: 'https://nr2.example/source',
      nullableFields: ARTWORK_NULLABLE_FIELDS,
      preserveFields: ARTWORK_PRESERVE_FIELDS,
    });

    expect(result.needsReview).toBe(false);
  });
});

describe('confidenceUpsert<T> — nullableFields explicit, P3 hybrid cols excluded (R3.2 guard)', () => {
  it('does NOT backfill a nullable column outside nullableFields (museum summary)', () => {
    const existing = makeMuseumEnrichment({
      name: 'Louvre Museum',
      confidence: 0.9,
    });
    // Factory `??` defaulting drops `null` overrides (and never assigns the P3
    // hybrid `summary` at all); set both explicitly so the guard is meaningful.
    existing.summary = null; // nullable BUT not in MUSEUM_NULLABLE_FIELDS
    existing.website = null; // nullable AND in the backfill list
    const data = museumData({
      name: 'Louvre Museum',
      summary: 'A backfilled summary that must be ignored',
      website: 'https://backfilled.example',
      confidence: 0.4, // lower → backfill branch
    });

    const result = confidenceUpsert<MuseumEnrichment>(existing, data, {
      sourceUrl: 'https://guard.example/source',
      nullableFields: MUSEUM_NULLABLE_FIELDS,
      preserveFields: MUSEUM_PRESERVE_FIELDS,
    });

    // P3 hybrid field NOT in nullableFields → stays null.
    expect(result.summary).toBeNull();
    // field IN nullableFields → backfilled.
    expect(result.website).toBe('https://backfilled.example');
  });
});
