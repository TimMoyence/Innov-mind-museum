# Lessons — reflect-metadata (v0.2.2)

Project-specific gotchas. First dedicated lessons file (the previous PATTERNS.md was a stub pointing to express-middleware-thin — corrected 2026-05-20).

## 2026-05-20 — Import discipline verified (audit)

Imports cataloged (`grep -rn "reflect-metadata" museum-backend/src museum-backend/tests`) :

| Path                                                                                    | Line | Rationale                                              |
| --------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------ |
| `museum-backend/src/index.ts`                                                           | 2    | App entry, line 2 (after `./instrumentation` OTel boot) |
| `museum-backend/src/data/db/data-source.ts`                                             | 1    | TypeORM DataSource module — required when imported standalone |
| `museum-backend/src/data/db/run-migrations.ts`                                          | 1    | CLI binary entry (`pnpm migration:run`)                 |
| `museum-backend/tests/helpers/integration/integration-harness.ts`                       | 1    | Integration harness root                                |
| `museum-backend/tests/unit/data/db/migrations/AddP1FKAndTokenIndexes.spec.ts`           | 1    | Unit migration spec, isolated jest env                  |
| `museum-backend/tests/unit/data/db/migrations/AddCriticalChatIndexesP0.spec.ts`         | 1    | Unit migration spec, isolated jest env                  |
| `museum-backend/tests/unit/chat/art-keyword-repo-atomic-upsert.test.ts`                 | 1    | Unit repo spec, isolated jest env                       |

**Total: 7 imports**, all at entry-point boundaries. Zero leak into entity/service/route files. Discipline is healthy — DO NOT dilute by adding the import inside `*.entity.ts` or feature modules.

## 2026-05-20 — Why this isn't bundled into express-middleware-thin

The previous stub PATTERNS.md said "this package is documented under the express-middleware-thin family". That was wrong:

- `reflect-metadata` has zero overlap with Express middleware. It's a runtime polyfill consumed at process boot, not a request pipeline component.
- The footguns are different: load-order vs middleware ordering, tsconfig flag pairing vs Express settings, Stage-3 decorator interaction vs Connect-style next() chains.
- Reviewers looking up `reflect-metadata` gotchas would not find them in `express-middleware-thin/PATTERNS.md`.

Decision logged 2026-05-20: keep dedicated PATTERNS.md + LESSONS.md going forward.

## 2026-05-20 — Stage-3 decorators are NOT a viable swap

Verified via TC39 / TypeScript / TypeORM issue trail:

- TC39 stage-3 decorator metadata DOES exist (Stage 3 since 2023) but populates `context.metadata` (a per-class `Symbol.metadata` slot), NOT the global `Reflect` namespace.
- The Stage-3 metadata channel does NOT carry design-time TypeScript types (microsoft/TypeScript#57533, OPEN).
- TypeORM column-type inference reads `'design:type'` from `Reflect.getMetadata` — that key is emitted ONLY by `--experimentalDecorators` + `--emitDecoratorMetadata`, which together require `reflect-metadata`.
- Upstream TypeORM issue (#10869) is open with maintainer stance "can't migrate until TS surfaces design-time types in Stage-3".

**Implication for Musaium**: do not attempt a "modernize decorators" refactor before V1. The blocker is upstream TS + ORM, not us.

## 2026-05-20 — Avoid silent emit drops

The footgun that costs hours when it bites:

- `emitDecoratorMetadata: true` WITHOUT `experimentalDecorators: true` is a no-op. TS doesn't warn.
- Forgetting to import `reflect-metadata` before the first decorated class load is a no-op. TS doesn't warn.
- TypeORM's failure mode is a runtime crash at `AppDataSource.initialize()` with a generic "Cannot infer type for property X" — easy to misdiagnose as schema drift.

Guard: keep both flags in `tsconfig.json` paired (currently both `true`) and keep the entry-point `import 'reflect-metadata'` as the absolute-first import (currently line 2, after the OTel instrumentation side-effect import which must come even earlier).

## 2026-05-20 — Renovate exact-pin reminder

Pin is `"reflect-metadata": "0.2.2"` exact (no caret). Cross-ref CLAUDE.md "Renovate `config:best-practices` force-pin" gotcha. Library is minimally maintained, last release 14+ months ago — a Renovate PR on this package should trigger a conscious review, not a rubber-stamp merge.

## Status

NO TD entry. NO action needed. Pin is current, audit clean. Watch the TypeORM v1 / TS#57533 trail for future migration signal.
