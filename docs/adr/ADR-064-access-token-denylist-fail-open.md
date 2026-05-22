# ADR-064 — Access-token denylist Redis adapter is fail-OPEN

> Renumbered from ADR-062 → ADR-064 on 2026-05-22 to avoid clash with the
> already-merged ADR-062 (canonical legal content source) from PR #294.
> Filename, content and decision are otherwise unchanged; all internal
> "ADR-064" mentions in this file refer to itself.

> **Status:** Accepted · **Date:** 2026-05-21 · **Deciders:** Tech Lead
> **Run:** `team-state/2026-05-21-p0-c3-auth-crypto/`
> **Closes:** I-SEC7b (P0 security sweep, `docs/ROADMAP_PRODUCT.md` ligne 206) ; spec R9, design D9.

---

## Context

Before this run, the auth chain had **no server-side mechanism to revoke an already-issued access token** : `authSession.service.logout` revoked only the refresh token via `RefreshTokenRepository.revokeByJti`. The access token (TTL ≤ 15 min, signed `HS256` w/ `jti` claim per `token-jwt.service.ts:130`) remained cryptographically valid until natural expiry. This contradicted the operational requirement *"kill all sessions for user X within 15 min"* implicit in any incident-response runbook, and left a 15-min window where a stolen/leaked access token continued to authenticate requests post-logout.

