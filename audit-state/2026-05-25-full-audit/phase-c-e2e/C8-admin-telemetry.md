# C8 — Admin Panel + Telemetry E2E Audit

**Auditeur** : architecte READ-ONLY fresh-context (UFR-022)
**Branche** : `dev` @ HEAD `89852f2a1`
**Date** : 2026-05-25
**Scope** : admin web (museum-web) → BE admin/museum modules → telemetry → data
**Méthode (UFR-013)** : tout claim cité `path:line`, vérifié par Read/Grep (pas supposé).

---

## 1. Diagramme entrée → data

### 1.1 Entrée web admin (RBAC FE)

```
Browser /[locale]/admin/*
  └─ layout.tsx:10  AdminLayout (server: getDictionary)
       └─ AdminShell.tsx:174
            ├─ login page → AuthProvider only (AdminShell.tsx:178)
            └─ RoleGuard allowedRoles=['admin','moderator','super_admin','museum_manager']  (AdminShell.tsx:195)
                 └─ RoleGuard (auth.tsx:247)  hasRole = super_admin OR allowedRoles.includes(role)  (auth.tsx:278)
                      └─ AuthenticatedLayout  (AdminShell.tsx:40)
                           ├─ NAV_KEYS  (AdminShell.tsx:13)  = dashboard,users,auditLogs,reports,analytics,tickets,supportAdmin,reviewsAdmin
                           │     ⚠ NO "museums" entry → museums/branding pages have NO sidebar link
                           └─ super_admin only: Ops·Grafana  (AdminShell.tsx:104)
```

Auth transport : JWT in-memory + refresh interceptor + CSRF cookie `csrf_token`→`X-CSRF-Token` (apiPut wrapper, `lib/api.ts:233`).

### 1.2 Pages → endpoints

| Page (museum-web) | Endpoint | useCase BE | Data |
|---|---|---|---|
| `admin/page.tsx:50` (dashboard) | `GET /api/admin/stats` | `getStats.useCase.ts:24` → `admin.repository.pg.ts:213` | users/sessions/messages **GLOBAL** |
| `admin/users/page.tsx:104` | `GET /api/admin/users` | `listUsers` (`admin.route.ts:62`) | users |
| `admin/users/page.tsx:121` | `PATCH /api/admin/users/:id/role` | `changeUserRole` (`admin.route.ts:99`) | user.role |
| `admin/users/[id]/page.tsx` | `PATCH .../tier` | `changeUserTier` (`admin.route.ts:123`) | user.tier |
| `admin/audit-logs/page.tsx` | `GET /api/admin/audit-logs` | `listAuditLogs` (`admin.route.ts:201`) | audit_log |
| `admin/reports/page.tsx` | `GET/PATCH /api/admin/reports` | `listReports`/`resolveReport` (`admin.route.ts:269/296`) | reports |
| `admin/analytics/page.tsx` | `GET /api/admin/analytics/{usage,content,engagement}` | analytics useCases (`admin.route.ts:323/342/356`) | aggregates |
| `admin/tickets/page.tsx` | `GET/PATCH /api/admin/tickets` | `adminSupportFacade` (`admin.route.ts:371/390`) | support_tickets |
| `admin/support/page.tsx` | (support facade / export) | `adminSupportFacade` | support_tickets |
| `admin/reviews/page.tsx` | `GET/PATCH /api/admin/reviews` | `adminReviewFacade` (`admin.route.ts:419/437`) | reviews |
| `admin/museums/page.tsx:43` | `GET /api/museums` | `listMuseums` (`museum.route.ts:227`) | museums |
| `admin/museums/new/page.tsx:131` | `POST /api/museums` | `createMuseum` (`museum.route.ts:220`) | museums |
| `admin/museums/[id]/branding/page.tsx:128` | `PUT /api/museums/:id` | `updateMuseum` (`museum.route.ts:234`) | museums.config jsonb |
| (admin "purge cache" button) | `POST /api/admin/museums/:id/cache/purge` | `cache-purge.route.ts:37` | Redis llm:v2:* |

Router mounts : `api.router.ts:391` `/admin`→adminRouter, `:393` admin-export, `:394` cache-purge, `:405` `/telemetry`→telemetryRouter.

### 1.3 Telemetry flux

