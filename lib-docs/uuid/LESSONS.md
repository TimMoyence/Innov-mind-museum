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
