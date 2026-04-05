# Next Level Mobile Production and Test Runbook

## 1) Target Architecture (Mobile + Backend)
- Mobile app built with Expo/EAS using two release lanes:
  - `preview` -> staging backend
  - `production` -> production backend
- Backend split by environment on same VPS with isolated services and DBs:
  - `backend-staging` + staging DB
  - `backend` + production DB
- OTA managed with EAS Update channels:
  - `preview` channel
  - `production` channel

## 2) Environment Variables Matrix

### Frontend / EAS
| Variable | development | preview | production |
|---|---|---|---|
| `APP_VARIANT` | `development` | `preview` | `production` |
| `EXPO_PUBLIC_API_BASE_URL` | localhost | staging URL | production URL |
| `EXPO_PUBLIC_API_BASE_URL_STAGING` | optional | required | required |
| `EXPO_PUBLIC_API_BASE_URL_PROD` | optional | required | required |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | optional local | required CI | required CI |

### CI Secrets (mandatory)
- `EXPO_TOKEN`
- `EXPO_PUBLIC_API_BASE_URL_STAGING`
- `EXPO_PUBLIC_API_BASE_URL_PROD`
- `EXPO_PUBLIC_EAS_PROJECT_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_ID`
- `ASC_APP_ID`
- `APPLE_TEAM_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

### Backend
- `NODE_ENV` (`staging`/`production` policy using prod hardening when `production`)
- `CORS_ORIGINS` (mandatory in production)
- `JWT_SECRET`, `SESSION_SECRET`, `PGDATABASE` (mandatory in production)
- `SESS_USE_PG` (defaults to true in production)
- `APP_VERSION`, `COMMIT_SHA` (recommended for health observability)

## 3) Build Procedure (Internal + Production)

### Preview Internal Build
1. Ensure frontend/backend quality checks are green.
2. Trigger workflow `mobile-release` (PR or main push).
3. CI runs:
   - frontend lint/typecheck/tests
   - backend lint/tests
   - EAS build preview Android + iOS (`--no-wait`)
4. Install internal artifacts for QA (Android APK/AAB internal, iOS internal distribution/TestFlight internal).

### Production Build
1. Create a version tag (`vX.Y.Z`).
2. Triggered workflow builds production Android + iOS with `production` profile.
3. `submit-production` job submits latest artifacts to stores (environment-gated).

## 4) OTA Procedure (EAS Update)
- Runtime compatibility uses `runtimeVersion: { policy: 'appVersion' }`.
- Rules:
  - Publish preview OTA only to `preview` channel.
  - Publish production OTA only to `production` channel.
  - Never publish OTA across different app versions when runtime differs.
- Suggested commands:
  - `eas update --branch preview --message "..."`
  - `eas update --branch production --message "..."`

## 5) Pre-Release QA Checklist
- Functional:
  - Login/register/logout
  - Start chat, send text/image, close empty chat, list sessions
  - Settings: switch backend env + health test
- Security:
  - Non-dev builds reject localhost backend URLs
  - CORS restricted in production
  - Auth-required routes reject anonymous access
- Performance:
  - Chat round-trip latency within target budget
  - No UI freeze during image upload
- Observability:
  - `GET /api/health` returns `environment`, `version`, optional `commitSha`
  - Backend logs include request correlation IDs

## 6) Rollback Plan (Mobile + Backend)
- Mobile:
  1. Stop rollout in store console
  2. Promote previous stable build
  3. If issue is JS-only and runtime-compatible, publish rollback OTA on same channel
- Backend:
  1. Re-deploy previous backend image tag
  2. Restore previous env snapshot if needed
  3. Validate `/api/health` and smoke critical endpoints

## 7) Backend Connectivity Test from App
1. Open Settings.
2. Select backend environment (`staging`, `production`, or `custom`).
3. For custom mode, enter base URL.
4. Tap `Tester la connexion backend`.
5. Success criteria:
   - HTTP 200
   - visible env/version in status

## 8) Go / No-Go Criteria
Go only if all are true:
- Frontend and backend quality jobs green.
- Preview smoke tests passed on Android + iOS.
- Health endpoint stable on target backend environment.
- Store metadata/signing/secrets validated.
- Rollback owner and rollback version identified.

No-Go if one of these occurs:
- Failing quality gate
- Runtime/API mismatch
- Missing critical secret
- Health degraded or DB check down

## Operational Notes
- External “subagent” audits are currently blocked until one provider is configured:
  - install `@anthropic-ai/claude-agent-sdk`, or
  - set `OPENROUTER_API_KEY`.
- Until then, use the internal fallback review process and keep this runbook as source of truth.