```
Mobile FE  trackFunnelEvent(name, props)  (plausible.ts:102)
  ├─ consentPredicate() short-circuit BEFORE fetch  (plausible.ts:107)  [GDPR Art.7]
  ├─ stripPii(props) incl. userId  (plausible.ts:40,26-38)
  └─ POST /api/telemetry/funnel  + header X-Musaium-Analytics-Consent: granted  (plausible.ts:128)
        └─ funnel.route.ts:103
             ├─ funnelLimiter 60/600s/IP  (funnel.route.ts:38)
             ├─ requireAnalyticsConsentHeader strict ==='granted' else 403  (funnel.route.ts:85-101)
             ├─ validateBody(funnelEventSchema) scalar-only props  (funnel.schemas.ts:17)
             ├─ stripPropsPii incl. userId  (funnel.route.ts:47-78)
             └─ PlausibleAdapter.emit  (plausible.adapter.ts:53)
                  ├─ no-op if !endpoint||!domain  (plausible.adapter.ts:57-59)
                  ├─ stripPii again (defense-in-depth)  (plausible.adapter.ts:37,74)
                  ├─ X-Forwarded-For = clientIp, User-Agent  (plausible.adapter.ts:66-67)
                  └─ never throws (log+swallow)  (plausible.adapter.ts:92-99)

BE-side emit:  monthly-session-quota.middleware.ts:99 emitQuotaExceeded
  → name:'quota_exceeded', props:{tier:'free',limit}  (no PII)  (mw:102-110)
  → respond 402 QUOTA_EXCEEDED  (mw:121-124)
```

---

## 2. ✅ Solide

- **Telemetry consent gate = dual fail-closed.** FE short-circuits before any fetch (`plausible.ts:107`) AND BE rejects without `X-Musaium-Analytics-Consent: granted` 403, strict string equality, arrays/`'true'`/`'1'`/absent all fail (`funnel.route.ts:89-101`). GDPR Art. 7 defensible.
- **Telemetry PII-free at 3 layers.** FE `stripPii` (`plausible.ts:40`), BE route boundary `stripPropsPii` (`funnel.route.ts:70`), adapter `stripPii` (`plausible.adapter.ts:37`). All include `userId` canary (FE `plausible.ts:37`, route `funnel.route.ts:59`). Schema rejects nested objects → scalar-only props (`funnel.schemas.ts:15,22`). `quota_exceeded` props are `{tier,limit}` only (`monthly-session-quota.middleware.ts:107-110`) — no PII.
- **Telemetry adapter never throws** (`plausible.adapter.ts:92`) + middleware try/catch (`monthly-session-quota.middleware.ts:114`) → analytics cannot disrupt user flow.
- **Cache purge uses correct namespace (I-FIX1).** `cache-purge.route.ts:35,60` constructs `LlmCacheServiceImpl` and calls `invalidateMuseum` which uses real `llm:v2:{contextClass}:{museumId}:` namespace (route JSDoc `:14-31`). Integer validation defense-in-depth rejects NaN/`?museumId=99x` (`cache-purge.route.ts:49-55`). Audit-logged (`:65-76`). RBAC `requireRole('admin')` (`:40`).
- **`apiPut` now EXISTS** (`museum-web/src/lib/api.ts:233`) — the CLAUDE.md gotcha ("apiPut n'existe pas") is **STALE**. Branding page import (`branding/page.tsx:6`) resolves correctly.
- **User tier override correctly locked to super_admin** (`admin.route.ts:123 requireRole('super_admin')`); schema rejects `enterprise` (`admin.schemas.ts:14`).
- **`requireRole` centralised super_admin escalation** (`require-role.middleware.ts:22`) mirrored by FE RoleGuard (`auth.tsx:278`) — consistent.
- **JWT carries `museumId` claim** (`token-jwt.service.ts:176`, `authenticated.middleware.ts:84`) so the C8 forced-scope plumbing in the route is wired (even if the use-case discards it — see §3).
- **`/stats` query is `z.strictObject`** (`admin.schemas.ts:103`) — stray params rejected; `museum_manager` query `museumId` is overwritten by JWT claim at route layer (`admin.route.ts:257-259`).

---

## 3. ⚠ Faible / rupture

