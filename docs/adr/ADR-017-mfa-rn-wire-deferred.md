# ADR-017 — MFA RN wire (E2) deferred to post-launch + 30 days

Status: Accepted — 2026-04-30 · re-confirmed 2026-05-05 (defer post-launch+30d)
Context: Audit 2026-04-30 finding E2 · sprint 2026-05-05 P1 closure decision

## Question

The 2026-04-30 audit flagged the React Native MFA screens as built but unwired:

- `museum-frontend/features/auth/screens/MfaEnrollScreen.tsx` (TOTP enrollment + recovery codes)
- `museum-frontend/features/auth/screens/MfaChallengeScreen.tsx` (TOTP / recovery code challenge)
- `museum-frontend/features/auth/screens/MfaWarningBanner.tsx` (admin warning-window banner)

Backend MFA shipped (R16 + the 2026-04-30 OIDC nonce work in commit `76e860d4`). The screens already consume `mfaService` from `infrastructure/mfaApi.ts`. What's missing is the wiring: route files in `app/(stack)/`, login flow detection of `mfaRequired`, settings entry, and i18n keys.

## User-confirmed product decisions (this session)

1. **Optional V1** — visitor users may enable MFA but the app does not enforce it.
2. **TOTP only** + **recovery codes** as backup. No SMS provider. Google/Apple OAuth bypass MFA per standard federation.
3. **Banner re-show 30 days** if user dismisses without enrolling.
4. **Step-up MFA** for sensitive actions deferred to V2.

## Decision

**Defer to a dedicated PR.** Backend MFA is shipped and the RN screens are functional in isolation. The wire-up is a UX-driven sprint that warrants its own work, not a tail-end of an architectural-cleanup audit.

## Why defer

- Multi-surface change. Touches `app/(stack)/mfa-enroll.tsx`, `app/(stack)/mfa-challenge.tsx`, `application/useEmailPasswordAuth.ts`, `app/(stack)/settings.tsx` (new security section), banner integration, i18n FR + EN, unit tests, and Maestro E2E.
- UX gap. The `MfaWarningBanner` was authored for the admin warning-window flow (`daysRemaining` prop). The visitor-facing dismiss-and-re-show-30-days pattern needs a separate banner variant or a refactor of the existing one — a UX call, not a mechanical wire.
- Login flow rework. `authService.login()` currently throws on MFA-required responses (`throw new Error('MFA_REQUIRED')`). MFA-aware callers consume `mfaApi.ts`'s envelope-aware login. Migrating `useEmailPasswordAuth` to the envelope path requires changing the public contract and updating every caller — careful work that deserves dedicated review.
- Test coverage. Maestro E2E for the full enrollment + challenge round-trip is high-value but requires a real backend with MFA enabled and a TOTP secret-aware test harness. Out of scope for an architectural cleanup PR.
- Parallel agent activity. Another Claude on this branch shipped backend MFA + OIDC nonce work in this very session. Layering RN wire on top while the backend surface is still settling adds avoidable conflict risk.

## Concrete migration plan (for the future PR)

### Phase 1 — Route wire
- `app/(stack)/mfa-enroll.tsx` — render `<MfaEnrollScreen onEnrolled={() => router.replace(...)} />`. Resolve the success destination from a `redirect` query param (mirrors `(stack)/mfa-challenge.tsx`).
- `app/(stack)/mfa-challenge.tsx` — read `mfaSessionToken` from params, render `<MfaChallengeScreen mfaSessionToken={token} onSuccess={(session) => loginWithSession(session) → router.replace(home)} />`. Guard against missing token (back to auth screen).

### Phase 2 — Login flow
- Migrate `useEmailPasswordAuth.handleLogin` from `authService.login` to the envelope-aware variant in `mfaApi`.
- On `isMfaRequired(envelope)` → `router.push('/(stack)/mfa-challenge?mfaSessionToken=...')`.
- On `isMfaEnrollmentRequired(envelope)` → `router.push('/(stack)/mfa-enroll?reason=enrollment-required')` (admin warning window soft-block path).
- Preserve current behavior on plain `AuthSessionResponse`.

### Phase 3 — Settings security section
- New `(stack)/settings.tsx` row "Authentication 2FA" with toggle.
- OFF + tap → push `/(stack)/mfa-enroll`.
- ON + tap → push a confirmation modal that requests password + TOTP code → calls `mfaService.disable(...)`.
- Show "X recovery codes remaining" hint when MFA is on. Alert the user when count drops below 3 (regenerate option).

### Phase 4 — Banner for visitors
- Add `MfaEncouragementBanner` (separate from `MfaWarningBanner` which stays admin-only) — dismissible, persists `mfa_encouragement_dismissed_at` in `expo-secure-store`, re-show after 30 days per user decision.
- Mount in `(tabs)/settings` root when `me.mfaEnabled === false` and the dismiss timestamp is older than 30 days.
- The admin `MfaWarningBanner` remains for the warning-window flow with `daysRemaining`.

