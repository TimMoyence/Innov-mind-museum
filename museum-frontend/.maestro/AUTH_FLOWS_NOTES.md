# Auth Maestro Flows — Notes for Maintainers

**Last update:** 2026-05-17
**Scope:** Companion notes for the `auth-*.yaml` Maestro flows under `museum-frontend/.maestro/`.

These flows extend AUTH coverage to e2e-validate every user-facing error
state. They are designed to run locally against the docker-compose backend
(`localhost:3000`) on the preview build (`com.musaium.mobile.preview`).

---

## 1. Flows shipped

| File | Tests | Requires backend seed |
|---|---|---|
| `auth-register-happy.yaml` | Full registration, accept GDPR, expect onboarding/home OR "email verification pending" | No (uses unique email per run) |
| `auth-register-password-breached.yaml` | Register with `password123` → expect `error.auth.password_breached` | No |
| `auth-register-duplicate-email.yaml` | Register with pre-existing email → expect `error.auth.email_already_taken` | **Yes** — `maestro+register-duplicate@local.dev` must exist |
| `auth-register-minor-dob.yaml` | Register with DOB `2015-01-01` → expect `error.auth.minor_parental_consent_required` | No |
| `auth-login-happy.yaml` | Login with smoke creds → expect home | **Yes** — `apple.test@apple.com` / `Apple1234!` (in `museum-frontend/.env`) |
| `auth-login-invalid-credentials.yaml` | Login with random wrong creds → expect `error.auth.invalid_credentials` | No |
| `auth-account-delete.yaml` | Login → Settings → Danger Zone → Delete → confirm → logout | **Yes** — see WARNING below |

---

## 2. Pre-run setup

### 2.1 Backend

```bash
cd museum-backend
docker compose -f docker-compose.dev.yml up -d
pnpm migration:run
pnpm dev
```

### 2.2 Seed accounts

The smoke account (`apple.test@apple.com` / `Apple1234!`) is already wired into
`museum-frontend/.env` (`TEST_EMAIL` / `TEST_PASSWORD`). Re-seed via:

```bash
cd museum-backend
pnpm seed:smoke-account
```

For the duplicate-email flow, seed a second account whose only purpose is to
exist so the registration conflict can fire:

```bash
cd museum-backend
pnpm seed:smoke-account -- \
  --email=maestro+register-duplicate@local.dev \
  --password=DuplicateSeed!2026X
```

For the account-delete flow (destructive — re-seed after every run!):

```bash
cd museum-backend
pnpm seed:smoke-account -- \
  --email=maestro+delete-$(date +%s)@local.dev \
  --password=DeleteMe!2026X
```

> **WARNING — `auth-account-delete.yaml` is destructive.** If you let it use
> the default `apple.test@apple.com` account, you will need to re-seed before
> running any other login flow. Always override `MAESTRO_DELETE_EMAIL` /
> `MAESTRO_DELETE_PASSWORD` env vars in CI / repeated local runs.

### 2.3 Env vars consumed by the flows

| Var | Default | Used by |
|---|---|---|
| `MAESTRO_RUN_ID` | `Date.now()` | All registration flows (unique-email generation) |
| `MAESTRO_LOGIN_EMAIL` | `apple.test@apple.com` | `auth-login-happy.yaml` |
| `MAESTRO_LOGIN_PASSWORD` | `Apple1234!` | `auth-login-happy.yaml` |
| `MAESTRO_DELETE_EMAIL` | `apple.test@apple.com` | `auth-account-delete.yaml` |
| `MAESTRO_DELETE_PASSWORD` | `Apple1234!` | `auth-account-delete.yaml` |

---

## 3. testIDs needed but MISSING — TODO list

These are testIDs that would have made flows more robust. We did **not** add
them ourselves (per task brief — read-only). They are filed here for the next
engineer to add.

| Priority | TestID to add | File:Line where it belongs | Reason |
|---|---|---|---|
| HIGH | `auth-mode-switch` | `museum-frontend/features/auth/ui/AuthModeSwitchButton.tsx:22` (`<LiquidButton>`) | We currently tap by visible text `"No account? Sign up\|Pas de compte ? S'inscrire"`. Breaks on copy edits. |
| HIGH | `register-firstname-input` | `museum-frontend/features/auth/ui/RegisterForm.tsx:66` (`<FormInput placeholder={t('auth.first_name')}>`) | Tapped by placeholder, FR/EN regex needed. Add `testID="register-firstname-input"` for parity with email/password/dob. |
| HIGH | `register-lastname-input` | `museum-frontend/features/auth/ui/RegisterForm.tsx:74` | Same as above. |
| HIGH | `gdpr-consent-checkbox` | `museum-frontend/features/auth/ui/GdprConsentCheckbox.tsx` (root pressable) | We currently match by `"I agree to the.*\|J'accepte les.*"`. The rich-text consent (with `<terms>`/`<privacy>` link spans) makes text matching fragile. |
| HIGH | `settings-delete-account-button` | `museum-frontend/features/settings/ui/SettingsDangerZone.tsx:27` (`<Pressable>`) | We tap by visible text `"Delete account\|Supprimer le compte"`. testID would survive translation. |
| MEDIUM | `settings-danger-zone-card` | `museum-frontend/features/settings/ui/SettingsDangerZone.tsx:22` (`<GlassCard>`) | Useful for scrolling target. |
| MEDIUM | `auth-error-state-description` | `museum-frontend/shared/ui/ErrorState.tsx:64` (`<Text>{description}`) | Currently we assert the description text by substring (`"data breaches\|fuites de données"`). A nested testID would make the assertion exact-match and faster. |
| LOW | `settings-back-to-home` | `museum-frontend/features/settings/ui/SettingsActionsCard.tsx` (or equivalent) | Used by `settings-flow.yaml` and would be useful here too. |

