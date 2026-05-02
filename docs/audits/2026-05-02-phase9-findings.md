# Phase 9 — Production bug findings (Sprint 9.4 Group H)

_Generated 2026-05-02 by Phase 9 chat-repository-typeorm integration test._

> **STATUS — Phase 10 closed both bugs.** Bug 2 fixed in Sprint 10.1
> (commit `a7849fc8`, MessageFeedback findOne/delete switched to the
> explicit `messageId` column). Bug 1 fixed in Sprint 10.2 (commit
> `0999cd9d`, migration `1777721420875-ChatTimestamptz` converts five
> chat timestamp columns to `TIMESTAMP WITH TIME ZONE`). All 6
> `it.skip` markers flipped to `it()`; the integration suite is now
> 41/41 under `RUN_INTEGRATION=true`, including the original Bug 1
> repro under `TZ=Europe/Paris`. Sections below preserved as the
> post-mortem reference.

The Phase 9 Sprint 9.4 integration tests against a real Postgres testcontainer
surfaced two latent bugs in the `TypeOrmChatRepository` adapter. Both are
pinned via `it.skip` in
`museum-backend/tests/integration/chat/chat-repository-typeorm.integration.test.ts`
with `// TODO Phase 10` markers.

## Bug 1 — Cursor pagination broken outside UTC

**Severity:** Latent. Production CI + servers run UTC so the path is
asymptomatic on prod. Local dev environments running on a non-UTC host
(e.g. `TZ=Europe/Paris`) silently return empty pages on `listSessionMessages`
+ `listSessions` 2-page cursor walks.

**Root cause:** The cursor encodes `last.createdAt.toISOString()` (UTC suffix
`Z`). The schema column is `TIMESTAMP WITHOUT TIME ZONE`. TypeORM parameter
binding coerces the bound `Date` to the host timezone; on `TZ=Europe/Paris`
the comparison `< :cursorDate` against UTC-encoded timestamps returns empty.

**Reproduction:** with `TZ=Europe/Paris RUN_INTEGRATION=true pnpm test:integration --testPathPattern=chat-repository-typeorm`,
the 2 cursor-walk tests fail; they pass under `TZ=UTC`.

**Fix candidates:**
- Switch the column type to `TIMESTAMPTZ` (requires migration + back-fill).
- Or: drive the cursor comparison via raw `to_timestamp(:millis / 1000)`
  binding instead of `Date` parameter binding (no schema change).

**Affected callers:** every consumer of paginated chat history. UI list
endpoints + GDPR export + admin moderation queues.

## Bug 2 — `getMessageFeedback` generates malformed SQL

**Severity:** Direct production breakage. Caller
`museum-backend/src/modules/chat/useCase/chat-media.service.ts:178` invokes
this method on every chat-media interaction; the broken SQL throws on
non-empty feedback tables.

**Root cause:** `findOne({ where: { message: { id: ... } }, select: ['value'] })`
generates a TypeORM-internal query of shape
`SELECT distinctAlias.MessageFeedback_id FROM ... distinctAlias` — but the
`distinctAlias` CTE never actually projects `MessageFeedback_id`, so Postgres
errors with `column "messagefeedback_id" does not exist`. This is a known
TypeORM behaviour when combining a relation-where with a `select` projection
on the parent entity.

**Fix candidates:**
- Switch to a direct `messageId` column lookup:
  `repo.findOne({ where: { messageId: id, userId }, select: ['value'] })`.
  Requires the `messageId` FK column to be exposed on the entity (it likely
  already is via `@RelationId`).
- Or: drop the `select` projection and read the full row.

## Phase 10 action items

- [ ] Investigate Bug 1; choose between TIMESTAMPTZ migration vs raw bind.
- [ ] Fix Bug 2 directly in `chat.repository.typeorm.ts:464` (the `findOne`
      call); flip the 4 `it.skip` MessageFeedback tests back to `it`.
- [ ] After both fixes, the 6 `it.skip` markers in the integration test can
      flip to `it`. Re-run:
      `RUN_INTEGRATION=true pnpm test:integration --testPathPattern=chat-repository-typeorm`
      → expect 41/41 pass.

## Other Phase 9 deferrals (recap)

- bullmq-enrichment-scheduler.adapter.ts integration test — needs Redis
  testcontainer harness extension.
- HTTP-route flake root-cause (`--testTimeout=30000` hack in `test:coverage`)
  — investigate `swc-jest` swap.
- Web Vitest uplift (Q5=a) — only if real value beyond Playwright + a11y +
  Lighthouse coverage.
