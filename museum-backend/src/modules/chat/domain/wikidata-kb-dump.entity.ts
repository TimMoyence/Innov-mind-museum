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
 * Populated organically by {@link WikidataWriteThroughProvider} after every
 * successful live lookup, plus optional one-shot canon seed
 * (`scripts/seed-kb-canon.ts`). Consulted by `KnowledgeBaseService` cascade
 * when the upstream breaker stays OPEN past `LOCAL_DUMP_FALLBACK_AFTER_MS`.
 *
 * The 150GB monthly RDF-dump pipeline was rejected (ADR-039 D4) — table size
 * scales linearly with real V1 traffic and starts empty.
 *
 * **Natural key `(search_term, language)`**:
 *   - `search_term` is the **normalised** key (`.toLowerCase().trim()`), kept
 *     identical to `kb:wikidata:<key>` cache shape in `knowledge-base.service.ts`.
 *     Repository callers MUST normalise before writing or dedupe breaks.
 *   - `language` non-nullable with `''` as "unspecified" sentinel. NULL was
 *     rejected because Postgres UNIQUE treats NULLs as distinct, which would
 *     let write-through create duplicates.
 *
 * `qid` denormalised from `facts.qid` so reverse lookup doesn't need JSONB scan.
 * Nullable for defensive flexibility.
 */
@Entity({ name: 'wikidata_kb_dump' })
@Unique('uq_wikidata_kb_dump_search_lang', ['searchTerm', 'language'])
export class WikidataKbDump {
  /** Synthetic PK — easier index identity than (search_term, language). */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Repository normalises on every read/write so callers don't have to. */
  @Column({ type: 'text', name: 'search_term' })
  searchTerm!: string;

  /** `''` means "no language specified" — the shape `lookupFacts(searchTerm)` hits. */
  @Column({ type: 'text', name: 'language', default: '' })
  language!: string;

  /** Denormalised from `facts.qid`. Indexed non-unique for future "terms→QID" query. */
  @Index('ix_wikidata_kb_dump_qid')
  @Column({ type: 'text', name: 'qid', nullable: true })
  qid!: string | null;

  /** JSONB so future queries can index inner fields. */
  @Column({ type: 'jsonb', name: 'facts' })
  facts!: ArtworkFacts;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  /** Bumped on every UPSERT collision. */
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
