# Musaium Mobile — Test Index (Phase 1, 2026-05-17)

Single source of truth for what's tested locally vs what's not. Updated at
the end of every test-discipline cycle. Companion to
[`TEST_COVERAGE_INVENTORY.md`](TEST_COVERAGE_INVENTORY.md) (the full surface
map) and [`TESTING_PHASE2_PLAN.md`](TESTING_PHASE2_PLAN.md) (expansion plan).

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

> Status legend : ✅ green, 🟡 written-not-run-yet, ❌ red, ⏭️ skipped, ▶️ running

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

### AUTH (`museum-frontend/.maestro/auth-*.yaml`)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `auth-flow.yaml` (existing) | ▶️ | — | EN text matchers, needs locale FR-EN flexibility check |
| `auth-register-happy.yaml` | 🟡 | — | Phase 1 — to validate in P2 |
| `auth-register-password-breached.yaml` | 🟡 | — | Phase 1 — to validate in P2 |
| `auth-register-duplicate-email.yaml` | 🟡 | — | Phase 1 — to validate in P2 |
| `auth-register-minor-dob.yaml` | 🟡 | — | Phase 1 — to validate in P2 |
| `auth-login-happy.yaml` | 🟡 | — | Phase 1 — to validate in P2 |
| `auth-login-invalid-credentials.yaml` | 🟡 | — | Phase 1 — to validate in P2 |
| `auth-account-delete.yaml` | 🟡 | — | Phase 1 — possibly blocked on missing testID |
| `auth-persistence.yaml` (existing) | 🟡 | — | Should still work — verify in P2 |

### ONBOARDING + NAV (`museum-frontend/.maestro/{onboarding,nav}-*.yaml`)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `onboarding-skip-anonymous.yaml` | 🟡 | — | Regression guard for markOnboardingComplete pre-auth bug fixed in commit 6c39e936 |
| `onboarding-full-carousel.yaml` | 🟡 | — | Walk 4 slides + complete |
| `nav-tabs-roundtrip.yaml` | 🟡 | — | home → discover → carnet → settings → home |
| `nav-stack-deep-links.yaml` | 🟡 | — | Each (stack) screen reachable + back nav |

### CHAT (`museum-frontend/.maestro/{chat,museum,audio}-*.yaml`)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `chat-flow.yaml` (existing) | 🟡 | — | Verify in P2 |
| `chat-compare.yaml` (existing) | 🟡 | — | Verify in P2 |
| `chat-history-pagination.yaml` (existing) | 🟡 | — | Verify in P2 |
| `museum-chat-flow.yaml` (existing) | 🟡 | — | Verify in P2 |
| `audio-recording-flow.yaml` (existing) | 🟡 | — | Verify in P2 |

### SETTINGS / OTHER (existing)

| Flow | Status | Last run | Notes |
|---|---|---|---|
| `settings-flow.yaml` (existing) | 🟡 | — | Verify in P2 |
| `paywall-quota-exhaustion.yaml` (existing) | 🟡 | — | Verify in P2 |
| `rtl-switch-ar.yaml` (existing) | 🟡 | — | Verify in P2 |
| `voice-record-and-tts.yaml` (existing) | 🟡 | — | Verify in P2 |
| `login-and-capture.yaml` (existing) | 🟡 | — | Verify in P2 |
| `screenshots.yaml` (existing) | 🟡 | — | Manual screenshot capture, not a regression test |
| `capture-screens.yaml` (existing) | 🟡 | — | Manual screenshot capture |

## Known testID gaps (extracted from inventory)

See [`TEST_COVERAGE_INVENTORY.md`](TEST_COVERAGE_INVENTORY.md) §4 for the
full list. Top 10 critical to add before extending Maestro coverage further :

1. `register-submit` — S'inscrire button (the one that just bit us, no testID)
2. `tab-home` / `tab-discover` / `tab-carnet` / `tab-settings` — bottom tabs
3. Bottom-sheet route buttons (`features/chat/ui/bottom-sheet-router/`)
4. Settings nav rows
5. Modal dismiss / confirm buttons
6. ... (see inventory)

## How tests get added going forward (UFR-021, proposed)

Per [`TESTING_DISCIPLINE_PROPOSAL.md`](TESTING_DISCIPLINE_PROPOSAL.md), every
new screen or major feature MUST ship with associated Maestro coverage OR an
explicit `// e2e-skip: <reason ≥ 30 chars>` justification in source code.
Enforced by `scripts/sentinels/screen-test-coverage.mjs` in pre-push +
sentinel-mirror CI gate.

## Maintenance

This file is regenerated end-of-session whenever new flows land. The
"Status" column is updated on every Maestro run. The "Last run" timestamp
should be filled by the runner (Phase 2 to-do : automate this via
`pnpm test:maestro:all` that updates the table).
