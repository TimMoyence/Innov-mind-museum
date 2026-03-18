import 'dotenv/config';
import pool from '../src/data/db';

async function main() {
  let total = 0;
  let deleted: number;
  do {
    const result = await pool.query(
      'DELETE FROM "auth_refresh_tokens" WHERE "id" IN (SELECT "id" FROM "auth_refresh_tokens" WHERE "expiresAt" < NOW() LIMIT 10000)',
    );
    deleted = result.rowCount ?? 0;
    total += deleted;
  } while (deleted > 0);
  console.log(`Purged ${total} expired refresh tokens`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
