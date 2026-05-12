import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * C5.3 (Phase A — 2026-05-11) — add the `wikidata_kb_dump` table that backs
 * the local Wikidata write-through cache (decorator
 * `WikidataWriteThroughProvider` + cascade consumer
 * `KnowledgeBaseService.applyCascade`). Populated organically on every live
 * lookup success ; consulted by the cascade when the upstream breaker has
 * been OPEN past `LOCAL_DUMP_FALLBACK_AFTER_MS`. ADR-039 D4 — write-through
 * accepted in lieu of the 150 GB monthly RDF-dump pipeline.
 *
 * Natural key = (search_term, language). `language` is `NOT NULL DEFAULT ''`
 * (empty-string sentinel for "unspecified") so the UNIQUE constraint behaves
 * deterministically — PostgreSQL treats NULLs as distinct in UNIQUE indexes
 * and would otherwise let the write-through accumulate duplicates.
 *
 * Manual cleanup note : the TypeORM diff generator surfaced unrelated noise
 * on this run (halfvec/text on `artwork_embeddings`, FK rename on
 * `user_consents` / `totp_secrets`, index regenerations) because some
 * entity decorators express schema shapes that TypeORM cannot round-trip
 * from the live DB — notably the pgvector `halfvec` column hand-cast in raw
 * SQL (see `artworkEmbedding.entity.ts` comments) and FK constraint names
 * generated differently by an older TypeORM version. Those false-positive
 * statements were removed by hand so this migration owns only the
 * `wikidata_kb_dump` surface. The pre-existing soft drift remains a repo-wide
 * concern tracked separately ; do NOT re-introduce those statements when
 * regenerating against a fresh DB.
 */
export class AddWikidataKbDump1778504875210 implements MigrationInterface {
    name = 'AddWikidataKbDump1778504875210'

    /** Create the `wikidata_kb_dump` table + the qid index. */
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "wikidata_kb_dump" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "search_term" text NOT NULL, "language" text NOT NULL DEFAULT '', "qid" text, "facts" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_wikidata_kb_dump_search_lang" UNIQUE ("search_term", "language"), CONSTRAINT "PK_3d7035237b639c9c8fb89cc2d5e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_wikidata_kb_dump_qid" ON "wikidata_kb_dump" ("qid") `);
    }

    /** Drop the qid index then the `wikidata_kb_dump` table. */
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."ix_wikidata_kb_dump_qid"`);
        await queryRunner.query(`DROP TABLE "wikidata_kb_dump"`);
    }
}
