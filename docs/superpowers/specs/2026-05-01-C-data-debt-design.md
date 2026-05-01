# C — Data Debt Hardening

**Date:** 2026-05-01
**Author:** staff DB/SRE pass — Musaium scale hardening (subsystem C of A→H decomposition)
**Status:** Approved (autonomous mode — user pre-approved subsystem C scope)
**Predecessor specs:** A1+A2 critical FK indexes (shipped 2026-05-01)
**Successor specs:** D Zod, E retention, F infra, G AI cache, H observability

---

## 1. Context

The audit identified seven data-debt items. Two are already shipped in main:

| Item | Status | Evidence |
|---|---|---|
| BullMQ retry/DLQ on knowledge-extraction worker | **Already shipped** | `extraction.worker.ts` declares `attempts: 2`, `backoff: { type: 'exponential', delay: 30_000 }`, `removeOnFail: 500`, and Sentry-on-final-attempt via `handleJobFailure` (shared queue handler). |
| `seed-museums.ts` ON CONFLICT idempotency | **Already shipped** | The script's bulk insert uses `.orIgnore()` (TypeORM helper that emits `ON CONFLICT DO NOTHING`). |

Five remain. This spec covers them.

## 2. Goals

1. **Lost-update protection on admin Museum edits** — concurrent admin writes today silently overwrite each other.
2. **Atomicity for `art_keywords.upsert()`** — the singular-keyword path is read-modify-write; under contention it loses hits.
3. **Document and test the concurrency design** for `ChatSession` and `UserMemory` so future maintainers do not accidentally introduce retries (ChatSession) or optimistic-lock race surfaces (UserMemory atomic UPSERT).
4. **Prevent recurrence of `Check1776`-style data-loss-bearing migrations** by strengthening the in-file caveat and adding a project guideline; the migration itself is already applied in dev/staging/prod and cannot be rewritten without a checksum mismatch.
5. **Document `museum_qa_seed.museumId` as a free-form pack identifier**, not a foreign key. The audit flagged the `varchar(64) ≠ integer` mismatch with `museums.id`; the right resolution is documentation, not a type migration (offline packs ship with stable string IDs that may not even map to the museums table).

Non-goals:

- Rewriting Check1776 (impossible without checksum break).
- Adding a real FK on `museum_qa_seed.museumId` (free-form by design).
- Auto-retry on ChatSession version conflicts (UX decision: surface 409).

---

## 3. Architecture

The five items are independent and ship in five focused commits. Each is small enough to review in isolation. Order does not matter — they touch different modules.

### 3.1 C.1 — Museum @VersionColumn + admin retry handler

**Problem:** `Museum` entity has no `@VersionColumn`. Two admin tabs editing the same museum simultaneously — last write silently wins, the earlier edit is lost.

**Fix:** add `@VersionColumn() version!: number` to the entity. TypeORM increments it on every save and throws `OptimisticLockVersionMismatchError` if the in-memory entity's version is stale.

For admin-driven writes, surfacing a hard 409 to the operator is acceptable but unfriendly — admins typically retry by hand. We add a small wrapper `withOptimisticLockRetry(fn, { maxAttempts: 3, baseDelayMs: 50 })` in `src/shared/db/optimistic-lock-retry.ts` that:
1. Calls the supplied function.
2. Catches `OptimisticLockVersionMismatchError`.
3. Refetches the entity (caller-provided refetch fn) and re-runs the mutation up to `maxAttempts - 1` times with jittered exponential backoff.
4. Surfaces the final failure as a `409 conflict` AppError if all retries exhausted.

Admin update paths wrap their mutation in this helper. Net effect: short-lived contention is invisible to the operator; sustained contention surfaces a meaningful 409.

Migration: `AddMuseumVersionColumn` — adds `version integer NOT NULL DEFAULT 1` column.

### 3.2 C.2 — `art_keywords.upsert()` atomic conversion

**Problem:** `TypeOrmArtKeywordRepository.upsert()` (line 36) reads, mutates `existing.hitCount += 1`, saves. Two concurrent calls on the same `(keyword, locale)` race: both read the same `existing.hitCount`, both add 1, both write — one increment lost.

**Fix:** rewrite `upsert()` to use the same atomic `INSERT ... ON CONFLICT (keyword, locale) DO UPDATE SET hitCount = ... + 1` pattern that `bulkUpsert()` already uses. Single SQL statement, atomic at the row level. No race possible.

The current `bulkUpsert()` returns `void`; `upsert()` returns the resulting `ArtKeyword`. The fix uses `INSERT ... RETURNING *` so the row identity remains stable.