The fix introduces a port `IAccessTokenDenylist` (`museum-backend/src/modules/auth/domain/session/access-token-denylist.port.ts`) consumed by `isAuthenticated` / `isAuthenticatedJwtOnly` (`museum-backend/src/shared/middleware/authenticated.middleware.ts`) after `jwt.verify` succeeds. The default production adapter is Redis-backed (key shape `denylist:access:<jti>`, TTL = remaining access-token lifetime, written via `SET ... EX ... NX` on logout per `lib-docs/ioredis/PATTERNS.md` §3 DO #6). The denylist is consulted on **every authenticated request** : `EXISTS denylist:access:<jti>` → if present, 401 `TOKEN_REVOKED`.

**Forces at play :**

1. **Defense-in-depth, not primary identity.** The authoritative identity layer remains JWT signature + `exp` + refresh-rotation invariants (`token-jwt.service.ts:80-110`, `:80` algorithms HS256 pinned, iss/aud pinned). The denylist is an **additive layer** that converts logout from "refresh-only revocation" to "refresh + access revocation" — it is not the load-bearing identity check.

2. **Redis is a shared SPOF.** The same Redis instance backs rate-limits, login sliding-window, LLM cost counter, nonce store, and (now) the denylist. The cluster C4 triage (`team-state/2026-05-21-p0-security/triage.md`) listed `I-SEC1` (Redis no `maxmemory`, `noeviction` policy) as a P0 — the cost-counter's pre-existing fail-CLOSED behavior **already converts a Redis OOM into a global chat outage**. Adding a second fail-CLOSED dependency on the same Redis amplifies the blast radius : every Redis hiccup becomes a global authentication outage.

3. **Logout is the operational trigger.** In steady state, only logout writes to the denylist (1 LPUSH/SET per logout ≪ 1 QPS sustained for V1's 8k MAU target). The denylist is **read on every authenticated request** (high QPS), **written rarely** (low QPS). The asymmetry matters : the read path latency budget dominates user-perceived auth latency.

4. **The 15-min worst-case is bounded.** If Redis is unavailable for the duration of an access token's remaining TTL, the access token continues to authenticate. After token expiry (max 15 min), the user must refresh — refresh-token revocation is a **DB-backed** path (`refresh_tokens` table) independent of Redis. The exposure window is therefore the remaining access-token lifetime at the moment of the Redis outage — worst case 15 min, mean ≈ 7.5 min.

5. **Project doctrine `feedback_no_feature_flags_prelaunch` (UFR-015).** No "fail-OPEN flag" is acceptable pre-V1. The fail mode is a property of the adapter, not a runtime toggle.

---

## Decision

**The Redis access-token denylist adapter `RedisAccessTokenDenylist.has(jti)` shall fail-OPEN** : if the underlying Redis call throws (`ECONNREFUSED`, `READONLY`, timeout, malformed response, etc.), the adapter catches the exception, **returns `false`** (= "not revoked, token accepted"), and emits a structured log `warn access_token_denylist_unavailable` **rate-limited to once per minute** via an in-memory token bucket internal to the adapter. The middleware `isAuthenticated` calls `denylist.has(jti)` without `try/catch` — the "never throws" invariant is borne by the port contract, simplifying call-site code and testability.

**The fail-OPEN posture is implemented at the adapter level, not propagated to higher layers.** Use cases and middleware see only the boolean — they do not branch on "Redis up vs Redis down". The same posture applies to `has()` only ; `add(jti, ttlSec)` fails silently in the same way (catch + warn) but its failure is benign (no security regression : the worst case is that a single logout fails to revoke the access token, which is the pre-existing behavior the denylist replaces).

**The fail-mode is fixed in code. There is no env-var, no feature flag, no runtime toggle.** Reversing this requires a new ADR per the "Reversal path" section below.

---

## Consequences

**Positive :**

- A Redis outage does **not** cascade into a global authentication outage. The user-perceived effect of Redis-down is :
  - logout takes effect on **next access-token refresh** (≤ 15 min lag) instead of immediately,
  - new logins still work (login-rate-limiter falls back to its own pre-existing fail-CLOSED, but cost-counter outage is the more pressing global blocker — see I-SEC1).
- The denylist remains a **defense-in-depth win** in the steady state where Redis is healthy : every logout takes effect within Redis-RTT (≈ 0.3–0.8 ms intra-VPC) instead of waiting for natural token expiry.
- The `access_token_denylist_unavailable` warn log (rate-limited 1/min) provides an unambiguous SRE signal : if it fires at all, Redis is degraded *and* the denylist is silently bypassed. The 1/min rate-limit prevents log flooding while keeping a "heartbeat" of the failure mode visible.
- Test surface is small : adapter unit tests cover both branches (Redis up / Redis throws) ; middleware tests cover happy path + denylist-hit. Total 4 unit suites added.
- No coupling between denylist availability and the authoritative identity invariants (JWT signature, exp, refresh rotation) — those continue to work without Redis.

**Negative :**

- **Explicit security trade-off : up to 15-min exposure window per access token at the moment of Redis outage.** A stolen access token logged out by the user remains valid until natural exp if Redis is down at the precise logout instant. This is documented in `museum-backend/src/modules/auth/adapters/secondary/redis/redis-access-token-denylist.ts` JSDoc and in `docs/SECURITY.md` (denylist doctrine section).
- The fail-OPEN posture is **not visible at the middleware call-site** (`denylist.has(jti)` looks like a normal port call). A reader of `authenticated.middleware.ts` who is unaware of this ADR could reasonably assume Redis errors propagate to 500 — they don't. The mitigation is the JSDoc on the port + this ADR (ADR-064) cross-referenced from the port file header.
- The 1/min rate-limit on the warn log is in-memory per process. Multi-instance deployments will emit multiple warn-per-min (one per process). Acceptable noise.
- The denylist does not solve "stolen refresh token" (refresh rotation handles that via family invariants) nor "compromised JWT signing secret" (out of scope — would require key rotation, ADR-future).

**Neutral :**

- The denylist key namespace (`denylist:access:<jti>`) is reserved : a future jti-namespace addition (e.g. `denylist:refresh:<jti>`) is conflict-free with current naming. `git grep "denylist:" museum-backend/src/` returned 0 hits before this run (verified by spec §6 Q5).
- The in-memory adapter `InMemoryAccessTokenDenylist` (used by tests + a Noop variant for dev environments without Redis) implements the same fail-OPEN port contract trivially (it cannot fail — but the contract is uniform).
- The Redis write path uses `SET ... EX <ttlSec> NX` (atomic, idempotent against double-logout). The `NX` is a minor optimization (avoids resetting TTL on second logout call) — not load-bearing but consistent with `lib-docs/ioredis/PATTERNS.md` §3 DO #6.

---

## Alternatives considered

1. **Fail-CLOSED (= reject all authenticated requests when Redis is down).**
   - **Rejected.** A Redis outage would convert every authenticated endpoint into an authentication outage. This is strictly worse than the existing pre-denylist behavior (where Redis outage did not affect access-token validation at all). Adopting fail-CLOSED would **add a new SPOF** rather than close a security gap — the denylist is supposed to be a defense-in-depth *addition*, not a critical-path dependency. Cluster C4 triage `I-SEC1` documents Redis OOM as P0 ; adding global auth-outage on top would compound the incident.

2. **Separate Redis instance dedicated to the denylist (`REDIS_DENYLIST_URL`).**
   - **Rejected for V1**, deferred V1.1. Eliminates the "shared SPOF" objection but adds infrastructure cost (second Redis container, monitoring, backup) and a second failure mode (denylist Redis up, main Redis down or vice versa). Pre-launch V1 doctrine is single-Redis. Listed as a follow-up if V1.1 introduces additional denylist-style features (e.g. refresh-family bulk revoke).

3. **DB-backed denylist (PostgreSQL `revoked_access_tokens` table with TTL + cron purge).**
   - **Rejected.** Adds a write per logout + a SELECT per authenticated request to PG, which is **already the bottleneck** (audit chain `pg_advisory_xact_lock` caps INSERT at 50–200/s per CLAUDE.md). The denylist's read QPS pattern (≈ chat QPS = 10/s/user burst × N users) would dominate the auth-checks PG path. Redis is the architecturally correct backing store : low-latency O(1) GET + auto-TTL purge + no schema migration.

4. **Shorten access-token TTL (15 min → 5 min) instead of revocation.**
   - **Rejected.** The spec §2 explicitly out-scoped this. Reduces the worst-case exposure window from 15 min to 5 min but triples the refresh-token issuance rate (× JWT-issue cost + token-rotation overhead). Doesn't actually revoke — it shortens the window. Tradeoff is worse on the steady-state cost path with no security upside vs the denylist for the same threat model.

5. **Per-user `tokenVersion` counter incremented on logout, checked at every request.**
   - **Rejected.** Equivalent in security posture to the denylist but requires a DB write to `users.token_version` on every logout AND a JOIN-or-extra-SELECT on every authenticated request. Higher steady-state cost than Redis GET + denylist key. Functionally similar to the DB-backed denylist alternative (above) but with a hotter row.

6. **Fail-OPEN gated behind a `DENYLIST_FAIL_OPEN` env flag.**
   - **Rejected per UFR-015** (no feature flags pre-V1). The fail-mode is a property of the safety contract documented at the ADR level — not a tunable.

---

## Reversal path

Reversing this ADR — i.e. switching to fail-CLOSED, or making the fail-mode configurable — requires :

1. A new ADR (ADR-N) amending or superseding ADR-064.
2. A documented assessment of the operational risk (Redis SLO, expected outage frequency, expected blast radius of fail-CLOSED on the chat/admin endpoints) — concretely : measure 30 days of Redis uptime post-V1 launch and quantify the worst-case auth-outage minutes.
3. If the reversal is "fail-CLOSED", the new ADR MUST resolve the shared-Redis-SPOF concern first — either by accepting the global-auth-outage risk explicitly or by introducing the `REDIS_DENYLIST_URL` separate-instance pattern (alternative 2).
4. If the reversal introduces a runtime toggle, project doctrine `feedback_no_feature_flags_prelaunch` (UFR-015) must have inverted (post-launch) AND the toggle must default to the safer behavior (fail-OPEN) — never fail-CLOSED-by-default with a "rescue switch", since a Redis outage during a config drift would be unrecoverable without operator intervention.

---

## References

- Implementation : `museum-backend/src/modules/auth/adapters/secondary/redis/redis-access-token-denylist.ts`, port `museum-backend/src/modules/auth/domain/session/access-token-denylist.port.ts`, middleware integration `museum-backend/src/shared/middleware/authenticated.middleware.ts`.
- Spec R9 (rationale + acceptance criteria) : `team-state/2026-05-21-p0-c3-auth-crypto/spec.md` §3 (table row R9) + §5 (NFR security row).
- Design D9 (fail-OPEN borne par l'adapter, pas le middleware) : `team-state/2026-05-21-p0-c3-auth-crypto/design.md` §9 Decisions.
- Lib-docs : `lib-docs/ioredis/LESSONS.md:36` ("Fail-soft cache on get/set/del errors" pattern, mirror `redis-cache.service.ts:52,62,71,91`).
- Related ADRs : **ADR-047** (LLM Guard fail-CLOSED — contrast : when fail-CLOSED IS the right answer because the sidecar IS the safety layer ; here the denylist is NOT the safety layer, JWT signature/exp/refresh-rotation are) ; **ADR-054** (audit chain Merkle batch redesign — same Redis SPOF concern in a different module).
- Cluster context : `team-state/2026-05-21-p0-security/triage.md` lines 22–24 (P0 sweep, I-SEC1/I-SEC7b interplay).
- Project memory : `feedback_no_feature_flags_prelaunch.md` (UFR-015 doctrine).