### ⚠ **C8-STATS-LEAK — `getStats` ignores `museumId` → museum_manager sees GLOBAL aggregate. SÉVÉRITÉ : HIGH (BOLA / OWASP API3).**
- Route forces `scopedMuseumId = req.user.museumId` for museum_manager (`admin.route.ts:257-259`) and threads it into `getStatsUseCase.execute({museumId})` (`:261-263`).
- BUT `GetStatsUseCase.execute(_input)` discards the arg — `_input` is unused (`getStats.useCase.ts:24`) and calls `this.repository.getStats()` with **no args** (`:31`).
- `admin.repository.pg.ts:213 getStats()` takes **no parameters** — runs unscoped COUNT over all users/sessions/messages (`:213-257`).
- **Net effect** : a `museum_manager` (B2B tenant operator) calling `GET /api/admin/stats` (the FE dashboard landing page `admin/page.tsx:50`) receives `totalUsers`, `usersByRole` (full role breakdown incl. count of admins/super_admins), `totalSessions`, `totalMessages`, `recentSignups`, `recentSessions` for the **entire platform across all tenants**. The route-level "forced scope" is security theatre — it pins the call shape but the data layer is a no-op.
- Self-documented as known limitation (`getStats.useCase.ts:10-15,24-31` + route JSDoc `admin.route.ts:231-245`). The honesty is good; the surface is still a live cross-tenant aggregate leak the moment `museum_manager` exists with a populated dashboard. Pre-launch V1 is B2C-only and **no museum is contracted** (CLAUDE.md) → no real `museum_manager` accounts today, so exposure is latent, not active. Severity HIGH-if-exploited / LOW-likelihood-V1.

### ⚠ **BRANDING-W2.2 = WRITE-ONLY, NO CONSUMER. SÉVÉRITÉ : MEDIUM (claim creuse / dead feature).**
- FE writes `museum.config.branding` via `PUT /api/museums/:id` (`branding/page.tsx:124-130`).
- BE `config` field is **untyped blob** `z.record(z.string(), z.unknown())` (`museum.schemas.ts:12,23`) — no `branding` schema, no validation.
- **Grep `branding` across `museum-backend/src` returns ZERO matches** → BE never reads `config.branding`.
- **Grep `branding`/`logoUrl`/`primaryColor`/`secondaryColor`/`accentColor` across `museum-frontend`** → the only `primaryColor` hit is a **map-marker circle color** fed by app `theme.primary` (`MuseumMapMarkers.tsx:30,63`, `MuseumMapView.tsx:281`), NOT museum branding. `home.tsx:34` "branding" is the Musaium app's own home branding, not per-museum config.
- Public museum DTO explicitly excludes config (`museum.types.ts:41` "Public — no internal config or admin fields").
- **Net effect** : the branding editor saves colors/logo that **nothing consumes** — not the mobile app, not the BE, not any visitor-facing surface. The page subtitle claims "Changes take effect on the next visitor session" (`branding/page.tsx:24`) — this is **false**. Self-flagged TD-50 for logo upload (`branding/page.tsx:14-19`) but the consumer gap is broader than logo upload.

### ⚠ **museum_manager 403 INCOHERENCE on museum write paths. SÉVÉRITÉ : MEDIUM (broken UX, not a security hole).**
- `museum_manager` is allowed into AdminShell (`AdminShell.tsx:195`).
- `/admin/museums` is **not** in nav (`AdminShell.tsx:13` NAV_KEYS lacks museums) → no sidebar path, but reachable by direct URL.
- If reached: `GET /api/museums` (list) allows museum_manager (`museum.route.ts:230`) → page loads.
- BUT the page's actions break for museum_manager:
  - **Branding save** → `PUT /api/museums/:id requireRole('admin')` (`museum.route.ts:237`) → **403** (museum_manager not in list, not super_admin).
  - **Onboard new museum** → `POST /api/museums requireRole('admin')` (`museum.route.ts:223`) → **403**.
- So a museum_manager can open the museums list + branding form, fill it, click Save, and get a silent 403 (`branding/page.tsx:136` catches into `mutationError` banner). Functional dead-end.

### ⚠ **museum_manager partial 403 across admin nav. SÉVÉRITÉ : LOW-MEDIUM (incoherent allow-list).**
RBAC matrix for `museum_manager` against the 8 nav destinations + endpoints they trigger:

