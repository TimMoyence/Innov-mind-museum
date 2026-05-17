# Testing Phase 2 — expansion plan (post-2026-05-17)

Generated 2026-05-17. Companion to `TEST_COVERAGE_INVENTORY.md` (full surface
map) and `TESTING_DISCIPLINE_PROPOSAL.md` (automation rule UFR-021).

## What landed tonight (Phase 1, 2026-05-17 evening session)

- **API smoke runner** — `pnpm smoke:api`, 13 scenarios, all green. Covers
  every auth/onboarding error code that the FE consumes via `getErrorMessage`.
  Self-cleans accounts. Includes Redis rate-limit + auth-lockout bucket reset
  + DB email_verified flip (scoped to `smoke+<runtag>-*@local.dev`).
- **Migration sync sentinel** — `pnpm dev:migration-check` + wired into
  `dev:stack` step 3.5. Prevents schema-drift incidents like the `User.tier`
  500 chain. Interactive "apply now?" prompt on pending.
- **Maestro AUTH coverage** — see `museum-frontend/.maestro/auth-*.yaml`
  (extended in commit `<COMMIT_HASH>`). Covers register happy, register
  PASSWORD_BREACHED, register CONFLICT, register MINOR_PARENTAL_CONSENT,
  login happy, login INVALID_CREDENTIALS, account deletion.
- **Maestro ONBOARDING + NAV coverage** — see
  `museum-frontend/.maestro/{onboarding,nav}-*.yaml`. Skip-anonymous
  (regression guard for the `markOnboardingComplete failed Error:
  Authentication required` we just fixed), full carousel, tab roundtrip,
  stack deep links.
- **UFR-021 proposal** — `docs/TESTING_DISCIPLINE_PROPOSAL.md`. Ready to
  implement in Phase 3. Includes sentinel script spec + pre-push hook +
  PR template + CI gate.

## Phase 2 areas (tomorrow morning, 2026-05-18)

Coverage gaps NOT yet addressed. Listed by impact × effort. Dispatch each
as a fresh agent following the same pattern as tonight's writer agents.

### Tier 1 — Critical user paths (~3-4h, 4 parallel agents)

| Area | Existing maestro | Gaps | Effort |
|---|---|---|---|
| **Chat session** (`app/(stack)/chat/[sessionId].tsx`) | `museum-chat-flow.yaml`, `chat-flow.yaml`, `chat-history-pagination.yaml`, `audio-recording-flow.yaml` | Add: regenerate response, image upload + AI identify, error states (network down, rate-limited, guardrail blocked) | 60 min |
| **Discover / Map** (`app/(tabs)/discover.tsx`) | None | Map renders, search by city, museum pin tap → museum-detail, geolocation permission flow (granted + denied paths) | 60 min |
| **Settings** (`app/(stack)/settings.tsx`) | `settings-flow.yaml` (partial) | Add: language switch (verify FR/EN swap), theme toggle, biometric enroll/disable, notification preferences, data mode toggle, account deletion confirm dialog | 60 min |
| **Camera capture** (cartel scanner inside chat) | None | Permission request flow, capture → preview → confirm → AI response, retry from preview, deny permission path | 60 min |

### Tier 2 — Subscription/paywall (~2h, 1-2 agents)

| Area | Existing | Gaps |
|---|---|---|
| **Paywall** (`features/paywall/ui/QuotaUpsellModal.tsx`) | `paywall-quota-exhaustion.yaml` | Add: subscribe happy, restore purchases, cancel flow, error states (IAP unavailable) |
| **Carnet** (`app/(tabs)/carnet.tsx`) | None | List loads, swipe-delete, empty state, sync after offline |

### Tier 3 — Support / legal / secondary (~1h, low-pri)

| Area | Existing | Gaps |
|---|---|---|
| Support ticket creation | None | Create ticket form validation, file upload, ticket-detail view |
| Privacy / Terms / About | None | Renders + scrolls + back nav works |
| Forgot password | None | Email submit → success message → token-link handled |
| Change email | None | Submit → email verification flow |
| Change password | None | Old + new + confirm with breach check |
| MFA enroll / disable | None | TOTP enrollment, verification, recovery codes |
| Social login | None | Apple sign-in (Maestro `extendedWaitUntil` for OS modal), Google (likely defer — needs sandbox creds) |