No migration required (column unchanged). Repository test added (`recordKeywordHit` → expects exactly +1 on the row even under interleaved-call simulation).

### 3.3 C.3 — Concurrency design documentation + tests

Three places already implement the right thing. They are under-documented and under-tested, which makes them likely to be "fixed" by mistake:

- `chat/useCase/message-commit.ts:135` catches `OptimisticLockVersionMismatchError` on `ChatSession` and throws `conflict('Session was modified concurrently')`. **By design we do not retry** — the assistant reply was generated against an older session snapshot; retrying could write inconsistent state. The 409 forces the client to refresh.
- `chat/adapters/secondary/userMemory.repository.typeorm.ts:23` uses raw `INSERT … ON CONFLICT (user_id) DO UPDATE` — atomic, no race, no need for the `@VersionColumn` to fire.
- `chat/domain/userMemory.entity.ts:62` declares `@VersionColumn` despite the atomic-UPSERT path. The version column is benign (it is incremented even via raw SQL because the `DO UPDATE` clause includes `version = user_memories.version + 1`? — verify).

**Action:**
- Add JSDoc on the catch block in `message-commit.ts` explaining the no-retry policy.
- Add JSDoc on `userMemory.repository.typeorm.ts:upsert()` explaining the atomic-UPSERT design and noting the `@VersionColumn` is essentially decorative.
- Two unit tests: one asserts `ChatSession` version conflict surfaces as 409 (no retry); one asserts `UserMemory.upsert()` is a single SQL round-trip (mocked QueryRunner observed).
- Verify the `DO UPDATE` clause in `userMemory.repository.typeorm.ts:upsert()` increments `version` — if not, document why and confirm no client reads it.

### 3.4 C.4 — Check1776 caveat hardening + future-prevention

**Problem:** `1776593907869-Check.ts` contains `DROP COLUMN ... ADD COLUMN` for the `user_memories` table. The in-file caveat (lines 11–16) warns operators to verify `COUNT(*) = 0` before applying. This is fragile — staging operators routinely have data and would lose it.

The migration is already applied in dev (`migrations` table contains the row). Assume the same in staging/prod. **We cannot rewrite it** — TypeORM's checksum would mismatch.

**Fix:**
1. Strengthen the in-file caveat with explicit "DO NOT REWRITE" + "for future similar migrations, prefer `ALTER TABLE ... RENAME COLUMN`" guidance.
2. Add a top-level repo guideline `docs/MIGRATION_GOVERNANCE.md` describing the rule:
   > "Never let TypeORM's `migration:generate` produce `DROP COLUMN`+`ADD COLUMN` for a column that holds production data. If the diff shows that, hand-edit the migration to use `ALTER TABLE ... RENAME COLUMN` instead. Verify with a non-empty seed before applying."
3. Optionally, add a migration-CI check that scans new migrations for `DROP COLUMN` + `ADD COLUMN` pairs on the same table within the same `up()` body and warns. Out of scope for this spec — defer to a separate ops cleanup task.

### 3.5 C.5 — `museum_qa_seed.museumId` documentation

**Problem:** `museum_qa_seed.museumId` is `varchar(64)`. `museums.id` is `integer`. They will never line up. The audit flagged this as a missing FK; the right answer is "not a FK by design" — the column holds free-form pack identifiers (e.g. `'louvre'`, `'orsay'`) that are stable across offline pack distributions.

**Fix:**
- Add JSDoc on `MuseumQaSeed.museumId` explicitly stating "free-form pack identifier, NOT a foreign key to museums.id; offline packs ship with stable string IDs."
- Add the same note to the migration that created the column (`1775557229138-AddMuseumQaSeed.ts`) — historical migrations are read by future devs trying to understand the schema.
- No DB change. No FK addition.

---

## 4. File map

