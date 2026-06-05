# Musaium Mobile — Test Index (Phase 1, 2026-05-17 · refreshed 2026-05-19)

Single source of truth for what's tested locally vs what's not. Updated at
the end of every test-discipline cycle. Companion to
[`TEST_COVERAGE_INVENTORY.md`](TEST_COVERAGE_INVENTORY.md) (the full surface
map) and [`TESTING_PHASE2_PLAN.md`](TESTING_PHASE2_PLAN.md) (expansion plan).

> **Audit refresh 2026-05-19 — verified actuals:** 27 active `.maestro/*.yaml`
> flows (excl `config.yaml`) + 6 secondary `maestro/*.yaml`. The flow tables
> below are rebuilt to the current set (8 auth-* split flows + onboarding/nav
> additions + `chat-cartel-deeplink`, `cert-pinning-smoke`, `auth-submit-invalid-email`
> were missing). **Honesty note (UFR-013):** these flows are written and present
> in-repo, but the suite is NOT yet wired into CI (UFR-021 Phase 2 pending) and
> has not been recorded as run here — so "Last run" stays blank and status is
> "🟡 written-in-repo, run-status-unrecorded", NOT a green claim.

## Local quick run

```bash
# 1. Stack up + migration check + Metro + Xcode (one command)
pnpm dev:stack

# 2. Backend API contracts (13 scenarios, ~10s, auto-cleanup)
pnpm smoke:api

# 3. Maestro suites (must have simulator + Metro up)
cd museum-frontend
maestro test .maestro/auth-flow.yaml             # existing happy flow (EN)
maestro test .maestro/auth-register-happy.yaml   # Phase 1 — written tonight
# ... see "Maestro flows" table below for full list
```

## Smoke API (`pnpm smoke:api`)

13/13 ✅ green as of 2026-05-17 21h.

| # | Scenario | Endpoint | Assertion |
|---|---|---|---|
| 1 | SETUP : backend reachable + rate-limit reset | `GET /api/health` | 200 + `database: up` |
| 2 | AUTH register — happy | `POST /api/auth/register` | 201 + `user.id` |
| 3 | AUTH register — PASSWORD_BREACHED (HIBP) | `POST /api/auth/register` | 400 + `error.code: 'PASSWORD_BREACHED'` |
| 4 | AUTH register — CONFLICT (dup email) | `POST /api/auth/register` | 409 + `error.code: 'CONFLICT'` |
| 5 | AUTH register — MINOR_PARENTAL_CONSENT | `POST /api/auth/register` | 422 + `error.code: 'MINOR_PARENTAL_CONSENT_REQUIRED'` |
| 6 | AUTH register — BAD_REQUEST (short pw) | `POST /api/auth/register` | 4xx |
| 7 | AUTH login — EMAIL_NOT_VERIFIED | `POST /api/auth/login` | 403 + `error.code: 'EMAIL_NOT_VERIFIED'` |
| 8 | AUTH login — happy (after verify) | `POST /api/auth/login` | 200 + `accessToken` + `refreshToken` |
| 9 | AUTH login — INVALID_CREDENTIALS | `POST /api/auth/login` | 401 + `error.code: 'INVALID_CREDENTIALS'` |
| 10 | AUTH /me — authenticated | `GET /api/auth/me` | 200 + `user.email` matches |
| 11 | AUTH /me — anonymous | `GET /api/auth/me` | 401 |
| 12 | ONB /onboarding-complete — anonymous | `PATCH /api/auth/onboarding-complete` | 401 |
| 13 | ONB /onboarding-complete — authenticated | `PATCH /api/auth/onboarding-complete` | 200 / 204 |

## Maestro flows

> Status legend : ✅ green (recorded run), 🟡 written-in-repo / run-status-unrecorded, ❌ red, ⏭️ skipped, ▶️ running
>
> All 27 active flows below are 🟡 — present in-repo, not yet CI-wired
> (UFR-021 Phase 2 pending), no recorded run. Flip to ✅ + fill "Last run"
> only after an actual recorded run (do NOT mark green on faith — UFR-013).

> **Known runtime issue (2026-05-17, to fix next session) :**
> Maestro `launchApp: clearState: true` on the Expo Dev Build launches the
> Expo Dev Launcher screen (`Musaium — Development Build`), NOT the actual
> app. Flow then fails on the first assertion. Two workarounds for next
> session :
> 1. After clearState, tap on the dev server URL (host-specific, e.g.
>    `http://192.168.1.68:8081`) — not portable across machines.
> 2. Build a Release variant of the app for Maestro runs (no Dev Launcher,
>    JS bundle embedded). Add a `pnpm test:maestro:build-release` script.
> Currently flows omit clearState — they assume the app is at the auth
> screen pre-run. Manual reset between flows required until next session.

