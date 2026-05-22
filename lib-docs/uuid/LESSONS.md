# Lessons — uuid (v11.1.0/11.1.1)

Audit 2026-05-18 : **APPROVED** — security patch applied, ESM canonical imports respected.

## ✅ Security patch GHSA-w5hq-g745-h8pq APPLIED
- `pnpm.overrides ^11.1.1` wins over deps `^11.1.0` → resolved 11.1.1 (patched)
- Verified `pnpm list uuid` BE only consumer
- Exposure NIL : only v4/validate used in code ; no v3/v5/v6 with caller-supplied offset buffer

## ⚠️ DRIFT-1 LOW : deps `^11.1.0` vs pnpm.overrides `^11.1.1` inconsistent
- Dual-source-of-truth confuses Renovate/audit.
- **Fix TD-UUID-01** : Align deps line 160 to `^11.1.1` and drop override OR keep override + document why deps lags.

## ⚠️ DRIFT-2 INFO : 100% v4 via pg defaults, PATTERNS recommends v7 for new DB PKs
- All current PKs use random v4 (gen_random_uuid / uuid_generate_v4 in 8+ migrations). Sub-optimal index locality, especially audit_log (high-volume append-only).
- **Status** : structural choice predating PATTERNS.md. Document deferral OR adopt v7 in new high-cardinality tables (audit_log Merkle refactor ADR-054 opportunity).

## ⚠️ DRIFT-3 INFO : @types/uuid likely redundant since v11.0.3 (internal types exported)
- **Fix optional** : verify with `tsc --noEmit` after removing `@types/uuid` devDep ; if green, drop.

## ✅ Patterns compliance
- Section 3 DO named ESM alias ✅ (2/2 sites `import { validate as isUuid } from 'uuid'`)
- Section 4 DON'T default import ✅ (0 violations)
- Section 4 DON'T deep import `uuid/v4` ✅ (0 violations)
- Section 4 DON'T require CJS ✅ (zero `require('uuid')` repo-wide)
- v12 ESM-only ready (zero CJS surface)

## INFO : Frontend (museum-frontend/web) doesn't declare uuid — all generation backend-side

---

## 2026-05-20

Re-audit (lib-doc-curator, UFR-022 refresh). Upstream re-verified: latest = v14.0.0 (2026-04-19); GHSA-w5hq-g745-h8pq backported to 11.1.1/12.0.1/13.0.1-2/14.0.0. **Verdict unchanged: APPROVED, stay on 11.1.1 for V1.**

### Verified state
- `pnpm list uuid` → **11.1.1** (override `^11.1.1` wins over deps `^11.1.0`). Security backport present.
- Exposure to GHSA-w5hq-g745-h8pq = **NIL** — only `validate()` used (2 sites: `session-access.ts:55,74`, `chat-media.service.ts:70`); zero `v3/v5/v6` + buffer + offset calls.
- Generation = node `crypto.randomUUID()` (request-id, audit, JWT jti, S3 keys) + TypeORM `@PrimaryGeneratedColumn('uuid')`. The `uuid` package generators (`v4`/`v7`) are NOT used — package consumed for `validate` only.
- Patterns compliance: named ESM alias ✅, no default import ✅, no deep import ✅, zero CJS surface ✅ (v12-ready).

### DRIFT-3 CONFIRMED (was INFO, now actionable LOW)
- `@types/uuid@^11.0.0` IS declared in `museum-backend/package.json` (line 100) and resolved to the **deprecated stub** `11.0.0`. uuid ships its own types since v11.0.3 (#833) → this devDep is redundant. **Fix: drop `@types/uuid`, run `pnpm lint` (tsc --noEmit); if green, remove.** Low priority, no runtime impact.

### DRIFT-1 still open (LOW)
- deps `^11.1.0` vs override `^11.1.1` dual-source-of-truth (TD-UUID-01). Cosmetic; resolution is correct. Align deps to `^11.1.1` + drop override when convenient.

### DRIFT-2 still INFO
- All current PKs random v4 via pg defaults. v7 (time-ordered) preferred for NEW high-cardinality tables (audit_log Merkle ADR-054 opportunity). No mandate to rewrite existing tables.

### No new TD entry required. No security action required (11.1.1 already patched).
