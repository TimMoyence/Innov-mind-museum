/**
 * RED test — schema assertion for the future `AddArtworkEmbeddings` migration
 * (Phase 3 / T3.1 of run `2026-05-08-c3-image-comparative`).
 *
 * Drives the migration body by asserting, on a real Postgres testcontainer
 * with pgvector, the *desired* shape of the `artwork_embeddings` table after
 * all migrations have run. Until the migration exists this test is RED for
 * the right reason: the table does not exist, every column / index / check
 * assertion fails.
 *
 * Source of truth for the schema:
 *   - design.md §4 (column list + types + CHECK constraints + HNSW index),
 *   - spec.md §3 R13 (`halfvec(768)`) + §8 Q2 (V1 license enum = pd + cc-0),
 *   - the wired domain entity at
 *     `museum-backend/src/modules/chat/domain/visual-similarity/artworkEmbedding.entity.ts`.
 *
 * Round-trip (T3.2) is covered by `tests/integration/db/migration-round-trip.test.ts`,
 * which auto-iterates every migration in `data-source.ts` (up→down→up,
 * fingerprint equality). No separate file needed — that test will start
 * exercising `AddArtworkEmbeddings` as soon as the green-editor commits it.
 */
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import {
  EMBEDDING_DIM,
  makeArtworkEmbeddingRow,
  makeHalfvecLiteral,
} from 'tests/helpers/chat/visual-similarity/embedding.fixtures';

