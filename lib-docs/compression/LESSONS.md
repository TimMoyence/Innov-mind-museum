# Lessons — compression

> Project-specific gotchas observed in the Musaium monorepo. Human-edited (NEVER auto-generated). Append-only.

## 2026-05-20 — Initial lessons (extracted from express-middleware-thin bundle)

Audit 2026-05-20 (UFR-022 refresh wave): **PASS-with-notes**.

### SSE filter — VERIFIED CORRECT

- `museum-backend/src/app.ts:164-169` custom `filter` short-circuits `text/event-stream`. Pattern from upstream README §"Server-Sent Events" applied correctly. No `res.flush()` calls needed since SSE bypasses compression entirely.

### Mounting order — VERIFIED CORRECT

- helmet (`:128`) → cors (`:138`) → rateLimit (`:154`) → compression (`:164`) → timeout (`:173`) → json (`:177`). All four critical invariants hold:
  - helmet BEFORE compression (security headers ship on all responses).
  - rateLimit BEFORE compression (429 responses uncompressed by default — fine; rate-limit body is tiny).
  - compression BEFORE route handlers (must wrap `res.write` / `res.end`).
  - compression BEFORE body parsers (req-side processing, fine ordering-wise; response-side wraps anyway).

### BREACH exposure — OPEN OBSERVATION (TD-CMP-01 candidate)

- Musaium chat / auth / admin JSON responses CAN embed per-request secrets:
  - CSRF token mirrored in cookie + sometimes echoed in JSON for SPA bootstrap.
  - Signed S3 URLs in admin media flows (HMAC-bearing query params).
  - OIDC nonces in `/api/auth/social/init` responses.
- Compression is ENABLED globally on these routes (the SSE filter does not cover them).
- BREACH is non-trivial to exploit in practice (requires MITM-positioned attacker + many requests + the secret in the body verbatim), but the mitigations are CHEAP:
  - Custom `filter` denylist for secret-carrying routes (template in PATTERNS.md §3.1).
  - Set `Cache-Control: no-store, no-transform` on those responses (middleware honours `no-transform` natively).
- **TECH_DEBT candidate**: TD-CMP-01 — extend compression filter with BREACH-sensitive route denylist OR audit each response for explicit `no-transform`.

### `Vary: Accept-Encoding` — VERIFIED PRESENT

- Middleware sets it natively. nginx VPS config (per `docs/OPS_DEPLOYMENT.md`) does NOT strip it. CloudFront cache key includes `Accept-Encoding` by default. No cache poisoning vector observed.

### Threshold / level — defaults kept, no perf complaint

- `threshold: 1kb` (default). JSON responses ≤1KB skip compression (auth tokens, error 4xx). Acceptable.
- `level: -1` (Z_DEFAULT_COMPRESSION ≈ 6). CPU profile under load test (`pnpm perf:chat:mock`) shows compression overhead <2% of total request time — no tuning needed.

### Anti-patterns absent

- ❌ compression as body-size limit — NO (`express.json({ limit: env.jsonBodyLimit })` enforces).
- ❌ SSE without `res.flush()` — N/A (filter short-circuits SSE entirely).
- ❌ override `no-transform` — NO.
- ❌ mount before helmet — NO.

### Open follow-ups

- **TD-CMP-01** (MEDIUM): BREACH-sensitive route denylist OR per-response `no-transform` discipline.
- **TD-CMP-02** (LOW): consider `maxAge: 600` on cors preflight to reduce OPTIONS chatter; unrelated to compression but documented here because both live in `app.ts`.
