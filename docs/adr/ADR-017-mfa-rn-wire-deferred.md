# ADR-017 — MFA RN wire (E2) deferred to dedicated PR

Status: Accepted — 2026-04-30
Context: Audit 2026-04-30 finding E2

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
