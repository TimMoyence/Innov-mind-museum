# Sprint Execution Report — 2026-04-05

## Baseline (from audit 2026-04-04)
- Score global: 7.7/10
- Backend: 2294 tests, 0 tsc errors, 0 eslint-disable, 0 as-any
- Frontend: 1042 tests, 0 tsc errors
- 4 HIGH actions + 6 MEDIUM actions identified

## Executed Sprints

### Sprint 1: LangChain CVE + Dependency Upgrade
**Status: DONE**
- Upgraded `@langchain/core` 1.1.36 → 1.1.39
- Upgraded `@langchain/openai` 1.3.1 → 1.4.2
- Added pnpm overrides: `handlebars >=4.7.9`, `picomatch >=2.3.2`, `brace-expansion 1.1.13`
- **Result: 0 vulnerabilities in `pnpm audit`** (was 4: 1 critical, 2 high, 1 moderate)
- CVE-2025-68665 assessment: LOW RISK — project only uses invoke()/stream(), no serialization
- Tests: 2294 pass, coverage stable

### Sprint 2: Supply Chain Security in CI (OWASP A03)
**Status: DONE**
- `ci-cd-backend.yml`: removed `continue-on-error: true` on audit, changed `--audit-level=critical` → `--audit-level=high`
- Added CycloneDX SBOM generation + artifact upload (90-day retention)
- `ci-cd-web.yml`: added `pnpm audit --audit-level=high` (was missing entirely)
- `ci-cd-mobile.yml`: upgraded `--audit-level=critical` → `--audit-level=high`
- **Result: all 3 CI pipelines now block on HIGH+ vulnerabilities**

### Sprint 3: Track Gitignored Ops Docs (Bus Factor)
**Status: DONE**
- Added 14 whitelist entries to `.gitignore` for operational docs
- Root docs now tracked: RUNBOOK.md, DB_BACKUP_RESTORE.md, DEPLOYMENT_STEP_BY_STEP.md, UPTIME_MONITORING.md, SOCIAL_AUTH_SETUP.md + walk/ + superpowers/
- Frontend docs now tracked: ARCHITECTURE_MAP.md, QUALITY_GUIDE.md, DEPLOYMENT.md, NEXT_LEVEL_MOBILE_PRODUCTION_AND_TEST.md
- **Result: git clone on any machine gets all operational docs**

### Sprint 4: Fix CLAUDE.md CI Section
**Status: DONE**
- Replaced 5 incorrect workflow names with 6 actual workflows
- Added descriptions for each: quality gates, E2E, deploy targets, Lighthouse, Maestro, Semgrep
- **Result: CLAUDE.md CI section now matches reality**

### Sprint 5: Dead Code Cleanup
**Status: DONE**
- Deleted `museum-frontend/app/styles/cameraStyles.ts` (0 imports)
- Removed dead export `getUserMemoryService` from `chat/index.ts`
- Fixed 2 DRY factory violations: replaced local `makeMessage()` in `chat-message-service.test.ts` and `chat-media.service.test.ts` with shared import from `tests/helpers/chat/message.fixtures.ts`
- Cleaned up unused imports (`ChatMessage` type, `MESSAGE_ID` constant)
- **Result: 0 dead files, 0 dead exports, 0 factory violations**

### Sprint 6: Replace 10 Inline 401s with AppError
**Status: DONE**
- Replaced all `res.status(401).json(...)` in:
  - `authenticated.middleware.ts` (5 instances)
  - `apiKey.middleware.ts` (1 via `sendUnauthorized` → now throws)
  - `chat-media.route.ts` (2 instances)
  - `chat-session.route.ts` (1 instance)
  - `auth.route.ts` (1 instance)
- Updated middleware tests to verify `throw AppError` instead of `res.status(401)`
- Added `unauthorized()` factory helper in middleware files
- **Result: all 401s now flow through centralized error handler → consistent observability**

### Sprint 7: Expo 53 → 55 Upgrade
**Status: DONE**
- Expo SDK: 53.0.27 → 55.0.11
- React Native: 0.79.6 → 0.83.4
- React: 19.0.0 → 19.2.0
- Migrated `expo-av` → `expo-audio` (recording + playback)
- Migrated `expo-file-system` → `expo-file-system/legacy` (2 files)
- Removed `newArchEnabled: true` from app.config.ts (always on in SDK 55)
- Added plugins: expo-font, expo-localization, expo-secure-store, expo-audio
- Added `react-native-worklets` dependency
- Created Jest mocks for `react-native-reanimated` and `react-native-worklets`
- Updated `react-test-renderer` 19.0.0 → 19.2.0
- Rewrote `useAudioRecorder` and `useTextToSpeech` hooks + all tests
- Fixed `imageUploadOptimization.ts` (`{ size: true }` option removed)
- **Result: 1044 FE tests pass (was 1042), 0 tsc errors, 0 ESLint errors**

## Final Metrics

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Backend tests | 2294 | 2294 | = |
| Frontend tests | 1042 | 1044 | +2 |
| pnpm audit vulns | 4 (1C/2H/1M) | 0 | -4 |
| CI audit blocking | 0/3 pipelines | 3/3 | +3 |
| Dead files | 1 | 0 | -1 |
| Dead exports | 1 | 0 | -1 |
| Factory violations | 2 | 0 | -2 |
| Inline 401 anti-patterns | 10 | 0 | -10 |
| Gitignored ops docs | 9 | 0 | -9 |
| CLAUDE.md CI errors | 5 wrong names | 0 | -5 |
| Expo SDK | 53 | 55 | +2 major |
| React Native | 0.79 | 0.83 | +4 minor |
| tsc errors | 0 | 0 | = |
| ESLint errors | 0 | 0 | = |

## What Remains

1. **expo-file-system full migration** — currently using `expo-file-system/legacy` bridge (2 files). Migrate to new `File`/`Directory` API when stable.
2. **16 deprecation warnings** in frontend lint — `SafeAreaView`, `absoluteFillObject`, `expo-image-manipulator` legacy API. Non-blocking.
3. **TypeORM monitoring** — v1.0 H1 2026 with breaking changes. Watch releases.
4. **PROGRESS_TRACKER.md sync** — 37 commits behind (low priority).
5. **EAS build validation** — native build must be tested on device (Expo 55 changes native modules).