Also previously flagged by `docs/TEST_COVERAGE_INVENTORY.md` § 4.1:
- `register-submit` → already covered: existing `testID="auth-submit"` is shared by RegisterForm + LoginForm (Composer pattern). No action needed unless we want mode-specific IDs.
- `forgot-password-submit`, `auth-apple-button`, `auth-google-button`,
  `biometric-enable` — out of scope for these auth-error flows but still
  open per inventory.

---

## 4. Flows we could NOT auto-write

None — all seven requested flows are shipped.

The account-delete flow IS auto-written but has a hard prerequisite that the
maintainer must re-seed the test account after each run (since the test
account is destroyed). This is documented inline in the YAML header and in
§ 2.2 above.

---

## 5. Manual test recipes (fallback if a flow can't run)

### 5.1 auth-account-delete (if Alert handling breaks)

Some Maestro versions handle native `Alert.alert` dialogs unreliably on iOS
simulators. If `auth-account-delete.yaml` fails at Phase 4 (Alert confirmation),
run the recipe manually:

1. Boot fresh simulator + dev backend
2. Re-seed deletable account: `pnpm seed:smoke-account -- --email=maestro+delete-manual@local.dev --password=DeleteMe!2026X`
3. Launch app, log in with those creds
4. Tap "Settings" / "Réglages" → scroll to bottom
5. Verify "Danger zone" / "Zone de danger" card is visible with red border
6. Tap "Delete account" / "Supprimer le compte"
7. Expect native Alert: title = "Delete account", body mentions "permanently" / "définitivement"
8. Tap destructive "Delete" / "Supprimer" button
9. Expect spinner on the button (`ActivityIndicator`), then auto-navigation to auth screen
10. Verify "Welcome back" / "Bon retour" header is visible
11. Try logging back in with the same creds → expect `error.auth.invalid_credentials` (account is fully gone)

### 5.2 auth-register-happy (if backend rejects unique email regex)

If your local backend has stricter email regex than `*@local.dev`:

1. Edit the inputText in Phase 3 to use `@test.musaium.dev` (already
   whitelisted in existing flows like `auth-flow.yaml`)
2. Or override via runScript output

---

## 6. Locale-resilience pattern used

All assertions and text-based taps use a regex pattern matching **both EN and
FR** strings. Example:

```yaml
- assertVisible:
    text: "Welcome back|Bon retour"

- tapOn:
    text: "No account\\? Sign up|Pas de compte \\? S'inscrire"
```

Rationale: the FE i18n config (`shared/i18n/i18n.ts:28`) sets
`fallbackLng: 'en'`, and `I18nContext.tsx:39` detects device locale on first
launch. Simulators provisioned in either FR or EN can run the same flow.

When `testID` is available on the element, we always prefer it over text — see
`tapOn: { id: "email-input" }` etc. The text fallbacks are only used for
elements without testIDs (see § 3 TODO list).

---

## 7. CI integration

These flows are NOT yet wired into `ci-cd-mobile.yml`. To add them to the
nightly Maestro Android matrix, append the seven new file paths to
`museum-frontend/.maestro/shards.json` (and bump the sentinel cap per the
shard-manifest sentinel rule).

Manual local run:

```bash
cd museum-frontend
# Boot the simulator and dev build first, then:
maestro test .maestro/auth-register-happy.yaml
maestro test .maestro/auth-register-password-breached.yaml
maestro test .maestro/auth-register-duplicate-email.yaml
maestro test .maestro/auth-register-minor-dob.yaml
maestro test .maestro/auth-login-happy.yaml
maestro test .maestro/auth-login-invalid-credentials.yaml
maestro test .maestro/auth-account-delete.yaml    # destructive — see § 2.2
```

Or as a batch (with stop-on-failure disabled to capture all results):

```bash
maestro test --continuous .maestro/auth-*.yaml
```

---

## 8. Next phase suggestions

Beyond this auth-error coverage, the following flows are still ungaped per
`docs/TEST_COVERAGE_INVENTORY.md` § 4.2:

1. **Signup with invalid DOB format** — assert `auth-submit` button stays
   disabled (frontend-side guard in `RegisterForm.tsx:62`). No backend round-trip.
2. **Forgot password → email sent** — needs the `forgot-password-submit` testID
   first.
3. **Social login → Biometric setup** — needs `auth-apple-button` /
   `auth-google-button` testIDs first.
4. **Session timeout → Re-auth** — needs backend-side cooperation (force token
   expiry).
5. **Account-suspended / locked-out errors** — same template as duplicate-email
   but requires a backend-side state change (suspend account, exhaust login
   attempts).