### Tier 4 — Visual regression (deferred decision)

Maestro supports screenshot capture (`takeScreenshot`). Could pair with a
baseline-diff tool (e.g. pixelmatch, jimp) to catch visual regressions on
key screens. Out of scope for tomorrow; revisit after Tier 1-3 stabilize.

## Cross-cutting work alongside Phase 2

### testID audit + adds (~1-2h, 1 agent)

Per `TEST_COVERAGE_INVENTORY.md` Section 4, ~10 critical interactive
elements lack `testID`. Sample list:
- `register-submit` (S'inscrire button — the one that just bit us)
- Tab bar items in `app/(tabs)/_layout.tsx` (`tab-home`, `tab-discover`, etc.)
- Bottom-sheet route buttons in `features/chat/ui/bottom-sheet-router/`
- Settings nav rows
- Modal dismiss / confirm buttons

Adding testIDs is mechanical but should be a single coordinated commit so
all Maestro flows can rely on them. Block the Phase 2 writers on this.

### Backend smoke expansion (~1h)

Extend `scripts/smoke-api.mjs` with new scenarios:
- Forgot password → reset → login
- Change email → verify → me reflects new email
- Change password → re-login with new
- POST chat message (happy + breached input + rate-limited)
- POST chat image (multipart upload)
- DELETE chat session
- Support ticket CRUD
- GDPR export (GET /me/export → 200 + tarball)

### CI wiring (~30 min)

`smoke:api` should run on every PR (in `ci-cd-backend.yml`) AGAINST a
freshly-migrated ephemeral test DB. Maestro flows already shard-run on
Android matrix per `ci-cd-mobile.yml` — add the auth flows there too.

### UFR-021 implementation (~2h)

Per `docs/TESTING_DISCIPLINE_PROPOSAL.md`, implement:
1. `scripts/sentinels/screen-test-coverage.mjs` (spec ready in proposal §3)
2. Add to `.husky/pre-push` as Gate 19
3. Add UFR-021 block to `CLAUDE.md` + JSON entry to
   `.claude/agents/shared/user-feedback-rules.json`
4. Add PR template checkbox
5. CI gate in `ci-cd-mobile.yml`

## Total effort estimate

| Tier | Effort | Parallelizable? |
|---|---|---|
| Tier 1 (chat, discover, settings, camera) | 4h | Yes, 4 agents |
| Tier 2 (paywall, carnet) | 2h | Yes, 2 agents |
| Tier 3 (support, legal, etc.) | 1h | Yes, 1-2 agents |
| testID audit + adds | 1-2h | No, single commit |
| Backend smoke expansion | 1h | Solo |
| CI wiring | 30 min | Solo |
| UFR-021 implementation | 2h | Solo |

**With 4-5 parallel agents : 6-8h wall-clock for full Phase 2 + UFR-021.**

Realistic for one focused morning if dispatching is tight.

## Hard requirements before marking Phase 2 complete

- [ ] `pnpm smoke:api` green (extended)
- [ ] `pnpm test:e2e:auth` (Maestro auth suite) green on iOS Simulator
- [ ] `pnpm test:e2e:nav` (Maestro nav suite) green on iOS Simulator
- [ ] `pnpm test:e2e:chat` (Maestro chat suite) green on iOS Simulator
- [ ] `pnpm sentinel:screen-coverage` green (per UFR-021)
- [ ] `.husky/pre-push` runs sentinel + smoke before push
- [ ] PR template updated
- [ ] `docs/TEST_INDEX.md` lists every flow with status
- [ ] CLAUDE.md has UFR-021 block

## Anti-goals (do NOT do)

- Don't write tests for derived/private helpers (already unit-tested in Jest)
- Don't try to test third-party native modules (Sentry init, Sentry capture,
  expo-camera permission dialog — those are integration tests for those libs)
- Don't write flaky tests (no `sleep`, prefer `extendedWaitUntil` with
  reasonable timeouts)
- Don't pin to text matchers when testID exists — text breaks on i18n switch
- Don't introduce new test framework — Maestro for e2e + Jest for unit is
  the line. No Detox, no Appium, no Cypress.
