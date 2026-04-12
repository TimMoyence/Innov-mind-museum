#!/usr/bin/env node
/**
 * Prints the number of rows in the TypeORM `migrations` table to stdout.
 *
 * Used by the CI rollback flow: counts applied migrations before and after
 * `migration:run` so the rollback step knows exactly how many `migration:revert`
 * calls are needed to undo the current deploy.
 *
 * Exit code 0 on success (even if the table is empty), non-zero on DB error.
 */

const { AppDataSource } = require('../dist/src/data/db/data-source');

async function main() {
  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.query('SELECT COUNT(*)::int AS n FROM migrations');
    const count = rows[0] && typeof rows[0].n === 'number' ? rows[0].n : 0;
    process.stdout.write(String(count));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  process.stderr.write(`[count-applied-migrations] ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
