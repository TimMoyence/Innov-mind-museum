# ADR-002 — TypeORM 1.0 mitigation

- **Status**: Proposed (2026-04-20)
- **Context window**: pinned before investigation / decision
- **Owner**: Backend

## Context

TypeORM v1.0 ships in H1 2026 with breaking API changes (release notes confirmed via websearch 2026-04-20 against `dev.typeorm.io/docs/releases/1.0/release-notes/`):

- `findByIds` / `findOneById` removed → use `findBy` + `In` operator / `findOneBy`
- `@EntityRepository` / `AbstractRepository` / `getCustomRepository` removed → `Repository.extend()`
- Rename `connection` → `dataSource` in `EntityManager`, `Repository`, `QueryBuilder`, `QueryRunner`
- `@RelationCount` removed → `@VirtualColumn` + sub-query
- Drop `Repository.exist()` → `Repository.exists()`
- Drop `TYPEORM_*` env variable support
- Drop old drivers (legacy Redis, old sqlite3, old mysql)

A codemod is published (`@typeorm/codemod v1 src/`) that automates most of the rename surface.

Separately the TypeORM docs repository was archived in March 2026 (dead project signal). Community alternatives gaining traction in 2026 : **Drizzle** (S-tier), **Prisma 7**, **Kysely**.

The InnovMind backend is at `typeorm@^0.3.27` (113 migrations, 19 entities, heavy hexagonal repo adapters).

## Decision

1. **Pin** `typeorm` in `museum-backend/package.json` to `>=0.3.27 <1.0.0` to prevent unsupervised auto-upgrade via `pnpm update`.
2. **Do not migrate yet** — 0.3.x works, no known vulnerabilities, and H1 2026 is still the target for v1.0.
3. **Spike planned** (not executed in this ADR): branch `spike/typeorm-v1-codemod`, run the codemod, measure diff, report on outcome. Owner TBD.
4. **Re-evaluation** when either : (a) TypeORM v1.0 ships stable, or (b) a new critical CVE appears on 0.3.x, or (c) a blocker arises that Drizzle would solve cleanly.

## Rejected alternatives

- **Upgrade to 1.0 now** — rejected: breaking changes without production need, no bandwidth this sprint.
- **Migrate to Drizzle now** — rejected: large effort (~3 sprints) on stable infra with no present pain.
- **Stay unpinned** — rejected: `^0.3.27` would auto-install 1.x when tagged stable, surprise regression risk.

## Consequences

### Positive
- Deterministic dependency resolution until decision ready.
- Upgrade path preserved (codemod path identified).
- No immediate cost.

### Negative
- Technical debt explicitly tracked, not resolved.
- If `pnpm install` runs `--latest` flag, pin must be re-stated.

### Reversibility
- Fully reversible — change the semver range to migrate.

## Links

- [TypeORM 1.0 Release Notes](https://dev.typeorm.io/docs/releases/1.0/release-notes/)
- [Release plan #11819](https://github.com/typeorm/typeorm/issues/11819)
- Audit enterprise-grade 2026-04-20 : [`docs/plans/MASTER_PLAN.md`](../plans/MASTER_PLAN.md) (Phase 3)