### Phase 5 — i18n
- New `auth.mfa.*` keys: `enroll_title`, `enroll_subtitle`, `challenge_title`, `challenge_subtitle`, `recovery_codes_warning`, `copy_recovery_codes`, `enable_2fa`, `disable_2fa_confirm`, `recovery_codes_remaining`, `recovery_low_warning`, `encouragement_title`, `encouragement_dismiss`. FR + EN both shipped.
- Audit existing screens — they hard-code English strings today; migrating to `useTranslation()` is part of Phase 5.

### Phase 6 — Tests
- Unit tests for the migrated `useEmailPasswordAuth` MFA branch.
- Unit tests for the security toggle in `useSettingsActions`.
- Maestro E2E flow: register → enable MFA → log out → log in → MFA challenge → home.

## Acceptance criteria for the future PR

- A user can enable MFA from settings, complete enrollment, log out and log back in through the challenge.
- Recovery code consumption is verified: enrolling shows 10 codes, using one drops the remaining count by 1, displaying < 3 surfaces a regenerate prompt.
- The warning banner re-shows 30 days after dismiss (verified via clock-mock test).
- Google + Apple OAuth login bypasses MFA (federation = trust IdP) per user decision.
- 0 regression on existing email/password login for users without MFA enabled.
- Backend MFA suite stays green; mobile suite stays green; Maestro flow passes locally.

## Why this is honest engineering

The `coming_soon` stub for the screens shipped early so admins could test the backend in isolation. The product UX call (how aggressive to be about encouraging MFA, what the "dismiss + remind in 30 days" flow looks like, how to express the recovery-code state) is a designer-and-PM conversation, not a tail-end implementation. This ADR records the user-confirmed product decisions captured this session so the future PR starts from agreement instead of re-discovery.

Audit finding E2 is not closed; it is sequenced.

## 2026-05-05 re-decision — post-launch + 30 days

Sprint planning task F (`web-version-harmonize-roadmap-2026-05-05`) re-evaluated the SHIP-V1 vs DEFER question. Decision: **defer to post-launch + 30 days** (target window 2026-07-01 → 2026-07-15 if the launch holds the 2026-06-01 GA), not to an arbitrary future PR.

### Rationale

1. **Launch KR4 is acquisition (100 visitors B2C inscrits semaine 1)** — adding an MFA prompt to the onboarding funnel adds friction precisely where conversion is the priority. MFA is a conversion-rate killer for B2C apps in week 1; we prefer to ship MFA *after* the acquisition cohort baseline is measured (week 1 NPS + signup rate), not before.
2. **No regulatory requirement at GA** — Musaium V1 holds no PII beyond email + chat history; ADR-014 (`mfa-all-roles-enforcement`) already enforces MFA on admin / museum-admin roles via the existing web admin panel. Visitor MFA is a defense-in-depth nice-to-have, not a compliance gate.
3. **Risk to launch readiness** — the Phase 1-6 wire-up remains a 1-2 dev-day surface change with cross-cutting touches (login flow, settings screen, banner, i18n keys, Maestro E2E). Doing it in the 2026-05-05 → 2026-05-19 P1 closure window competes with iOS 26 crash diagnostics, F3 MuseumSheet finalize, and cert pinning Phase 2 (cf. SPRINT_2026-05-05_PLAN.md). Those P1 items must ship; MFA RN can slip without affecting GA.
4. **Soak window keeps the surface small** — feature freeze on 2026-05-19 prefers narrowing the change set on the release branch. Adding MFA RN crosses 4-5 features (auth, settings, i18n, banner) — a wide blast radius right before freeze is the opposite of soak hygiene.
5. **Backend is ready and stays ready** — the BE MFA + recovery codes shipped (commit `76e860d4`). Deferring the RN wire does not regress backend test coverage or chaos resilience.

### Post-launch + 30 days checklist (target window 2026-07-01 → 2026-07-15)

Open the dedicated PR only when **all 4** are true:

1. KR4 baseline measured — at least 14 days of post-launch acquisition data captured in Langfuse + analytics. The conversion-rate impact of an MFA prompt at signup is informed, not assumed.
2. iOS 26 crash investigation closed (cf. `project_ios26_crash_investigation` memo + ADR-004) — MFA enrollment shows TOTP secret QR codes; we do not want to layer a new flow on a still-debugging iOS surface.
3. No active P0 in mobile crash-free rate (Sentry ≥ 99.5% sustained 14 days post-launch).
4. UX wireframe sign-off on the visitor-facing `MfaEncouragementBanner` and the settings security section copy (FR + EN). The wire-up is multi-surface; UX-led not engineering-led.

### Post-launch + 30 days plan recap

The Phase 1-6 plan documented above (route wire / login flow / settings security / banner / i18n / tests) remains the implementation playbook. No revision required — only the trigger date is bound.

### Scope expectation

When the future PR ships, it must include:

- Maestro E2E flow `auth-mfa-enroll-challenge` added to `museum-frontend/.maestro/` and registered in `shards.json` (per CLAUDE.md Maestro rules).
- New i18n keys present in both FR + EN dictionaries.
- Vitest / Jest unit tests for the migrated `useEmailPasswordAuth` MFA branch.
- One coordinated commit chain (route wire → login flow → settings → banner → i18n → tests), not a single mega-commit.

The dedicated PR will explicitly link this ADR and either close it (Status: Superseded) or amend the trigger checklist if a constraint pushes it back further.
