# ADR-043 — TypeORM → Drizzle / Prisma migration deferred post-launch (H2 2026)

- **Status** : Deferred
- **Owner** : Tim
- **Created** : 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12)
- **Source** : `docs/audit-cleanup-2026-05-12/PLAN_MASTER.md` (hors-scope V1) + CLAUDE.md "Dependency Monitoring"

## Context

TypeORM docs repo was archived March 2026. v1.0 is planned H1 2026 with breaking changes. Current state: TypeORM works in `museum-backend`, the migration is not urgent. Alternatives considered: Drizzle (S-tier 2026), Prisma 7, Kysely. See [[ADR-002-typeorm-1-0-mitigation]] for prior watch.

## Decision

Defer ORM swap to H2 2026 post-launch. V1 (2026-06-01) and ≥3 months of prod stability ships on TypeORM unchanged. Re-evaluation in 2026-Q4 sprint (target window 2026-Q4).

## Why

- ORM swap touches ~34 migrations + every repository + entity + relation. Banking-grade hot files involved (chat schemas, auth, JSONB validators).
- No security force factor (TypeORM is not EOL).
- Pre-launch hardening sprint must not be diluted by a non-functional refactor.

## Concrete migration plan (when re-opened H2 2026)

Phase 1 — assessment (1 week)
- Build a representative Drizzle and Prisma 7 spike on `museum_session` + `chat_message` (2 entities, 1 relation).
- Measure: migration ergonomics, generated SQL clarity, type-safety strength, perf delta on the read-heavy /chat path.

Phase 2 — decision ADR
- Author ADR-XXX selecting Drizzle vs Prisma 7 vs Kysely vs status quo.

Phase 3 — strangler-fig migration
- New entities use the chosen ORM. Existing entities migrate one bounded-context at a time (admin → support → review → museum → auth → chat).
- Each context migration is a separate PR with full migration generation + revert dry-run.

## Reopen trigger

Any of: TypeORM v1.0 breaking change blocks a Renovate auto-merge, TypeORM CVE published, post-launch dev velocity audit shows ORM ergonomics in top-3 friction points.
