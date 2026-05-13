# R20 — Web Auth + Admin RBAC Audit

**Agent:** R20
**Scope:** `museum-web/src/app/[locale]/admin/*` (11 pages) + `museum-web/src/lib/{auth.tsx,api.ts}` + `museum-web/src/middleware.ts`
**Date:** 2026-05-12
**Honesty UFR-013:** every claim about Musaium code is sourced from file paths listed in §3. Every external claim has a URL in §11. Where my own knowledge ends I say "not verified".

---

## 1. TL;DR (read this if nothing else)

1. **Library choice — KEEP custom JWT-in-HttpOnly-cookie stack.** Lucia is **deprecated since March 2025** so it is off the table. Auth.js v5 + Better Auth would each be 2-3 weeks of rip-and-replace work for a feature parity that Musaium already has (login, refresh rotation, MFA TOTP, social, email verify). The single hole is **WebAuthn / passkeys** which is shippable on top of `simplewebauthn` in ~1 week without changing libraries. Migrating to Better Auth pre-launch V1 = high risk, zero payoff.
2. **Cookie posture is correct but SameSite is wrong.** `csrf_token` + `access_token` ship as `SameSite=Strict` per backend `auth-cookies.ts`. The `admin-authz` UX hint cookie is `SameSite=Lax`. OWASP and Vercel both endorse Strict for admin contexts. **OK.**
3. **CSRF: signed double-submit HMAC (good) but no Sec-Fetch-Site fallback layer.** Backend `csrf.middleware.ts` enforces `csrf_token = HMAC-SHA256(access_token, CSRF_SECRET)` AND echoes via `X-CSRF-Token`. This is the OWASP **Signed Double-Submit Cookie pattern** — the recommended variant. Naive double-submit (cookie ≡ header, no HMAC) is now explicitly discouraged by OWASP. Adding `Sec-Fetch-Site` as a defence-in-depth check costs ~20 lines of middleware and gives a zero-state cross-origin block.
4. **Next.js Server Actions are not used** for state changes — all mutations go through the backend Express API via `apiPost/apiPatch`. This sidesteps `CVE-2025-29927` middleware-bypass risk for authorization (we run on Next 15.5.18 which is already past the 15.2.3 fix, but worth noting that we don't rely on middleware for the real auth gate — backend JWT verify is the source of truth).
5. **`admin/users/[id]/page.tsx` is the stub the brief flags — confirmed.** 38 lines, every field rendered as `---`. Direct launch blocker (P0). Three other admin pages are functional but thin (audit-logs filter is action-only, no date/user filter; tickets, reports, reviews need shape verification — out of R20 scope; see R-frontend-quality if exists).
6. **MFA TOTP web UX is solid but missing edge cases.** Recovery codes shown once, "Copy all" button, QR code rendered, manual key fallback. Missing: (a) screen-reader alt-text on the SVG QR — 2026 WCAG/RGAA risk, (b) downloadable / printable recovery codes file, (c) post-verify redirect to actual dashboard URL (currently `href="../"`).
7. **WebAuthn/passkeys = should-ship-V1.1, not V1.** B2B museums and SOC 2 buyers will ask in 2026 (87% of enterprises piloting per HID 2025 survey). Build on `@simplewebauthn/server` + `@simplewebauthn/browser`. AAL2 by default — sufficient for non-regulated B2C tier. Hardware-bound attestation only if a regulated B2B (defense/health museums) ever signs.
8. **RBAC: home-grown `RoleGuard` is enough for V1.** 5 roles, single linear hierarchy, no per-resource permissions, no per-tenant scoping in the UI today. Don't pull in Casbin/Permify/CASL until the role count crosses ~10 or per-tenant rules appear (likely V2 when multi-museum admin lands). Adding CASL later is non-breaking — `RoleGuard` survives as a thin adapter.
9. **Audit log UX is weak for SOC 2 readiness.** Single text filter, no date range, no resource type, no export, no actor lookup. Acceptable V1 but B2B sales will hit this in month 3.
10. **Production-ready verdict for V1: YES with three P0 fixes** (users/[id] stub, audit log filters, MFA a11y) and the **`x-locale` header inject in middleware should not relax CSP** — already verified clean.

---

## 2. Current Musaium implementation snapshot (verified by file Read)

### 2.1 Auth library

- **Home-grown.** No NextAuth / Auth.js / Lucia / Better Auth in `museum-web/package.json`. Verified.
- Web auth uses backend Express endpoints `/api/auth/{login,refresh,me,mfa/*}` via `apiPost/apiGet/apiPatch` (`/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/lib/api.ts`).
- Token storage: HttpOnly cookies set by backend (`/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/auth/adapters/primary/http/helpers/auth-cookies.ts`):
  - `access_token` — HttpOnly, Secure, SameSite=Strict, short TTL.
  - `refresh_token` — HttpOnly, Secure, SameSite=Strict, Path=`/api/auth`.
  - `csrf_token` — **NOT HttpOnly** (web JS reads it via `document.cookie` regex in `api.ts:67`).
- Web client memory: `apiPost` adds `X-CSRF-Token` header on POST/PUT/PATCH/DELETE (`api.ts:171-176`).
- `setTokens()` / `getAccessToken()` / `clearTokens()` are kept as no-ops post-F7 for backward compat (`api.ts:44-56`). Dead-shaped, fine, but should be removed after RN parity finalizes.

### 2.2 Admin route layout

| Path | File | Guard | Status |
|---|---|---|---|
| `/admin` (dashboard) | `page.tsx` | RoleGuard `admin\|moderator\|super_admin` (via `AdminShell`) | functional |
| `/admin/analytics` | `analytics/page.tsx` | same | functional |
| `/admin/audit-logs` | `audit-logs/page.tsx` | same | thin (1 filter) |
| `/admin/login` | `login/page.tsx` | bypass (no RoleGuard) | functional |
| `/admin/mfa` | `mfa/page.tsx` | same | functional, a11y gap |
| `/admin/ops/grafana` | `ops/grafana/layout.tsx` | RoleGuard `super_admin` only | functional (proxy) |
| `/admin/reports` | `reports/page.tsx` | same as default | not verified (R20 didn't read) |
| `/admin/reviews` | `reviews/page.tsx` | same | not verified |
| `/admin/support` | `support/page.tsx` | same | not verified |
| `/admin/tickets` | `tickets/page.tsx` | same | not verified |
| `/admin/users` | `users/page.tsx` | same | functional |
| `/admin/users/[id]` | `users/[id]/page.tsx` | same | **STUB — placeholder `---`** |

### 2.3 Middleware enforcement (`/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/middleware.ts`)

- `ADMIN_GATE_REGEX = /^/(fr|en)/admin(?!/login)(?:/|$)/` — redirects to `/login?redirect=…` if no `admin-authz` cookie. UX-only — backend verifies JWT on every API call (see file comments).
- Adds per-request CSP nonce + `script-src 'self' 'nonce-…' 'strict-dynamic'`. **`'unsafe-inline'` only kept for `style-src`** (Framer Motion + next/font compromise — Next.js official guidance).
- `frame-ancestors 'none'` set. **Good** — admin clickjacking proof.
- `form-action 'self'` set. **Good**.
- `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io` — note: backend API calls go via Next rewrite (`/api/*`), so 'self' is correct.

### 2.4 RBAC implementation (`/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/lib/auth.tsx:64`)

```
UserRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin'
```

- Single-flag role on `AuthUser.role`. No multi-role, no per-museum scoping in the user shape today.
- `<RoleGuard allowedRoles={UserRole[]}>` — strict include check; no implicit "super_admin satisfies admin" mapping (comment in `auth.tsx:60-63` says it should, but `allowedRoles.includes(user.role)` on line 280 is a literal match). **Inconsistency** — if a page passes `allowedRoles={['admin']}`, a `super_admin` user is **denied** by the current `.includes()` check. AdminShell works around this by passing `['admin', 'moderator', 'super_admin']` everywhere. The comment promises a behavior the code does not implement.

### 2.5 CSRF middleware (backend) — for context

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/helpers/middleware/csrf.middleware.ts`:
  - `csrf_token cookie ≡ HMAC-SHA256(access_token, CSRF_SECRET)` validated server-side
  - `X-CSRF-Token header` MUST equal `csrf_token` cookie value
  - `crypto.timingSafeEqual` against equal-length buffers
  - Skip rules: safe methods, `Authorization: Bearer …` (mobile bypass), pre-auth endpoints, no access_token cookie
- This is the OWASP **Signed Double-Submit Cookie** variant with session binding — the **recommended pattern** per OWASP cheatsheet (2025-12-24).

---

## 3. Question-by-question findings

### Q1. NextAuth/Auth.js 5 2026 vs Lucia 4 vs custom JWT vs Better Auth

| Option | 2026 state | Fit for Musaium V1 |
|---|---|---|
| **Auth.js v5** | RC/beta, App Router native, `auth()` single export, full middleware integration. Min Next.js 14. | **Switch cost > switch benefit.** We'd swap a working flow for marginal DX gain. |
| **Lucia v3** | **Deprecated March 2025.** Author repositions Lucia as "learning resource on implementing auth from scratch", database adapters end-of-lifed 2024. | **Eliminated.** |
| **Custom (current)** | Backend Express JWT + cookies + LangChain-aware refresh queue + mobile parity. F7 migration done 2026-04-30. | **Recommended.** Working, audited, mobile-shared. |
| **Better Auth** | TypeScript-first, built-in MFA + organizations + passkeys + rate limiting + CSRF + email verify. Framework-agnostic. Fast-growing, but still <2y old. Auth.js officially documents a migration path **to** Better Auth (signal of mindshare). | **Reconsider post-launch B2B if multi-tenant orgs land.** Native `organizations` module would replace per-museum scoping we'd otherwise hand-build. |

**Verdict Q1:** keep custom. Re-evaluate Better Auth at V2 if multi-museum scoping needs orgs/teams.

### Q2. HttpOnly cookies vs Bearer + localStorage 2026 — OWASP guidance

- **OWASP Session Management Cheat Sheet:** "Do not store authentication tokens, session IDs, JWTs, refresh tokens, or any credential in localStorage or sessionStorage." A single XSS = full credential disclosure.
- **OWASP HTML5 Cheat Sheet:** prescribes `HttpOnly; Secure; SameSite=Strict` cookies.
- Musaium web is already there. **OK.**
- The csrf_token cookie is intentionally NOT HttpOnly — required for JS to echo back in the X-CSRF-Token header (double-submit pattern). This is correct.
- **One subtle gap:** `admin-authz` UX hint cookie is `SameSite=Lax` while the real session cookies are `Strict`. Acceptable because `admin-authz` carries no auth payload (literally `"1"`), and the middleware verifies real JWT on the API call. **OK, but document it as a non-secret cookie in an ADR for SOC 2 reviewers.**

### Q3. CSRF in Next.js 15 — double-submit, SameSite, Origin/Referer, Fetch Metadata

| Defense | Musaium status | Notes |
|---|---|---|
| **Signed double-submit HMAC** | ✅ implemented (BE) | OWASP-recommended variant |
| **SameSite=Strict on session cookies** | ✅ verified (auth-cookies.ts:83 sets `csrf_token` and access/refresh cookies) | Best-in-class for admin |
| **Origin / Referer check** | ❓ not verified server-side | R7 (backend security) should confirm |
| **Fetch Metadata `Sec-Fetch-Site`** | ❌ not implemented | Optional defense-in-depth |
| **POST-only for state changes** | ✅ all mutations go through `apiPost`/`apiPatch` | Browser-default protection |
| **No GET state changes** | ✅ verified (apiGet is read-only) | OWASP baseline |

The OWASP cheat sheet (verified via WebFetch 2026-05-12) updates explicitly:
- **Signed Double-Submit** is the recommended variant — **Musaium has it.**
- **Naive Double-Submit** (cookie ≡ header, no HMAC) is **discouraged** due to subdomain cookie injection. Musaium is NOT in this naive state.
- **Fetch Metadata** is now listed as a **complete alternative** as of Dec 2025 — 98% browser coverage, zero state.

**Recommendation:** add an `app.use(secFetchSiteGuard)` middleware that rejects POST/PATCH/PUT/DELETE when `Sec-Fetch-Site` is `cross-site` AND `Sec-Fetch-Mode` is not `navigate`. Cost: 15 lines. Defense-in-depth on top of HMAC. Legacy browser fallback = the existing HMAC layer.

### Q4. Server Actions CSRF protection 2026

- Built-in: Next.js Server Actions compare `Origin` header to `Host` (or `X-Forwarded-Host`) and reject on mismatch. They are POST-only. (Vercel docs verified 2026-05-12.)
- Known issue: case-sensitivity bug in Origin/Host comparison can false-positive on hostname casing — needs `serverActions.allowedOrigins` config in `next.config.js` if reverse proxy ever lowercases differently than the app.
- **Musaium does not use Server Actions for mutations** — all writes go via Express API. Server Actions CSRF is therefore not a load-bearing defense for us today. **OK but document this** so future contributors know not to introduce a Server Action without backend forwarding (would bypass our HMAC defense if it skipped the API client).

### Q5. RBAC patterns

| Library | TS support | Fit |
|---|---|---|
| **Casbin** | Untyped string-based `enforce()` calls (per PkgPulse 2026) | Overkill for 5 roles |
| **Permify** | Zanzibar-style ReBAC, requires its own service | Overkill, infra burden |
| **CASL** | TS-first, `useAbility()` + `<Can>` React hooks, generic-typed action/subject pairs | **Best fit when we outgrow the current 5-role flat model** |
| **AccessControl** | Older, JSON config | Fine but stagnant |
| **Home-grown** | Current `RoleGuard.allowedRoles.includes(user.role)` | **Sufficient V1** |

**Today Musaium has 5 roles, no per-resource permissions, no per-museum scoping in the user object.** A flat role check is honest and readable. Pulling in CASL pre-launch buys nothing.

**Threshold to migrate to CASL:** when (a) per-museum scoping lands (`museum_manager` can only see *their* museum's audit logs) **or** (b) we need per-resource granular permissions (`can('approve', 'Report')`).

### Q6. Admin panel UX 2026

Industry stack 2026 = Next.js 15+ App Router + shadcn/ui (Radix) + TanStack Table v8 + React Hook Form + Zod + cmdk (Cmd+K command palette). 75%+ of templates surveyed use App Router.

Musaium is at **App Router + Tailwind 4 + hand-rolled tables**. Gaps vs 2026 baseline:
- **No data table library** — `audit-logs/page.tsx` hand-rolls `<table>` + state. Fine for read-only paginated lists today; will become tech debt for sortable/filterable lists. TanStack Table v8 is the low-friction add (headless, no styling lock-in).
- **No command palette** — Cmd+K is now table stakes for power admin UX. Optional V1.
- **Mutations** — admin/users role change uses an inline modal pattern. Acceptable but no optimistic update, no rollback. Confirmation modal exists. **OK V1.**
- **No bulk actions** on list views. Acceptable for current tenant size.

### Q7. MFA TOTP web UX

Best practices 2026 (LogRocket, WorkOS, Authgear surveys):
- ✅ QR code rendered (`mfa/page.tsx:35`)
- ✅ Manual secret displayed for screen-reader/no-camera users (`page.tsx:108`)
- ✅ Recovery codes shown ONCE with warning text (`page.tsx:110-130`)
- ✅ "Copy all" button (`page.tsx:121-129`)
- ✅ 6-digit code input with `inputMode="numeric"` (`page.tsx:137-146`)
- ❌ **QR SVG has no alt-text / aria-label** (`dangerouslySetInnerHTML` blob at line 106) — RGAA/WCAG fail
- ❌ **No download / print option for recovery codes** — user can copy but cannot save as file. Industry pattern is to offer .txt download.
- ❌ **Post-verify "Back to dashboard" href is `"../"`** — should be `/{locale}/admin` with router.push. Browser back-button friendly but not deep-linkable.
- ❌ **No "I've stored my recovery codes" confirmation checkbox** before allowing Verify. Industry pattern (1Password, GitHub).
- ⚠️ **No backup factor for admins.** If admin loses phone AND recovery codes, only super-admin reset is the path. Acceptable for B2C, B2B reviewers will flag.

### Q8. WebAuthn / passkeys for admin 2026

State of the world:
- 87% of enterprises piloting passkeys (HID/FIDO 2025 survey).
- NIST SP 800-63-4 (July 2025): synced passkeys = AAL2, device-bound = AAL3.
- SOC 2 + ISO 27001 audits in 2026 ask "are privileged users enrolled in passkeys?"
- `@simplewebauthn/server` + `@simplewebauthn/browser` is the canonical TypeScript stack. Node LTS 20+, ~4 API endpoints (`registerStart/Finish`, `loginStart/Finish`).
- Per Corbado/Mojoauth: contextual enrollment (after successful password login) lifts adoption ~2× vs settings-page-only.

For Musaium V1 (B2C launch June 2026):
- **Skip for V1.** TOTP is sufficient for the early-adopter B2C tier.
- **Plan for V1.1 (~Q3 2026)** alongside any B2B pilot. Estimated cost: ~1 week BE + ~3 days FE on top of current MFA module.
- **Mandatory for admin@musaium.fr (Tim) and museum-tenant admins once B2B lands** — the "evidence trail" SOC 2 wants.

### Q9. Audit logs UX

Current `/admin/audit-logs/page.tsx`:
- ✅ Server-side pagination (page=1, limit=20)
- ✅ Action filter (text input, debounced)
- ❌ **No date range filter**
- ❌ **No actor (user_id / email) filter**
- ❌ **No resource type filter**
- ❌ **No CSV/JSON export**
- ❌ **No retention indicator** (user can't tell how far back logs go)

SOC 2 (per Konfirmity / Bytebase / Marutitech 2026 guides):
- Minimum 1 year retention required for audit evidence. **Musaium retention policy not verified by R20 — needs backend ADR check.**
- Externalization to immutable store (S3 Object Lock / Splunk / Datadog) standard practice.
- Export to CSV: standard for evidence submission.

GDPR Article 17 conflict (verified via gdpr-info.eu): audit log retention is a recognized exemption from right-to-erasure when justified by legal/audit obligation. **But** the document must show this distinction explicitly — Musaium has no such ADR today.

### Q10. Verdict — production-ready for V1?

**Yes, with caveats. Three P0 launch blockers, six P1 follow-ups.**

#### P0 (must fix before 2026-06-01 launch)

1. **`admin/users/[id]/page.tsx` is a stub** — placeholder `---` for email/role/created. Functional admin user detail required. Owner: web team.
2. **MFA recovery codes a11y + UX** — add SVG `aria-label`, download-as-txt button, "I've saved my codes" confirmation. Owner: web team, ~2h work.
3. **`RoleGuard` `super_admin` implicit-admin behavior contradicts code.** Either fix the `.includes()` check to honor the hierarchy (`if (user.role === 'super_admin') return <>{children}</>`), or delete the misleading comment. Owner: web team, ~10 min.

#### P1 (V1.1 within 60 days of launch)

4. Add `Sec-Fetch-Site` cross-site reject middleware (BE defense-in-depth).
5. Audit logs: date-range + actor filters, CSV export.
6. WebAuthn/passkey enrollment for admins.
7. Move backend `csrf_token` cookie to `__Host-` prefix (`__Host-csrf_token`) for additional integrity binding (no Domain attribute, Path=/, Secure required).
8. ADR documenting why we're not using Server Actions for mutations (so future contributors don't accidentally introduce one and bypass HMAC).
9. ADR documenting audit log retention policy + GDPR Art. 17 exemption justification.

#### P2 (V2+, opportunistic)

10. Migrate to TanStack Table v8 for sortable/filterable admin lists.
11. Re-evaluate Better Auth when multi-museum org scoping lands.
12. Add CASL when role/permission count crosses ~10 or needs per-resource grants.

---

## 4. Per-page feature matrix

| Page | Auth check | Role check | CSRF on mutations | Pagination | Filters | Export | A11y verified |
|---|---|---|---|---|---|---|---|
| dashboard | ✅ AdminShell | ✅ admin\|mod\|super | n/a (read) | n/a | n/a | n/a | ❓ |
| analytics | ✅ | ✅ | n/a | n/a | n/a | n/a | ❓ |
| audit-logs | ✅ | ✅ | n/a | ✅ | ⚠️ action only | ❌ | ❓ |
| login | bypass | bypass | ❌ pre-auth exempt | n/a | n/a | n/a | ❓ |
| mfa | ✅ | ✅ | ✅ via apiPost | n/a | n/a | n/a | ❌ SVG alt missing |
| ops/grafana | ✅ | ✅ super_admin only | ❌ not via apiPost (iframe) | n/a | n/a | n/a | ❓ |
| reports | ✅ | ✅ | not read | not read | not read | not read | not read |
| reviews | ✅ | ✅ | not read | not read | not read | not read | not read |
| support | ✅ | ✅ | not read | not read | not read | not read | not read |
| tickets | ✅ | ✅ | not read | not read | not read | not read | not read |
| users | ✅ | ✅ | ✅ apiPatch role change | ✅ | ✅ search + role | ❌ | ❓ |
| users/[id] | ✅ | ✅ | n/a (stub) | n/a | n/a | n/a | ❌ STUB |

"not read" = R20 stayed in scope; check with the dedicated frontend audit agent if one exists.

---

## 5. Per-control checklist (control-by-control)

### 5.1 Cookies

- [x] HttpOnly on `access_token` and `refresh_token` (backend auth-cookies.ts:33,55)
- [x] Secure flag (`secure: env.NODE_ENV === 'production'` in same file)
- [x] SameSite=Strict on `access_token` / `refresh_token` / `csrf_token`
- [x] Path=`/api/auth` on `refresh_token` (limits attack surface)
- [x] `csrf_token` deliberately NOT HttpOnly (needed for JS echo back)
- [ ] **`__Host-` prefix on csrf_token** — adds integrity binding to Path=/ + Secure + no Domain. Low-effort P1.
- [x] Short TTL on access_token (drives `Max-Age`)

### 5.2 CSRF

- [x] Signed double-submit HMAC-SHA256 server-side
- [x] `timingSafeEqual` on compare
- [x] Safe methods exempt (RFC 9110 §9.2.1)
- [x] Pre-auth endpoints exempt (with justification)
- [x] Bearer-auth bypass for mobile
- [ ] Sec-Fetch-Site defense-in-depth (P1)
- [ ] Origin header check (R7 to verify)

### 5.3 Session

- [x] JWT refresh flow with serial queue (api.ts:131-151)
- [x] Refresh failure → automatic logout via `onLogout` callback
- [ ] **Refresh token rotation reuse detection** — R7/R20 cross-check needed. If rotation issues new refresh and old isn't invalidated, theft is undetectable. Verified pattern recommended by Auth0/Descope 2026.
- [x] No session in URL (per OWASP)

### 5.4 RBAC

- [x] 5 well-defined roles
- [x] Server-side enforcement on every admin API route (per R7 / backend audit; not verified by R20)
- [x] Client-side `RoleGuard` for UX (UI hiding)
- [ ] **Bug**: `super_admin` implicit-admin promise in code comment is not honored by `.includes()` check
- [ ] Per-museum scoping (museum_manager.museumId) — not present in `AuthUser` shape; needed for multi-museum admin

### 5.5 MFA

- [x] TOTP enrollment with QR + manual key + recovery codes
- [x] Recovery codes shown once
- [x] Copy-all button
- [ ] SVG alt-text / aria-label
- [ ] Downloadable recovery codes file
- [ ] "I've stored my codes" confirmation gate
- [ ] WebAuthn / passkeys (V1.1)
- [ ] Admin lockout recovery path documented

### 5.6 Audit logs

- [x] Server-side pagination
- [x] Action filter
- [ ] Date range filter
- [ ] Actor filter
- [ ] Resource type filter
- [ ] CSV export
- [ ] Retention policy documented (ADR)
- [ ] External immutable store (S3 Object Lock / Splunk) — not required V1, recommended for first SOC 2

### 5.7 CVE / security advisories tracking

- [x] Next.js 15.5.18 (past CVE-2025-29927 fix at 15.2.3)
- [x] React 19.2.0
- [x] Backend not affected by middleware-bypass since we don't rely on middleware for authorization (verify with R7)

---

## 6. Recommended action items (ranked)

| Pri | Action | Effort | Owner | Risk if skipped |
|---|---|---|---|---|
| P0 | Implement `admin/users/[id]/page.tsx` — fetch + render user detail | ~1 day | web | Admin cannot manage users post-launch |
| P0 | Fix `RoleGuard` super_admin implicit-admin (1 line) OR delete the comment promise | 10 min | web | Security-doc drift; might lock super_admin out of admin-only pages someday |
| P0 | MFA QR SVG aria-label + recovery-codes download button + saved-confirmation | ~2h | web | A11y compliance (RGAA, WCAG 2.2) |
| P1 | Sec-Fetch-Site cross-site reject middleware (BE) | ~1h | backend | Defense-in-depth, not a critical hole |
| P1 | Audit log: date range + actor filter + CSV export | ~2 days | full-stack | SOC 2 month-3 readiness |
| P1 | WebAuthn/passkey enrollment for admins | ~1 week | full-stack | B2B sales blocker beyond Q3 2026 |
| P1 | ADR: audit log retention + GDPR Art. 17 exemption | ~2h | docs | SOC 2 evidence |
| P1 | ADR: no Server Actions for mutations + reason | ~30 min | docs | Drift prevention |
| P2 | `__Host-csrf_token` cookie prefix | ~30 min | backend | Cosmetic hardening |
| P2 | TanStack Table v8 on audit-logs + users list | ~2 days | web | UX upgrade, not a gap |

---

## 7. Verdict in one paragraph

Musaium web admin is **production-ready for the V1 launch on 2026-06-01 conditional on three small P0 fixes** (the user-detail stub, the RoleGuard hierarchy bug, and three MFA a11y polishes). The auth substrate — HttpOnly + Secure + SameSite=Strict cookies, signed-double-submit HMAC CSRF, refresh-token queueing, Next.js 15.5.18 past CVE-2025-29927 — is on par with or ahead of mainstream 2026 advice. The choice to stay home-grown rather than adopt Auth.js v5 or Better Auth is the right call pre-launch (Lucia is dead, others are >2 weeks of churn for no real gain). The single objectively-missing 2026 best practice is **WebAuthn/passkeys**, which is a strong V1.1 ship — not a launch blocker for the B2C tier, but mandatory before the first SOC 2 / B2B-museum contract review. Audit log UX is the second-largest gap and is also B2B-driven (date range, actor filter, CSV export, retention ADR). RBAC is fine for 5 roles flat; CASL is the cleanest migration target if multi-museum per-resource permissions land in V2.

---

## 8. Things I did NOT verify (call out for follow-up agents)

- **Refresh-token reuse detection** in backend — referenced as recommendation but not verified by reading backend code (out of R20 scope).
- **Origin / Referer header check** in backend Express — not verified (R7 territory).
- **CSP report-uri** — middleware sets CSP header but no `report-uri` / `report-to` directive observed. May be deliberate (Sentry catches CSP errors via its own SDK).
- **`/admin/reports`, `/admin/reviews`, `/admin/support`, `/admin/tickets` page content** — not read line-by-line by R20. Mark in `05-gaps/` if no other agent covers them.
- **Backend audit log retention setting + schema** — not verified.
- **EAS / RN mobile parity for the same CSRF flow** — R-mobile-auth (if exists) should confirm the mobile bearer-bypass branch is consistently exempt.

---

## 9. Lessons / open questions for the wider audit

1. The user-detail stub is one of multiple "placeholder" pages mentioned in the brief. Worth a sweep for other `---` rendered fields across `museum-web`.
2. The middleware adds a CSP nonce per request — this requires every inline `<script>` to consume the nonce via `headers().get('x-nonce')`. Verify no inline scripts skip it (one missing nonce = CSP report-only warning, not breakage today, but cleanup item).
3. The `admin-authz` cookie is a UX-only redirect hint. If it ever gets reused as an auth signal, the security boundary collapses. Add a code comment in `middleware.ts` reinforcing this if not already there. (Verified: comment is present, line 11-15.)

---

## 10. Sources (cited)

### OWASP
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) — primary source for double-submit vs signed-double-submit vs Fetch Metadata
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — HttpOnly + SameSite guidance
- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) — localStorage anti-pattern
- [OWASP CSRF Cheatsheet — Fetch Metadata Issue 1803](https://github.com/OWASP/CheatSheetSeries/issues/1803) — confirmation Fetch Metadata is now a complete alternative
- [OWASP — David Johansson, Double Defeat of Double-Submit](https://owasp.org/www-chapter-london/assets/slides/David_Johansson-Double_Defeat_of_Double-Submit_Cookie.pdf) — why naive double-submit is discouraged

### Next.js / Vercel
- [Next.js Data Security Guide](https://nextjs.org/docs/app/guides/data-security) — Server Actions Origin/Host check
- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication) — session management baseline
- [Next.js — How to Think About Security in Server Components](https://nextjs.org/blog/security-nextjs-server-components-actions)
- [Next.js May 2026 Security Release](https://vercel.com/changelog/next-js-may-2026-security-release) — recent CVE batch
- [NVD: CVE-2025-29927](https://nvd.nist.gov/vuln/detail/CVE-2025-29927) — middleware bypass
- [Datadog: CVE-2025-29927 analysis](https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/)

### Auth libraries
- [Auth.js v5 docs — migrating to v5](https://authjs.dev/getting-started/migrating-to-v5)
- [Auth.js v5 Next.js reference](https://authjs.dev/reference/nextjs)
- [Lucia Auth — A fresh start (deprecation announcement)](https://github.com/lucia-auth/lucia/discussions/1714)
- [Lucia Auth — pilcrow announces March 2025 deprecation](https://x.com/pilcrowonpaper/status/1847975622087414177)
- [Better Auth](https://better-auth.com/)
- [Better Stack: Better Auth vs NextAuth vs Auth0](https://betterstack.com/community/guides/scaling-nodejs/better-auth-vs-nextauth-authjs-vs-autho/)
- [Auth.js — migrate to Better Auth (official path)](https://authjs.dev/getting-started/migrate-to-better-auth)
- [PkgPulse: better-auth vs Lucia vs NextAuth 2026](https://www.pkgpulse.com/blog/better-auth-vs-lucia-vs-nextauth-2026)

### CSRF / Fetch Metadata
- [Sec-Fetch-Site MDN reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site)
- [web.dev — Fetch Metadata](https://web.dev/articles/fetch-metadata)
- [sergiodxa — Use Sec-Fetch Headers for CSRF Protection](https://sergiodxa.com/tutorials/use-sec-fetch-headers-for-csrf-protection)
- [Filippo Valsorda — Cross-Site Request Forgery](https://words.filippo.io/csrf/)
- [Miguel Grinberg — CSRF Protection without Tokens](https://blog.miguelgrinberg.com/post/csrf-protection-without-tokens-or-hidden-form-fields)
- [Loke.dev — Understanding Sec-Fetch Headers](https://loke.dev/blog/how-i-finally-understood-sec-fetch-headers)

### Cookies / SameSite
- [Vercel — SameSite Cookie Attribute](https://vercel.com/blog/understanding-the-samesite-cookie-attribute)
- [Andrew Lock — Understanding SameSite cookies](https://andrewlock.net/understanding-samesite-cookies/)
- [PortSwigger — Bypassing SameSite restrictions](https://portswigger.net/web-security/csrf/bypassing-samesite-restrictions)

### RBAC
- [Casbin Node.js](https://github.com/casbin/node-casbin)
- [Permify — Open Source Authorization Libraries](https://permify.co/post/open-source-authorization-libraries/)
- [PkgPulse — CASL vs Casbin vs accesscontrol 2026](https://www.pkgpulse.com/guides/casl-vs-casbin-vs-accesscontrol-authorization-rbac-2026)
- [CASL Isomorphic Authorization](https://casl.js.org/)
- [WorkOS — Designing multi-tenant RBAC SaaS](https://workos.com/blog/how-to-design-multi-tenant-rbac-saas)
- [LoginRadius — Access Control SaaS Guide for B2B](https://www.loginradius.com/blog/engineering/rbac-saas-multi-tenant-b2b-platforms)

### MFA / TOTP / WebAuthn
- [LogRocket — 2FA UX patterns](https://blog.logrocket.com/ux-design/2fa-user-flow-best-practices/)
- [WorkOS — UX best practices for MFA](https://workos.com/blog/ux-best-practices-for-mfa)
- [WebAuthn Guide](https://webauthn.guide/)
- [WebAuthn.io demo](https://webauthn.io/)
- [SimpleWebAuthn](https://simplewebauthn.dev/)
- [SimpleWebAuthn server docs](https://simplewebauthn.dev/docs/packages/server)
- [Google — Server-side passkey authentication](https://developers.google.com/identity/passkeys/developer-guides/server-authentication)
- [Security Boulevard — Passkeys at Scale 2026](https://securityboulevard.com/2026/03/passkeys-at-scale-the-complete-enterprise-deployment-playbook-2026/)
- [HID — IAM in 2026: Passwordless, Passkeys & AI threats](https://blog.hidglobal.com/iam-authentication-2026-5-key-predictions-enterprises)
- [MojoAuth — 87% of Enterprises Deploying Passkeys 2026](https://mojoauth.com/blog/8-reasons-enterprises-deploying-passkeys)
- [Corbado — World Passkey Day 2026 Benchmark](https://www.corbado.com/blog/world-passkey-day-passkey-benchmark-2026)
- [State of Passkeys 2026](https://state-of-passkeys.io/)

### JWT / refresh tokens
- [Descope — Developer's Guide to Refresh Token Rotation](https://www.descope.com/blog/post/refresh-token-rotation)
- [Auth0 — Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [Okta — Refresh access tokens and rotate refresh tokens](https://developer.okta.com/docs/guides/refresh-tokens/main/)
- [Mihai Andrei — Secure Refresh Token Rotation with Theft Detection](https://mihai-andrei.com/blog/refresh-token-reuse-interval-and-reuse-detection/)

### Audit logs / compliance
- [Konfirmity — SOC 2 Data Retention Guide 2026](https://www.konfirmity.com/blog/soc-2-data-retention-guide)
- [Bytebase — SOC 2 Data Security and Retention](https://www.bytebase.com/blog/soc2-data-security-and-retention-requirements/)
- [Qualysec — SOC 2 Controls Checklist 2026](https://qualysec.com/soc-2-controls/)
- [Axiom — Right to Be Forgotten vs Audit Trail](https://axiom.co/blog/the-right-to-be-forgotten-vs-audit-trail-mandates)
- [GDPR Article 17 — Right to erasure](https://gdpr-info.eu/art-17-gdpr/)

### Admin UX / data fetching
- [AdminLTE — 8 Best Next.js 16 Admin Dashboards with shadcn/ui (2026)](https://adminlte.io/blog/nextjs-admin-dashboards-shadcn/)
- [AdminLTE — Build an Admin Dashboard with shadcn/ui and Next.js (2026)](https://adminlte.io/blog/build-admin-dashboard-shadcn-nextjs/)
- [TanStack Table — Pagination Guide](https://tanstack.com/table/latest/docs/guide/pagination)
- [Refine — refine vs React Admin](https://refine.dev/blog/refine-vs-react-admin/)
- [PkgPulse — TanStack Query vs SWR vs Apollo 2026](https://www.pkgpulse.com/blog/tanstack-query-vs-swr-vs-apollo-2026)
- [shadcn — Command component](https://www.shadcn.io/ui/command)
- [UXPatterns — Command Palette pattern](https://uxpatterns.dev/patterns/advanced/command-palette)

### Misc 2026 references
- [Authgear — Next.js Security Best Practices 2026](https://www.authgear.com/post/nextjs-security-best-practices/)
- [Authgear — Next.js Session Management](https://www.authgear.com/post/nextjs-session-management/)
- [WorkOS — Next.js App Router Auth Guide 2026](https://workos.com/blog/nextjs-app-router-authentication-guide-2026)
- [Arcjet — Next.js server action security](https://blog.arcjet.com/next-js-server-action-security/)
- [Cyber Kendra — React + Next.js 12 vulnerabilities May 2026](https://www.cyberkendra.com/2026/05/react-and-nextjs-hit-with-12-security.html)

---

## 11. Source files cited (Musaium codebase)

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/lib/auth.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/lib/api.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/middleware.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/[locale]/admin/layout.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/[locale]/admin/page.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/[locale]/admin/audit-logs/page.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/[locale]/admin/login/page.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/[locale]/admin/mfa/page.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/[locale]/admin/users/page.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/[locale]/admin/users/[id]/page.tsx` — **the stub**
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/[locale]/admin/ops/grafana/layout.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/components/admin/AdminShell.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/package.json`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/helpers/middleware/csrf.middleware.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/auth/adapters/primary/http/helpers/auth-cookies.ts`

---

**End of R20.**