```
museum-backend/
├── src/
│   ├── data/db/migrations/
│   │   ├── <ts1>-AddMuseumVersionColumn.ts           NEW — C.1
│   │   └── 1776593907869-Check.ts                     MODIFY (JSDoc only) — C.4
│   ├── modules/
│   │   ├── chat/
│   │   │   ├── adapters/secondary/
│   │   │   │   ├── artKeyword.repository.typeorm.ts   MODIFY — C.2 atomic upsert
│   │   │   │   └── userMemory.repository.typeorm.ts   MODIFY (JSDoc) — C.3
│   │   │   ├── domain/
│   │   │   │   └── userMemory.entity.ts               MODIFY (JSDoc on @VersionColumn) — C.3
│   │   │   └── useCase/
│   │   │       └── message-commit.ts                  MODIFY (JSDoc on catch) — C.3
│   │   ├── museum/
│   │   │   ├── domain/
│   │   │   │   ├── museum.entity.ts                   MODIFY — C.1 @VersionColumn
│   │   │   │   └── museumQaSeed.entity.ts             MODIFY (JSDoc) — C.5
│   │   │   └── adapters/secondary/
│   │   │       └── museum.repository.pg.ts            MODIFY — C.1 wrap mutations in retry helper
│   │   └── admin/
│   │       └── adapters/secondary/admin.repository.pg.ts  MODIFY (if admin owns Museum mutations) — C.1
│   └── shared/db/
│       └── optimistic-lock-retry.ts                   NEW — C.1 helper
└── tests/unit/
    ├── chat/
    │   ├── art-keyword-repo-atomic-upsert.test.ts     NEW — C.2
    │   ├── message-commit-version-conflict.test.ts    NEW — C.3
    │   └── user-memory-atomic-upsert.test.ts          NEW — C.3
    └── shared/db/
        └── optimistic-lock-retry.test.ts              NEW — C.1
docs/
└── MIGRATION_GOVERNANCE.md                             NEW — C.4
```

Decomposition: each file in the map has one clear responsibility. The retry helper is a pure function injected with the mutation + refetch callbacks — testable without a real DB.

---

## 5. Goals + non-goals (concrete acceptance)

### Acceptance criteria

- **C.1**: Migration applies cleanly (CONCURRENTLY not needed — small `ALTER TABLE ADD COLUMN` with `DEFAULT 1 NOT NULL` is non-blocking on Postgres 16). Admin `updateMuseum` test simulates concurrent edit and observes auto-retry success on the second attempt.
- **C.2**: New unit test asserts atomic increment under simulated interleaved calls. Existing tests pass unchanged.
- **C.3**: Two new unit tests assert design intent. Production behavior unchanged.
- **C.4**: Caveat in `Check1776` clearly says "DO NOT REWRITE". `MIGRATION_GOVERNANCE.md` exists and is linked from `CLAUDE.md`'s "Migration Governance" section.
- **C.5**: JSDoc landed on entity + migration. Drift check (`migration-cli.cjs generate`) shows no new diff related to `museum_qa_seed`.
- **No regression**: full backend test suite green except known pre-existing F13 env.test.ts failure.
- **No drift**: post-C, `migration-cli.cjs generate` reports "No changes" except for the pre-existing `totp_secrets.recovery_codes` default cast (unrelated).
- **Lint clean**: `pnpm lint` reports no new errors. Warnings unchanged.
- **TypeScript clean**: `pnpm tsc --noEmit` reports no new errors.

### Non-goals

- Adding `@VersionColumn` to other entities (out of scope; future audit if needed).
- Touching the existing `bulkUpsert` (already atomic).
- Modifying ChatSession's `@VersionColumn` semantics.
- Adding the migration-CI lint mentioned in C.4 (deferred).

---

## 6. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Adding `@VersionColumn` on `Museum` triggers TypeORM drift on next `migration:generate`. | Spec C migration adds the column AND we add the decorator in the same commit so generate sees no diff. |
| `withOptimisticLockRetry` could mask a real bug (entity perpetually stale). | Cap at 3 attempts. Beyond that, surface 409 with full context. Log every retry at WARN. |
| Atomic-upsert rewrite of `art_keywords.upsert()` changes return shape. | Use `INSERT … RETURNING *` — same `ArtKeyword` shape as before. Existing callers untouched. |
| `Check1776` caveat hardening might lull future devs into thinking the migration is safe. | Caveat explicitly says "DO NOT RUN ON NON-EMPTY user_memories TABLE WITHOUT VERIFYING". `MIGRATION_GOVERNANCE.md` is the durable rule. |
| `museum_qa_seed.museumId` documentation alone leaves the type mismatch latent. | Out-of-scope for now. Future spec may evolve `museum_qa_seed` to track its own pack version table. Documentation prevents accidental "fix". |

---

## 7. Rollout

This is local-only DB work — no infra changes. Each task = one focused commit. Pre-commit gate (5 sentinels) runs per commit. After all five tasks: full backend test suite + drift check + lint + tsc, then commit-summary tag for the wave.

No PR/push in this wave per user instruction.

---

## 8. Out of scope (explicit)

- Sub-spec D (JSONB Zod) — independent follow-up.
- Sub-spec E (retention) — independent follow-up.
- Anything touching infra (F).
- Migration governance lint script (C.4 future enhancement).
- FK addition on `museum_qa_seed.museumId` (C.5 explicit YAGNI).
