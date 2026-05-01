# Migration Governance

This document defines the rules every backend migration MUST follow before
landing in `museum-backend/src/data/db/migrations/`.

## 1. Always generate via the project CLI

```bash
node scripts/migration-cli.cjs generate --name=<MigrationName>
# OR for hand-authored bodies (e.g. CONCURRENTLY index migrations):
node scripts/migration-cli.cjs create --name=<MigrationName>
```

NEVER hand-create the migration filename — the timestamp prefix is the
TypeORM ordering key and must be CLI-issued.

## 2. Never let TypeORM emit `DROP COLUMN` + `ADD COLUMN` on the same column

TypeORM's `migration:generate` cannot detect column renames. When it sees a
property renamed on an entity, it emits a `DROP COLUMN <old>` followed by
an `ADD COLUMN <new>` — **destroying any data in that column on every
target environment that hasn't run the migration yet.**

If the diff TypeORM generates contains both `DROP COLUMN "X"` and `ADD COLUMN
"Y"` on the same table within the same `up()` body, **edit the migration
by hand before committing** to use `ALTER TABLE … RENAME COLUMN`:

```ts
await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "old_name" TO "newName"`);
```

The same applies to `down()` — use `RENAME COLUMN` in reverse.

## 3. Verify against a non-empty seed before applying

Before pushing a migration that touches a table with production data:

```bash
# Apply migrations cleanly first.
pnpm migration:run
# Seed a representative dataset (the smaller of seed-museums.ts or
# seed-perf-load.ts is usually enough for a smoke check).
pnpm seed:museums
# Run the new migration. Then verify row counts + sample row contents
# against pre-migration snapshots.
```

If the migration drops or transforms data, the smoke test MUST surface that
explicitly.

## 4. CONCURRENTLY index migrations require `transaction = false`

For zero-downtime index migrations:

```ts
export class AddSomeIndex1234567890123 implements MigrationInterface {
  name = 'AddSomeIndex1234567890123';
  public readonly transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_..." ON "..." ("...")`,
    );
  }
  // ...
}
```

The `migration:run` and `migration:revert` npm scripts in
`museum-backend/package.json` are wired with `--transaction each` and
`--transaction none` respectively to honour the per-migration override.

## 5. Always add the matching `@Index('IDX_<name>')` decorator

Without the decorator, TypeORM sees the index as "extra" and the next
`migration:generate` run produces a migration dropping it. See
[`A1+A2 critical FK indexes spec`](./superpowers/specs/2026-04-30-A1-A2-critical-fk-indexes-design.md)
section 6.1 for the full rationale (option α — annotation-only fix).

## 6. Always run `migration-cli.cjs generate --name=DriftCheck` after a migration

Expected output: `No changes in database schema were found - cannot generate
a migration.`

A drift file means TypeORM thinks the schema differs from the entity
metadata — usually a missing decorator or a column-shape mismatch. Inspect
the generated file, fix the entity (or the migration), then re-run.

The `totp_secrets.recovery_codes` default cast is a known pre-existing
drift unrelated to current spec work — its presence in a `DriftCheck` file
is acceptable; anything else is a real drift to fix.

## 7. Never `--no-verify` the pre-commit hook

The 5-gate pre-commit pipeline (gitleaks, env-policy, lint-staged, as-any
ratchet, root-hygiene) is non-negotiable. If a gate fails, fix the root
cause; don't bypass the hook.

## 8. Reference incidents

- **`Check1776593907869`** — schema drift migration that DROPs+ADDs the
  `user_memories` columns. Already applied everywhere; left as-is with a
  strengthened in-file caveat. This document exists primarily so the same
  shape is never generated again.