| Nav item | Endpoint | BE guard (`admin.route.ts`) | museum_manager result |
|---|---|---|---|
| dashboard | `GET /stats` | `admin,moderator,museum_manager` (`:249`) | ✅ 200 (but **global leak**, §3 C8) |
| users | `GET /users` | `admin,moderator` (`:65`) | ❌ **403** |
| auditLogs | `GET /audit-logs` | `admin` (`:204`) | ❌ **403** |
| reports | `GET /reports` | `admin,moderator` (`:272`) | ❌ **403** |
| analytics | `GET /analytics/*` | `admin` (`:326/345/359`) | ❌ **403** |
| tickets | `GET /tickets` | `admin,moderator` (`:374`) | ❌ **403** |
| supportAdmin | support facade | `admin,moderator` | ❌ **403** |
| reviewsAdmin | `GET /reviews` | `admin,moderator` (`:422`) | ❌ **403** |

- **Net effect** : `museum_manager` lands on a dashboard that works (showing global data they shouldn't see) and **every other sidebar link 403s**. The role was added to the FE allow-list "C9" (`AdminShell.tsx:189-194`) to unblock entry, with a comment deferring scoping to "per-page" — but only `/stats` got the BE allow-list update (C8/C9). Result is an incoherent admin shell for that role: 1 leaky page + 7 dead links. Confirms the brief's hypothesis (`museum_manager-403`): YES, museum_manager gets 403 on /tickets, /reviews, and 5 others.

---

## 4. 🔧 Gaps E2E

1. **C8 stats scope is a no-op end-to-end.** Route → useCase → repo all accept/thread `museumId` except the actual SQL, which is unscoped (`admin.repository.pg.ts:213`). Closing it requires `museum_id` columns on users/chat_sessions/chat_messages (documented out-of-scope, `getStats.useCase.ts:13-15`). Until then, either (a) block `museum_manager` from `/stats` entirely, or (b) return a 501/empty for scoped requests rather than the global aggregate. Current behavior silently leaks.

2. **Branding feature has no read path.** No BE branding schema, no mobile consumer, public DTO excludes config. W2.2 is a write-to-void. Either wire a consumer (mobile theming from `config.branding`, or expose on a tenant-scoped public museum endpoint) or mark the feature non-functional. The "takes effect on next visitor session" copy (`branding/page.tsx:24`) is a false claim per UFR-013.

3. **museum_manager allow-list is half-applied.** FE shell admits the role (`AdminShell.tsx:195`) but BE only admits it on `/stats` + `GET /museums` + `GET /museums/:id` enrichment-adjacent reads. No nav item is scoped to museum_manager's tenant; 7 of 8 nav links 403. Either remove museum_manager from the FE shell allow-list until tenant-scoped pages exist, or gate the nav items by role so the role only sees what it can actually reach.

4. **No tenant-scoped museum write for museum_manager.** A museum_manager cannot edit even their own museum (`PUT /museums/:id` is admin-only, `museum.route.ts:237`). If the product intent is "B2B operator manages their own museum branding," the write path must accept `museum_manager` constrained to `req.user.museumId`. Currently the whole B2B-operator self-service story is non-functional.

5. **No telemetry gap found.** Consent gate, PII strip, rate-limit, non-throwing, X-Forwarded-For all present and dual-layered. Telemetry is the strongest part of this surface.

---

## 5. Verdict synthèse

| Sous-système | État |
|---|---|
| Telemetry (funnel + quota + consent + PII) | ✅ Solide E2E |
| Cache purge (I-FIX1 llm:v2) | ✅ Correct namespace + audit + integer guard |
| User tier/role/suspend RBAC | ✅ Correctly scoped (super_admin/admin gates) |
| C8 stats scope (museum_manager) | ⚠ HIGH — global aggregate leak (no-op scoping) |
| Branding W2.2 | ⚠ MEDIUM — write-only, no consumer, false UX claim |
| museum_manager admin shell | ⚠ MEDIUM — 1 leaky page + 7 dead 403 links |

**Mitigant V1** : B2C-only launch, zero contracted museum, so no real `museum_manager` accounts exist today → the C8 leak + museum_manager incoherence are **latent** (HIGH-if-exploited, near-zero-likelihood-V1). Branding dead-feature is a product/honesty issue independent of B2B status.