interface ColumnRow {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

interface IndexRow {
  indexname: string;
  indexdef: string;
}

interface CheckRow {
  conname: string;
  consrc: string;
}

describe('AddArtworkEmbeddings migration — schema shape [integration, real PG + pgvector]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  describe('extension + table existence', () => {
    it('enables the pgvector extension', async () => {
      const rows = await harness.dataSource.query<Array<{ extversion: string }>>(
        `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
      );
      expect(rows).toHaveLength(1);
      // pgvector ≥0.7 is required for halfvec (design.md §9 D2).
      const [{ extversion }] = rows;
      const [major, minor] = extversion.split('.').map(Number);
      expect(major > 0 || (major === 0 && minor >= 7)).toBe(true);
    });

    it('creates the `artwork_embeddings` table in the public schema', async () => {
      const rows = await harness.dataSource.query<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'artwork_embeddings'`,
      );
      expect(rows).toEqual([{ table_name: 'artwork_embeddings' }]);
    });
  });

  describe('column definitions', () => {
    let columns: ColumnRow[];

    beforeAll(async () => {
      columns = await harness.dataSource.query<ColumnRow[]>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'artwork_embeddings'
          ORDER BY ordinal_position`,
      );
    });

    const findCol = (name: string): ColumnRow => {
      const col = columns.find((c) => c.column_name === name);
      if (!col) throw new Error(`Expected column "${name}" not found in artwork_embeddings`);
      return col;
    };

    it('includes exactly the columns named in design.md §4', () => {
      const names = columns.map((c) => c.column_name).sort();
      expect(names).toEqual(
        [
          'created_at',
          'embedding',
          'embedding_model_version',
          'image_source',
          'image_url',
          'license',
          'museum_qid',
          'qid',
          'title',
          'updated_at',
        ].sort(),
      );
    });

    it('`qid` is text NOT NULL (primary key)', () => {
      const col = findCol('qid');
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('NO');
    });

    it('`museum_qid` is text NULLABLE (filter optimisation, may be unknown)', () => {
      const col = findCol('museum_qid');
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('YES');
    });

    it('`title` is text NOT NULL', () => {
      const col = findCol('title');
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('NO');
    });

    it('`image_url` is text NOT NULL', () => {
      const col = findCol('image_url');
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('NO');
    });

    it('`license` is text NOT NULL', () => {
      const col = findCol('license');
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('NO');
    });

    it('`image_source` is text NOT NULL', () => {
      const col = findCol('image_source');
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('NO');
    });

    it('`embedding` is `halfvec` NOT NULL (R13)', () => {
      const col = findCol('embedding');
      // pgvector exposes `halfvec` via udt_name; data_type is the generic
      // bucket Postgres reports for non-builtin custom types.
      expect(col.udt_name).toBe('halfvec');
      expect(col.is_nullable).toBe('NO');
    });

    it('`embedding_model_version` is text NOT NULL', () => {
      const col = findCol('embedding_model_version');
      expect(col.data_type).toBe('text');
      expect(col.is_nullable).toBe('NO');
    });

    it('`created_at` is timestamptz with `now()` default', () => {
      const col = findCol('created_at');
      expect(col.data_type).toBe('timestamp with time zone');
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default ?? '').toMatch(/now\(\)/i);
    });

    it('`updated_at` is timestamptz with `now()` default', () => {
      const col = findCol('updated_at');
      expect(col.data_type).toBe('timestamp with time zone');
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default ?? '').toMatch(/now\(\)/i);
    });
  });

  describe('indexes', () => {
    let indexes: IndexRow[];

    beforeAll(async () => {
      indexes = await harness.dataSource.query<IndexRow[]>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'artwork_embeddings'
          ORDER BY indexname`,
      );
    });

    it('declares an HNSW index on `embedding` using `halfvec_ip_ops` (design §4)', () => {
      const hnsw = indexes.find(
        (i) => /USING\s+hnsw/i.test(i.indexdef) && /\bembedding\b/.test(i.indexdef),
      );
      expect(hnsw).toBeDefined();
      // Inner-product op class — embeddings are L2-normalised at encode time
      // so IP is equivalent to cosine (design §9 D2). Halfvec storage (R13).
      expect(hnsw?.indexdef).toMatch(/halfvec_ip_ops/);
    });

    it('declares a btree index on `museum_qid` (filter optimisation)', () => {
      const idx = indexes.find(
        (i) =>
          /USING\s+btree/i.test(i.indexdef) &&
          /\(museum_qid\)/.test(i.indexdef.replace(/\s+/g, '')),
      );
      expect(idx).toBeDefined();
    });

    it('exposes `qid` as the primary key', async () => {
      const pk = await harness.dataSource.query<Array<{ attname: string }>>(
        `SELECT a.attname
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
          WHERE c.relname = 'artwork_embeddings' AND i.indisprimary`,
      );
      expect(pk).toEqual([{ attname: 'qid' }]);
    });
  });

  describe('CHECK constraints', () => {
    let checks: CheckRow[];

    beforeAll(async () => {
      checks = await harness.dataSource.query<CheckRow[]>(
        `SELECT con.conname,
                pg_get_constraintdef(con.oid) AS consrc
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = 'artwork_embeddings'
            AND con.contype = 'c'`,
      );
    });

    it('restricts `image_source` to {wikimedia, museum_api, manual}', () => {
      const sourceCheck = checks.find((c) => /image_source/.test(c.consrc));
      expect(sourceCheck).toBeDefined();
      const def = sourceCheck?.consrc ?? '';
      expect(def).toMatch(/wikimedia/);
      expect(def).toMatch(/museum_api/);
      expect(def).toMatch(/manual/);
    });

    it("restricts `license` to V1 allow-list ({public-domain, cc-0}) — spec §8 Q2", () => {
      const licenseCheck = checks.find((c) => /license/.test(c.consrc));
      expect(licenseCheck).toBeDefined();
      const def = licenseCheck?.consrc ?? '';
      expect(def).toMatch(/public-domain/);
      expect(def).toMatch(/cc-0/);
      // V1 explicitly excludes cc-by-sa + unknown (spec.md §8 Q2 RESOLVED).
      expect(def).not.toMatch(/cc-by-sa/);
      expect(def).not.toMatch(/unknown/);
    });
  });

  describe('insert smoke', () => {
    afterEach(async () => {
      await harness.dataSource.query(`DELETE FROM artwork_embeddings`);
    });

    it('accepts a row with a halfvec(768) embedding literal', async () => {
      const row = makeArtworkEmbeddingRow({
        qid: 'Q-test-insert-768',
        embedding: makeHalfvecLiteral(0.1, EMBEDDING_DIM),
      });

      await harness.dataSource.query(
        `INSERT INTO artwork_embeddings
           (qid, museum_qid, title, image_url, license, image_source,
            embedding, embedding_model_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7::halfvec, $8)`,
        [
          row.qid,
          row.museum_qid,
          row.title,
          row.image_url,
          row.license,
          row.image_source,
          row.embedding,
          row.embedding_model_version,
        ],
      );

      const persisted = await harness.dataSource.query<
        Array<{ qid: string; embedding_dim: number }>
      >(
        `SELECT qid, vector_dims(embedding::vector) AS embedding_dim
           FROM artwork_embeddings WHERE qid = $1`,
        [row.qid],
      );
      expect(persisted).toHaveLength(1);
      expect(persisted[0].qid).toBe(row.qid);
      expect(Number(persisted[0].embedding_dim)).toBe(EMBEDDING_DIM);
    });

    it('rejects a row whose `license` is outside the V1 allow-list', async () => {
      const row = makeArtworkEmbeddingRow({
        qid: 'Q-test-bad-license',
        // Intentional cast: V1 CHECK should refuse this even though the
        // domain TS union still lists `cc-by-sa` for forward-compat.
        license: 'cc-by-sa' as never,
      });

      await expect(
        harness.dataSource.query(
          `INSERT INTO artwork_embeddings
             (qid, museum_qid, title, image_url, license, image_source,
              embedding, embedding_model_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7::halfvec, $8)`,
          [
            row.qid,
            row.museum_qid,
            row.title,
            row.image_url,
            row.license,
            row.image_source,
            row.embedding,
            row.embedding_model_version,
          ],
        ),
      ).rejects.toThrow(/check constraint|license/i);
    });
  });
});
