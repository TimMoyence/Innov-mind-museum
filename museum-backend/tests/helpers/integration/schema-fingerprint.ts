import type { DataSource } from 'typeorm';

/**
 * Test utility: deeply-comparable structural fingerprint of the public schema.
 *
 * Captures: tables, columns (name/type/nullable/default), indexes
 * (name/definition/unique), CHECK constraints, FK constraint names.
 *
 * Known gaps (acceptable for Phase 1):
 *   - Sequences and their current values
 *   - Custom enum / domain types
 *   - Materialised views
 *   - Trigger definitions
 *
 * If a migration round-trip breaks because of one of these gaps, extend the
 * fingerprint shape AND the test will catch the regression that prompted
 * the extension.
 */
export interface SchemaFingerprint {
  tables: Record<
    string,
    {
      columns: Array<{ name: string; type: string; nullable: boolean; default: string | null }>;
      indexes: Array<{ name: string; definition: string; unique: boolean }>;
      checks: string[]; // sorted list of check_clause strings
      foreignKeys: string[]; // constraint names, sorted
    }
  >;
}

/**
 * Test utility: capture a normalised, deeply-comparable structural fingerprint
 * of the public schema. Excludes TypeORM's own `migrations` table (which has
 * row data that differs per up/down round trip).
 */
export async function dumpSchemaFingerprint(ds: DataSource): Promise<SchemaFingerprint> {
  const tablesRaw = await ds.query<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> 'migrations'
     ORDER BY table_name`,
  );
  const fingerprint: SchemaFingerprint = { tables: {} };

  for (const { table_name } of tablesRaw) {
    const columns = await ds.query<
      Array<{
        column_name: string;
        data_type: string;
        is_nullable: 'YES' | 'NO';
        column_default: string | null;
      }>
    >(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY column_name`,
      [table_name],
    );

    // Use pg_index + pg_get_indexdef instead of parsing pg_indexes.indexdef via
    // regex. The regex approach (`/\(([^)]+)\)/`) is broken for functional indexes
    // like `lower((email)::text)` because it stops at the first `)`, yielding a
    // truncated result. pg_get_indexdef returns the full, Postgres-normalised
    // CREATE INDEX statement which is round-trip-stable regardless of how the
    // original statement was written.
    const indexes = await ds.query<
      Array<{
        indexname: string;
        is_unique: boolean;
        column_repr: string;
      }>
    >(
      `
      SELECT
        c.relname AS indexname,
        ix.indisunique AS is_unique,
        pg_get_indexdef(ix.indexrelid) AS column_repr
      FROM pg_index ix
      JOIN pg_class c ON c.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = $1
      ORDER BY c.relname
      `,
      [table_name],
    );

    const foreignKeys = await ds.query<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = 'public' AND table_name = $1 AND constraint_type = 'FOREIGN KEY'
       ORDER BY constraint_name`,
      [table_name],
    );

    const checks = await ds.query<Array<{ check_clause: string }>>(
      `SELECT cc.check_clause
       FROM information_schema.check_constraints cc
       JOIN information_schema.constraint_column_usage ccu
         ON cc.constraint_name = ccu.constraint_name
       WHERE ccu.table_schema = 'public' AND ccu.table_name = $1
       ORDER BY cc.check_clause`,
      [table_name],
    );

    fingerprint.tables[table_name] = {
      columns: columns.map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        default: c.column_default ?? null,
      })),
      indexes: indexes.map((i) => ({
        name: i.indexname,
        // Use the full pg_get_indexdef output as a stable canonical form.
        // Postgres normalises this regardless of how the original CREATE INDEX
        // statement was written, so it is round-trip-safe.
        definition: i.column_repr,
        unique: i.is_unique,
      })),
      checks: checks.map((c) => c.check_clause),
      foreignKeys: foreignKeys.map((f) => f.constraint_name),
    };
  }
  return fingerprint;
}
