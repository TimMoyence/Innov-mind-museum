# Lessons — express-middleware-thin (cors + compression + dotenv + reflect-metadata + p-limit)

Audit 2026-05-18 : **PASS-with-notes**.

## ✅ cors — secure-by-default
- `cors.config.ts:resolveCorsOrigin(env.corsOrigins, isProd)` — prod+empty → `false` (safe reject), prod+listed → string[], dev → true
- `credentials: true` paired with explicit origin array (NEVER `'*'`)
- methods + allowedHeaders enumerated
- ADR-006 documented

## ✅ compression — SSE-safe
- `app.ts:131-138` custom filter skip `text/event-stream` (avoids SSE deflate buffering)
- Defaults level/threshold acceptable
- Vary header managed natively

## ✅ dotenv — properly guarded
- `env.ts:3,36` import + `dotenv.config()` guarded by `NODE_ENV !== 'test'`
- `.gitignore:146-151` blocks `.env`, `**/.env`, `**/.env.*` (whitelists `*.example` only)
- Load order : env.ts imported transitively via index.ts → instrumentation → @shared chain (BEFORE first process.env read)

## ⚠️ reflect-metadata — 16 import sites (multi-entry justified)
- server entry + migrations CLI + per-script CLIs + test setup. NOT nested module duplication.
- **Improve TD-MID-01** : consolidate 4 ad-hoc test imports → single Jest setupFiles entry (PATTERNS §7).

## ⚠️ p-limit — Renovate caveat
- `package.json:153` declares `'^3'` (loose range). PATTERNS §5.1 : 'do NOT write "^3" alone, Renovate may interpret loosely'.
- **Fix TD-MID-02** : tighten to `'^3.1.0'` lock CJS line. Verify CLAUDE.md Renovate gotcha entry includes p-limit ignore rule.
- Single usage `chat/useCase/llm/semaphore.ts:1,38` wrapped in Semaphore class — one limiter per logical bottleneck.

## ✅ Anti-patterns absent
- ❌ cors as authz (PATTERNS §4.1) — NO
- ❌ compression on SSE (PATTERNS §4.2) — NO (custom filter)
- ❌ commit `.env*` files (gitignore enforces) — NO
- ❌ p-limit v4+ ESM (Renovate cap enforced) — NO
