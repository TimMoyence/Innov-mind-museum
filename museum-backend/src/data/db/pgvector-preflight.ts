/**
 * I-OPS6 — pgvector >= 0.7.0 pre-flight guard.
 *
 * `AddArtworkEmbeddings` installs the `vector` extension and immediately uses
 * the FP16 `halfvec(768)` type, which only exists on pgvector >= 0.7.0. On a
 * 0.6.x host the extension installs but the `halfvec` DDL fails with an opaque
 * error and the migration reverts on the first `migration:run` (CLAUDE.md
 * "Pièges connus" / ADR-037).
 *
 * `assertPgVectorAvailable` queries `pg_available_extension_versions` — the
 * AVAILABLE versions (not `pg_extension.extversion`, since on a fresh DB the
 * extension is not yet created) — and fail-fasts with an actionable error
 * naming the required version BEFORE any DDL runs. It is a defence-in-depth
 * guard for fresh-DB / DR / wrong-image bootstraps, NOT a substitute for the
 * correct `pgvector/pgvector:pg16` image.
 */

/** Minimum pgvector extension version that ships the FP16 `halfvec` type. */
const REQUIRED_PGVECTOR_VERSION = '0.7.0';

const REQUIRED_PARTS = REQUIRED_PGVECTOR_VERSION.split('.').map(Number);

/** A query-capable surface (TypeORM `DataSource` or `QueryRunner` both satisfy this). */
export interface PgVectorQueryRunner {
  query(sql: string): Promise<unknown>;
}

interface AvailableVersionRow {
  version?: unknown;
}

/**
 * Compares a `major.minor.patch` semver-ish string against {@link REQUIRED_PARTS}.
 * Returns true when `version >= REQUIRED_PGVECTOR_VERSION`. Non-numeric / malformed
 * segments are treated as 0 (conservative: a garbage version never satisfies the
 * requirement on its own).
 */
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

/**
 * Throws if no installable pgvector version >= 0.7.0 is available on the
 * connected Postgres server. Safe to call AFTER `AppDataSource.initialize()`
 * and BEFORE `runMigrations()` (a live connection is required).
 *
 * @throws {Error} with an operator-facing, English message naming `0.7.0` and
 *   `halfvec` when the requirement is unmet, or naming the `vector` extension
 *   when it is not packaged at all.
 */
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