### AUTH (`museum-frontend/.maestro/auth-*.yaml` — 8 flows)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `auth-flow.yaml` | 🟡 | — | Register → Home → Logout → Login → Home. EN text matchers, needs locale FR-EN flexibility check |
| `auth-register-happy.yaml` | 🟡 | — | Register happy path |
| `auth-register-password-breached.yaml` | 🟡 | — | Register → PASSWORD_BREACHED (HIBP) |
| `auth-register-duplicate-email.yaml` | 🟡 | — | Register → CONFLICT (dup email) |
| `auth-register-minor-dob.yaml` | 🟡 | — | Register → MINOR_PARENTAL_CONSENT |
| `auth-login-happy.yaml` | 🟡 | — | Login happy path |
| `auth-login-invalid-credentials.yaml` | 🟡 | — | Login → INVALID_CREDENTIALS |
| `auth-submit-invalid-email.yaml` | 🟡 | — | Invalid email format → validation error (DOB-class regression guard) |
| `auth-account-delete.yaml` | 🟡 | — | Account deletion flow |
| `auth-persistence.yaml` | 🟡 | — | Login → kill app → relaunch → session restored |

### ONBOARDING + NAV (`museum-frontend/.maestro/{onboarding,nav}*.yaml`)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `onboarding-flow.yaml` | 🟡 | — | 4-slide carousel → complete → home |
| `onboarding-skip-anonymous.yaml` | 🟡 | — | Regression guard for markOnboardingComplete pre-auth bug fixed in commit 6c39e936 |
| `onboarding-full-carousel.yaml` | 🟡 | — | Walk 4 slides + complete |
| `navigation-flow.yaml` | 🟡 | — | Tab navigation + Settings → Preferences |
| `nav-tabs-roundtrip.yaml` | 🟡 | — | home → discover → carnet → settings → home |
| `nav-stack-deep-links.yaml` | 🟡 | — | Each (stack) screen reachable + back nav |

### CHAT + MUSEUM (`museum-frontend/.maestro/{chat,museum,audio}*.yaml`)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `chat-flow.yaml` | 🟡 | — | Core chat: send text → AI response |
| `chat-compare.yaml` | 🟡 | — | Attach artwork photo → similar artworks → tap match |
| `chat-history-pagination.yaml` | 🟡 | — | Multi-turn → scroll up → load older |
| `chat-cartel-deeplink.yaml` | 🟡 | — | Cartel scanner deeplink path |
| `museum-chat-flow.yaml` | 🟡 | — | Museums tab → detail → start chat from context |
| `museum-search-geo.yaml` | 🟡 | — | Museums tab + geolocation filtering + detail open/back |
| `audio-recording-flow.yaml` | 🟡 | — | Mic → record → transcription → AI audio response |

### SETTINGS / SUPPORT / SECURITY (`museum-frontend/.maestro/`)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `settings-flow.yaml` | 🟡 | — | Settings hub → theme/privacy/terms/support → home |
| `settings-locale-switch.yaml` | 🟡 | — | fr↔en switch → verify re-render |
| `support-ticket-create.yaml` | 🟡 | — | Settings → Support → fill form → submit → success |
| `cert-pinning-smoke.yaml` | 🟡 | — | Cert-pinning runtime smoke |

### MANUAL SCREENSHOT TOOLING (`museum-frontend/maestro/` — 3 dev/release utils, NOT CI coverage; see `maestro/README.md`)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `login-and-capture.yaml` | manual | — | Login → home → capture screenshots (not a regression test) |
| `capture-screens.yaml` | manual | — | Navigate all screens → capture for docs (not a regression test) |
| `screenshots.yaml` | manual | — | App Store / release-notes screenshot capture (not a regression test) |

> **TD-34 (2026-06-05):** `voice-record-and-tts` / `paywall-quota-exhaustion` / `rtl-switch-ar` removed — silently CI-skipped; voice + paywall superseded by `.maestro/`; RTL/Arabic e2e is a genuine remaining gap.

## Known testID gaps (extracted from inventory)

See [`TEST_COVERAGE_INVENTORY.md`](TEST_COVERAGE_INVENTORY.md) §4 for the
full list. Top 10 critical to add before extending Maestro coverage further :

1. `register-submit` — S'inscrire button (the one that just bit us, no testID)
2. `tab-home` / `tab-discover` / `tab-carnet` / `tab-settings` — bottom tabs
3. Bottom-sheet route buttons (`features/chat/ui/bottom-sheet-router/`)
4. Settings nav rows
5. Modal dismiss / confirm buttons
6. ... (see inventory)

## How tests get added going forward (UFR-021 — ACCEPTED-PARTIAL)

Per [`TESTING_DISCIPLINE_PROPOSAL.md`](TESTING_DISCIPLINE_PROPOSAL.md) +
CLAUDE.md § Post-feature test coverage, every new screen or major feature
MUST ship with associated Maestro coverage OR an explicit
`// e2e-skip: <reason ≥ 30 chars>` justification in source code.

Status (2026-05-19):
- ✅ Sentinel shipped — `scripts/sentinels/screen-test-coverage.mjs` (repo root),
  run locally via `pnpm sentinel:screen-test-coverage` (root `package.json:22`). Baseline grandfathers
  pre-UFR-021 screens in `museum-frontend/.maestro/coverage-baseline.json`
  (removals only, never grow).
- ⏳ Pre-push gate + `ci-cd-mobile.yml` step + `sentinel-mirror.yml` mirror —
  NOT wired yet (Phase 2, pending user validation per CLAUDE.md
  "Phase 2 (à wirer après validation user)"). Until then the sentinel is
  advisory: run it manually before push.

## Maintenance

This file is regenerated end-of-session whenever new flows land. The
"Status" column is updated on every Maestro run. The "Last run" timestamp
should be filled by the runner (Phase 2 to-do : automate this via
`pnpm test:maestro:all` that updates the table).
