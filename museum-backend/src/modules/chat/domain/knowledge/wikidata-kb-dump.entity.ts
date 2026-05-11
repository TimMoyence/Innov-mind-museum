import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

/**
 * Local Wikidata dump fallback row backing the C5.3 write-through cache.
 *
 * Populated organically by the {@link WikidataWriteThroughProvider}
 * decorator after every successful live Wikidata lookup, plus an optional
 * one-shot canon seed (`scripts/seed-kb-canon.ts`). Consulted by the
 * cascade in `KnowledgeBaseService` when the upstream breaker has stayed
 * OPEN past `LOCAL_DUMP_FALLBACK_AFTER_MS`.
 *
 * The 150 GB monthly RDF-dump pipeline originally drafted in the launch
 * prompt was explicitly rejected (ADR-039 D4) — table size scales linearly
 * with real V1 traffic and starts empty.
 *
 * **Natural key — `(search_term, language)`** :
 *   - `search_term` is the **normalised** lookup key
 *     (`searchTerm.toLowerCase().trim()`), kept identical to the cache key
 *     shape in `knowledge-base.service.ts` (`kb:wikidata:<key>`). Repository
 *     callers MUST normalise before writing or the dedupe breaks.
 *   - `language` is a non-nullable text with `''` (empty string) as the
 *     "unspecified" sentinel. NULL was rejected because PostgreSQL's
 *     `UNIQUE` constraint treats NULLs as distinct (i.e. two rows with
 *     `language IS NULL` do not conflict), which would let the write-through
 *     create duplicates.
 *
 * The `qid` column is denormalised from `facts.qid` so a future reverse
 * lookup ("which search terms map to this QID ?") doesn't need a JSONB scan.
 * Nullable for defensive flexibility — `facts.qid` is required at the type
 * level but coercion from upstream stays safe even if upstream regresses.
 */
@Entity({ name: 'wikidata_kb_dump' })
@Unique('uq_wikidata_kb_dump_search_lang', ['searchTerm', 'language'])
export class WikidataKbDump {
  /** Synthetic primary key — easier index identity than (search_term, language). */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Normalised lookup key (lower-cased + trimmed). The repository performs
   * the normalisation on every read/write so callers do not have to.
   */
  @Column({ type: 'text', name: 'search_term' })
  searchTerm!: string;

  /**
   * Language code (e.g. `'fr'`, `'en'`) ; empty string `''` means "no
   * language specified" — the cache shape that
   * `KnowledgeBaseService.lookupFacts(searchTerm)` (no language arg) hits.
   */
  @Column({ type: 'text', name: 'language', default: '' })
  language!: string;

  /**
   * Wikidata QID denormalised from `facts.qid` for reverse-lookup convenience.
   * Indexed (non-unique) so the (future) "which terms map to this QID" query
   * does not require a JSONB scan.
   */
  @Index('ix_wikidata_kb_dump_qid')
  @Column({ type: 'text', name: 'qid', nullable: true })
  qid!: string | null;

  /** Cached ArtworkFacts payload, stored verbatim. JSONB so future queries can index inner fields. */
  @Column({ type: 'jsonb', name: 'facts' })
  facts!: ArtworkFacts;

  /** Row creation timestamp (timezone-aware). */
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  /** Row last-update timestamp (timezone-aware). Bumped on every UPSERT collision. */
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
