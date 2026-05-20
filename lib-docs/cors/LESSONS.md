# Lessons — cors

> Project-specific gotchas observed in the Musaium monorepo. Human-edited (NEVER auto-generated). Append-only.

## 2026-05-20 — Initial lessons (extracted from express-middleware-thin bundle)

Audit 2026-05-20 (UFR-022 refresh wave): **PASS**.

### Allowlist matrix verified

- `museum-backend/src/shared/http/cors.config.ts:resolveCorsOrigin` correctly implements the 4-cell matrix:
  - prod + `CORS_ORIGINS=` (empty) → `origin: false` (reject all — safe-by-default)
  - prod + listed → `origin: ['https://app.musaium.app', ...]`
  - dev/test + empty → `origin: true` (wildcard, DX-friendly)
  - dev/test + listed → `origin: [...]`
- 2026-04-20 audit "prod empty CORS = self-DoS" was a FALSE POSITIVE — misconfig still serves non-browser clients; only browser CORS is rejected (rightly).

### `sentry-trace` + `baggage` invariant — REGRESSION RISK

- `museum-backend/src/app.ts:144-150` currently lists `sentry-trace` and `baggage` in `allowedHeaders`. CLAUDE.md gotcha codifies this; if a developer regenerates the cors block without context, distributed tracing breaks SILENTLY (no error, just orphaned spans).
- **Recommended TECH_DEBT**: add sentinel `scripts/sentinels/cors-trace-headers.mjs` grepping `app.ts` for `'sentry-trace'` and `'baggage'` literals; fail pre-commit if missing.

### `credentials: true` pairing — VERIFIED CORRECT

- `app.ts:140-142` pairs `credentials: true` with `origin: corsOrigins` (string[] or `true` in dev). Never `'*'` in prod. OWASP HTML5 compliant.

### CSRF separation — VERIFIED

- F7 CSRF middleware (`csrfMiddleware`, mounted `app.ts:181`) is independent of CORS. Both run. OWASP cheat sheet: *"It's still important for the server to perform usual CSRF prevention."* ✅.

### Missing: `exposedHeaders`

- Musaium does NOT expose `X-Request-Id`, `X-RateLimit-*` to the browser. SPA cannot read them via `fetch`. Operational gap (LOW priority pre-launch V1) — open a TECH_DEBT if FE Sentry SDK starts wanting `X-Request-Id` to tag breadcrumbs.

### Missing: `maxAge`

- No `maxAge` set → browser uses default (5s Chrome, 24h Firefox). High preflight chatter on chatty SPAs. Operational tuning candidate.

### Anti-patterns absent

- ❌ cors as authz — NO (real authz lives in `isAuthenticated` middleware).
- ❌ wildcard + credentials — NO.
- ❌ origin reflection without allowlist — NO.
- ❌ OPTIONS handler after verb handler — N/A (global mounting, no per-route OPTIONS that could land out of order).
