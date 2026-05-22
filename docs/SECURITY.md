# Security operations — doctrine + runbooks

> **Scope** — internal Security operations doctrine for Musaium. Public-facing
> vulnerability disclosure policy lives in root [`SECURITY.md`](../SECURITY.md).

This document collates doctrine for security-critical mechanisms inside the
codebase that need explicit reasoning per CLAUDE.md "AI Safety" + UFR-013.
Maintained as code ; each section links the source of truth.

---

## Export pseudonym salt — rotation doctrine

**Anchor** : `#export-salt-rotation`. Referenced from
`museum-backend/src/shared/security/pseudonym.ts` JSDoc and
`museum-backend/src/modules/admin/adapters/secondary/pg/admin-export.repository.pg.ts`.

### What

`EXPORT_PSEUDONYM_SALT` (env var) keys SHA-256 truncated-to-16-hex pseudonyms
emitted on admin CSV exports (`pseudonymise()`). The salt MUST be set in
production — boot fail-fast in `env.production-validation.ts::validateExportPseudonymSalt`
(>= 32 chars, drift detection vs `env.exportPseudonymSalt`).

### When to rotate

**Rotation is reserved for privacy incident response.** Triggers :

- Confirmed leak of one or more historical admin-export CSV files outside the
  authorised tenancy.
- Compromised operator account that had access to past exports.
- Regulatory request to break correlation between published-and-recalled exports.

There is NO scheduled rotation cadence ; this salt is treated as a long-lived
hash key, not a signing key. The rotation event is itself part of incident
forensics.

### Effect on rotation

After rotation :

- All NEW exports re-key pseudonyms to the new salt.
- All OLD pseudonyms in leaked CSVs become NON-correlatable with new ones
  produced by the same identifier. **This is the property we want** : a
  leaked CSV can no longer be re-linked across export generations without
  re-running the export.
- Operators MUST NOT attempt to re-generate the same pseudonyms with the new
  salt for historical analysis — doing so would re-establish the correlation
  the rotation just broke.

### Out of scope for V1

- Multi-salt versioned schema (`{version, salt}[]`) — possible post-V1 if a
  product requirement emerges for "exports historically re-correlatable
  through a rotation". Default V1 stance : the correlation breaks. Spec §8 Q1.
- Automated rotation tooling. The salt is rotated by hand in the operator's
  secrets store (Vercel / OVH env / wherever) ; the next deploy picks it up.

---

## Access-token denylist (post-logout revocation)

**Anchor** : `#access-token-denylist`. Referenced from
`museum-backend/src/modules/auth/adapters/secondary/redis/redis-access-token-denylist.ts`
+ `museum-backend/src/shared/middleware/authenticated.middleware.ts`.

### What

A Redis-backed denylist keyed by JWT `jti` (RFC 7519 §4.1.7). The
`isAuthenticated` / `isAuthenticatedJwtOnly` middleware consults
`denylist.has(jti)` after JWT verification ; on hit, 401 `TOKEN_REVOKED`.
The `logout` use case writes `denylist.add(jti, ttlSec)` where `ttlSec` =
remaining JWT exp. Refresh tokens continue to be revoked by `jti` in the
existing refresh-rotation table — the denylist is the access-side companion.

Key shape : `denylist:access:<jti>`. Atomic write via
`SET key 1 EX <ttl> NX` (lib-docs/ioredis PATTERNS.md §3 DO #6) — `NX` prevents
overwriting an existing TTL on duplicate add().

### Fail mode

**Fail-OPEN.** When Redis is unreachable :

- `has(jti)` returns `false` (token accepted) — defense-in-depth, not the
  primary identity layer (JWT exp + refresh rotation remain).
- `add(jti, ttl)` silently no-ops — the access token will expire naturally
  within ≤ 15 min.
- A `warn` log `access_token_denylist_unavailable` is emitted, rate-limited
  to 1/minute via in-memory token bucket. The log payload includes
  `jtiHashFirst8` (SHA-256 prefix), NEVER the full jti — PII-ish enumeration
  defense.

Trade-off rationale : a hard fail-CLOSED would convert every Redis incident
into a global auth outage. Spec §R9 + ADR-054 referenced as the doctrine.

### Post-V1 follow-ups

- Grafana alert on `rate(access_token_denylist_unavailable[5m]) > 0` →
  on-call page. Tracked as `TD-DENYLIST-01` in
  [`docs/TECH_DEBT.md`](TECH_DEBT.md).
- "Kill all sessions for user X" command — currently best-effort via
  `revokeFamily` on refresh + waiting for access tokens to expire (≤ 15 min).
  Post-V1 may add a denylist-by-user index.

---

## TOTP replay protection (last_used_step)

**Anchor** : `#totp-last-used-step`. Referenced from
`museum-backend/src/modules/auth/useCase/totp/totpService.ts` +
`challengeMfa.useCase.ts` + `verifyMfa.useCase.ts`.

### What

`totp_secrets.last_used_step` (`BIGINT NULL`) stores the highest RFC 6238 step
that has been accepted for that user. `step = floor(unix_seconds / period)` where
`period = 30 s`. `verifyTotpCode()` now returns `{ step } | null` (rather than
boolean) so the use case can compare the accepted step to the persisted ledger.

If the accepted step is `<= last_used_step`, the use case throws 401
`INVALID_MFA_CODE` (same code as "wrong code" — defense-in-depth, attacker
cannot distinguish "replay detected" from "wrong code"). Otherwise the use case
calls `markUsed(userId, at, step)` which atomically writes
`last_used_at` + `last_used_step`.

Closes RFC 6238 §5.2 "the verifier MUST NOT accept the second attempt of the
OTP" / OWASP ASVS V2.2.5 / NIST SP 800-63B §5.1.5.2.

### Migration

`AddTotpLastUsedStep` (TypeORM-generated) adds the column nullable with no
default. Pre-existing rows retain `last_used_step IS NULL` ; the FIRST
post-deploy code accepts (since `null` is treated as "never used") and stamps
the column. Nullable-then-stamp = zero downtime.

The migration is revert-safe (no NOT NULL constraint, no FK).

### What this does NOT defend against

- TOTP code captured + replayed within the SAME step (e.g. ≤ 30 s) — the
  ledger blocks the SECOND attempt, but the FIRST attacker attempt still
  succeeds (the legitimate user's own attempt either succeeds first and the
  attacker is blocked, or vice versa). Mitigations live elsewhere : rate
  limiter `5 / 15 min` keyed `user:` (`mfa.route.ts`), MFA session token
  binding (short-lived, single-use), and an audit row for every TOTP attempt.
- TOTP code captured + replayed in a future step (e.g. ≥ 30 s later) — the
  code is no longer valid (window ±1), so this is not an issue.

---

## See also

- Root [`SECURITY.md`](../SECURITY.md) — public VDP, hall of fame, reporting.
- [`docs/operations/VDP_RUNBOOK.md`](operations/VDP_RUNBOOK.md) — triage runbook.
- [`docs/AI_SAFETY.md`](AI_SAFETY.md) — LLM guardrails doctrine.
- [`docs/TECH_DEBT.md`](TECH_DEBT.md) — deferred follow-ups.

Last updated : 2026-05-21 (I-SEC5 + I-SEC7 + I-SEC3 closure, run
`2026-05-21-p0-c3-auth-crypto`).
