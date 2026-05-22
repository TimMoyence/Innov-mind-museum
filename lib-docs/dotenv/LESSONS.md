# Lessons — dotenv

> Project-specific gotchas observed in the Musaium monorepo. Human-edited (NEVER auto-generated). Append-only.

## 2026-05-20 — Initial lessons (extracted from express-middleware-thin bundle)

Audit 2026-05-20 (UFR-022 refresh wave): **PASS-with-notes**.

### Load chain — verified, but FRAGILE

- `src/index.ts:1` imports `'./instrumentation'` FIRST.
- `instrumentation.ts` calls `initSentry()` + `initOpenTelemetry()` — both read `process.env.SENTRY_DSN`, `OTEL_*` directly.
- `dotenv.config()` does NOT run until `src/config/env.ts:38` is transitively imported (later in the graph).
- **Implication**: Sentry + OTel env vars MUST come from the OS shell environment (Docker / nodemon / CI workflow env), NOT `.env`. This works today because Docker compose + CI workflows export them, but it is BRITTLE:
  - If a developer adds a new env-reading initializer ABOVE the first transitive `env.ts` import, blanks ship silently.
  - If someone moves `dotenv.config()` even later, more init code starts reading blanks.
- **TECH_DEBT candidate TD-DEN-01** (LOW): document the load chain in `docs/observability/DISTRIBUTED_TRACING.md`; consider `import 'dotenv/config'` as line 1 of `index.ts` for belt-and-suspenders.

### `NODE_ENV !== 'test'` guard — VERIFIED CORRECT

- `src/config/env.ts:37-39` short-circuits `dotenv.config()` under Jest. Without this, `.env` file in the repo contaminates controlled-env tests. Pattern is correct; keep it.

### `.env.example` parity — NO sentinel today

- `museum-backend/.env.example` (10 KB, 19/05 mtime) exists and is human-maintained. NO automation enforces parity with code reads.
- Risk: a new env var lands in `src/config/env.ts` without `.env.example` update → fresh contributor / CI runner can't bootstrap.
- **TECH_DEBT candidate TD-DEN-02** (MEDIUM): `scripts/sentinels/env-example-parity.mjs` — diff `process.env.X` reads in `src/**/*.ts` vs keys in `.env.example`, fail pre-commit on mismatch.

### CI `DB_SYNCHRONIZE` gate — VERIFIED

- CLAUDE.md § Migration Governance: *"CI blocks if `DB_SYNCHRONIZE=true` found in any `.env*` file"*. Sentinel works. `data-source.ts` hard-codes `false` for prod regardless.

### `.gitignore` — VERIFIED CORRECT

- `museum-backend/.gitignore` blocks `**/.env`, `**/.env.*`, whitelists `*.example` only. `.env.host-mode` would be blocked except it is whitelisted (operator wants it tracked for the host-Docker mode runbook).
- `.env` files in repo are NOT staged (verified `git status` 2026-05-20).

### Scripts using `import 'dotenv/config'` — VERIFIED LINE 1

10 maintenance scripts in `museum-backend/scripts/*.ts` correctly place `import 'dotenv/config'` as the very first line. ESM hoisting is irrelevant when the import is also lexically first.

### `quiet` default in v17 — minor CI log noise

- v17 flipped `quiet` default to `false`. Musaium calls `dotenv.config()` with no args → emits `[dotenv@17.x.x] injecting env (N) from .env` to stderr every test run / boot.
- **TECH_DEBT candidate TD-DEN-03** (LOW): `dotenv.config({ quiet: process.env.NODE_ENV !== 'development' })` to keep dev verbose but silence CI.

### Anti-patterns absent

- ❌ `.env` committed — NO (gitignore enforces).
- ❌ `import 'dotenv/config'` AFTER other imports — NO (all 10 scripts have it line 1).
- ❌ `dotenv.config({ debug: true })` in prod — NO.
- ❌ logger serialising `process.env` — NO (winston logger does not serialise globals).
- ❌ `DB_SYNCHRONIZE=true` in any `.env*` — NO (CI gate enforces).

### Open follow-ups

- **TD-DEN-01** (LOW): document load chain risk in observability doc.
- **TD-DEN-02** (MEDIUM): `.env.example` parity sentinel.
- **TD-DEN-03** (LOW): `quiet: true` in CI to reduce log noise.
- **dotenvx** evaluation deferred to V1.1+ (encrypted-env not on critical path).
