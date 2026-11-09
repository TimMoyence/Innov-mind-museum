const REQUIRED_PGVECTOR_VERSION = '0.7.0';

const REQUIRED_PARTS = REQUIRED_PGVECTOR_VERSION.split('.').map(Number);

export interface PgVectorQueryRunner {
  query(sql: string): Promise<unknown>;
}

interface AvailableVersionRow {
  version?: unknown;
}

const isAtLeastRequired = (version: string): boolean => {
  const parts = version
    .trim()
    .split('.')
    .map((segment) => {
      const parsed = Number.parseInt(segment, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });

  for (let i = 0; i < REQUIRED_PARTS.length; i += 1) {
    const candidate = parts[i] ?? 0;
    const required = REQUIRED_PARTS[i];
    if (candidate > required) return true;
    if (candidate < required) return false;
  }
  return true;
};

export async function assertPgVectorAvailable(runner: PgVectorQueryRunner): Promise<void> {
  const rows = (await runner.query(
    `SELECT version FROM pg_available_extension_versions WHERE name = 'vector'`,
  )) as AvailableVersionRow[] | null | undefined;

  const versions = Array.isArray(rows)
    ? rows
        .map((row) => row.version)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  if (versions.length === 0) {
    throw new Error(
      `pgvector pre-flight failed: the "vector" extension is not available on this PostgreSQL ` +
        `server (no rows in pg_available_extension_versions for name='vector'). The required ` +
        `extension version >= ${REQUIRED_PGVECTOR_VERSION} ships the FP16 "halfvec" type used by ` +
        `artwork_embeddings. Use the pgvector/pgvector:pg16 image (or install pgvector >= ` +
        `${REQUIRED_PGVECTOR_VERSION}).`,
    );
  }

  if (!versions.some(isAtLeastRequired)) {
    throw new Error(
      `pgvector pre-flight failed: the installed PostgreSQL server only offers pgvector ` +
        `version(s) [${versions.join(', ')}], but >= ${REQUIRED_PGVECTOR_VERSION} is required for ` +
        `the FP16 "halfvec" type used by artwork_embeddings (a halfvec column on an older ` +
        `pgvector silently lacks the type and reverts the migration). Use the ` +
        `pgvector/pgvector:pg16 image or upgrade pgvector to >= ${REQUIRED_PGVECTOR_VERSION}.`,
    );
  }
}
