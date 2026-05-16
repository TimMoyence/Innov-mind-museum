# ADR-052 — User suspend + soft-delete strategy for admin user management

**Status:** Accepted
**Date:** 2026-05-14
**Closes:** audit-2026-05-12 P0 #9 + P0-6 + F4 Claim 1
**Related run:** `/team` run `2026-05-14-admin-user-detail-page`

---

## Context

The admin user detail page (`museum-web/src/app/[locale]/admin/users/[id]/page.tsx`) was a 38-line stub rendering `---` for every field — a launch blocker per the 2026-05-12 audit. While extending the page, two adjacent gaps surfaced and were fixed in the same run:

- **P0-6 / F4 Claim 1** — `museum-web/src/lib/auth.tsx:RoleGuard` used `.includes()` only, contradicting the JSDoc contract and BE `require-role.middleware.ts:28` which promote `super_admin` implicitly. A future call site passing `allowedRoles={['admin']}` would have 403'd the platform owner.
- The User entity had **no suspend / soft-delete primitives**, blocking SOC 2 admin-operator expectations and GDPR Art. 17 forensic posture before any B2B contract review.

V1 launches 2026-06-01; introducing a full real-time token revocation system (Redis blacklist, JWT jti rejection list, or DB-per-request check) was out of scope but a basic suspend / soft-delete with a documented expiry window is in.

## Decision

### D1. Soft delete (`users.deleted_at`) — not hard delete

We persist `users.deleted_at TIMESTAMP NULL` and treat any non-null value as "deleted from the operator's perspective". The row is kept for foreign-key integrity (`chat_messages.user_id`, `audit_log.actor_id`, support tickets, reviews) and forensic auditing. Hard erasure (the full RGPD Art. 17 "right to be forgotten" operation) is deferred to V1.1 when:

- the data classification ROPA is signed (currently DRAFT, P0-1 from MASTER),
- the cascade plan is reviewed by counsel,
- and the existing `auth/account/deleteAccount.useCase.ts` self-erasure path is aligned with the admin-side path.

### D2. 15-minute access-token window — not DB-on-every-request

`AuthSessionService.login()` and `AuthSessionService.refresh()` now refuse suspended (`suspended=true`) and soft-deleted (`deletedAt !== null`) accounts. Existing **access tokens** keep working until they expire (15 min TTL) — we do NOT add a DB lookup to `isAuthenticated`.

Trade-off analysis:

| Approach | Latency cost | Suspend latency | V1 risk |
|---|---|---|---|
| DB-per-request guard | +1 query / authenticated req | Real-time (< 1s) | Touches the hottest BE path. Measurable hit on chat traffic. |
| Redis blacklist on jti | +1 cache hit / req | Real-time | New cache infra, eviction policy needed. |
| Login + refresh guard (chosen) | 0 | Up to 15 min | Industry-standard, zero hot-path impact, only operator-facing actions feel the lag. |

The 15-minute window matches the `env.auth.accessTokenTtlSeconds` default and is acceptable for non-financial admin operations. The Web admin page surfaces the suspended status visibly so the operator knows the lag is expected.

### D3. Operator lock-out guards

- **Self-suspend refused** (`CANNOT_SUSPEND_SELF`, 409) — prevents an accidental click from locking the platform owner out of their own super_admin session.
- **Last-admin guard refuses last-privileged delete** (`CANNOT_DELETE_LAST_ADMIN`, 409) — reuses the existing `IAdminRepository.countAdmins()` which already counts both `admin` and `super_admin` rows (see `admin.repository.pg.ts:152-157`).
- Self-delete is *permitted* on purpose when not the last admin — matches the existing user-side `deleteAccount.useCase` semantics.

### D4. Suspend + delete restricted to `super_admin`

A B2B `admin` cannot suspend or delete any user — only `super_admin` (platform owner) can. This protects the multi-tenant boundary: a rogue B2B operator cannot disable Tim's account, another tenant's admin, or any visitor outside their museum. V2 multi-museum will introduce per-museum-scoped suspend.

Read access (`GET /api/admin/users/:id`) is open to admin + moderator + super_admin (super_admin implicit via `requireRole`) — moderators need user lookup for ticket triage.

