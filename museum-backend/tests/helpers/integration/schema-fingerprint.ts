import type { DataSource } from 'typeorm';

export interface SchemaFingerprint {
  tables: Record<
    string,
    {
      columns: Array<{ name: string; type: string; nullable: boolean }>;
      indexes: Array<{ name: string; columns: string[]; unique: boolean }>;
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
      Array<{ column_name: string; data_type: string; is_nullable: 'YES' | 'NO' }>
    >(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY column_name`,
      [table_name],
    );

    const indexes = await ds.query<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1
       ORDER BY indexname`,
      [table_name],
    );

    const foreignKeys = await ds.query<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = 'public' AND table_name = $1 AND constraint_type = 'FOREIGN KEY'
       ORDER BY constraint_name`,
      [table_name],
    );

    fingerprint.tables[table_name] = {
      columns: columns.map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
      })),
      indexes: indexes.map((i) => ({
        name: i.indexname,
        columns: extractIndexColumns(i.indexdef),
        unique: /CREATE UNIQUE INDEX/i.test(i.indexdef),
      })),
      foreignKeys: foreignKeys.map((f) => f.constraint_name),
    };
  }
  return fingerprint;
}

function extractIndexColumns(indexdef: string): string[] {
  const match = indexdef.match(/\(([^)]+)\)/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((c) => c.trim().replace(/^"/, '').replace(/"$/, ''))
    .filter((c) => c.length > 0);
}