### D5. Error code surface

| Condition | HTTP | `error.code` | UI message (FR/EN) |
|---|---|---|---|
| Login as suspended user | 403 | `ACCOUNT_SUSPENDED` | "Compte suspendu" / "Account suspended" |
| Login as soft-deleted user | 403 | `ACCOUNT_DELETED` | "Compte supprimé" / "Account deleted" |
| Refresh suspended | 401 | `ACCOUNT_SUSPENDED` | (silent — UI logs out) |
| Refresh soft-deleted | 401 | `ACCOUNT_DELETED` | (silent — UI logs out, family revoked) |
| Self-suspend attempt | 409 | `CANNOT_SUSPEND_SELF` | "Vous ne pouvez pas effectuer cette action sur votre propre compte." |
| Delete last admin | 409 | `CANNOT_DELETE_LAST_ADMIN` | "Impossible de supprimer le dernier administrateur." |

The Web admin detail page maps these codes to localized strings via `dict.errorLastAdmin`, `dict.errorSelfAction`, etc.

### D6. Soft-delete behaviour in queries

- `listUsers()` query gained `WHERE u.deleted_at IS NULL` — soft-deleted users disappear from the operator's list view.
- `getUserById()` does NOT filter `deleted_at` — direct ID access still returns soft-deleted users for audit forensics. The Web detail page renders the "Deleted" badge with the timestamp.
- All other tables that FK to `users` are unaffected (rows preserved).

### D7. Fix `RoleGuard.includes()`, not the JSDoc

The pre-existing JSDoc + BE `requireRole` middleware + smart `countAdmins` logic ALL treat `super_admin` as implicitly privileged. The `.includes()` shortcut in `RoleGuard` was the divergence. The fix is in `auth.tsx`:

```ts
const hasRole = user && (user.role === 'super_admin' || allowedRoles.includes(user.role));
```

Tested by a new Vitest regression case `admin-auth.test.tsx`: `RoleGuard allowedRoles={['admin']}` + `user.role='super_admin'` → expects children rendered, no 403.

## Consequences

- ✅ P0 #9 ticked (admin user detail page functional).
- ✅ P0-6 / F4 Claim 1 ticked (RoleGuard super_admin implicit promotion).
- ✅ BE migration 057 lands two additive columns with index, fully reversible.
- ✅ OpenAPI spec extended additively — no breaking schema change for existing consumers.
- ✅ Existing admin tests untouched; 13 new BE unit tests for the 4 useCases; 9 new Web Vitest tests for the detail page; 2 new Playwright e2e tests.
- ⚠️ 15-min revocation window is the documented expectation. If a regulated B2B (defense, health museum) signs in 2026/2027, V1.1 must close this with either Redis jti blacklist or DB-per-request guard.
- ⚠️ Hard delete deferred V1.1. The Web page renders the "Deleted" badge but the user data remains queryable by ID. Mention in the Privacy Policy + DPIA + ROPA before the first regulated tenant ships.

## Alternatives considered

- **Hard delete with FK cascade** — rejected V1: high blast radius (cascades into chat_messages, audit_log, support, reviews), audit forensic data loss, no GDPR Art. 17 obligation pre-launch since no B2B revenue yet.
- **Redis jti blacklist** — rejected V1: new Redis schema + eviction policy + cross-region replication concerns; not warranted before B2B revenue.
- **Per-museum scoping of suspend (B2B admin can suspend their tenant's visitors)** — out of scope V1: no per-museum scope field on User entity, deferred to V2 multi-museum admin.
- **Delete with username typed-confirm** — rejected: email is the canonical identifier on Musaium; typing it forces the operator to copy from the displayed field, eliminating misclicks.

## Sources

- Audit `docs/audit-2026-05-12-raw/04-research/R20-web-auth-admin.md` (§§ 1.5, 3.5, 6).
- Audit `docs/audit-2026-05-12-raw/05-gaps/F4-critical-bugs-verified.md` (Claim 1).
- Audit `docs/audit-2026-05-12/MASTER.md` (P0-6, P0 #9 entries).
- Run state: `.claude/skills/team/team-state/2026-05-14-admin-user-detail-page/{spec,design,tasks}.md`.
