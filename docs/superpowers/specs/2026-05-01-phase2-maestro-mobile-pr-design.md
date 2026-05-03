# Phase 2 — Maestro Mobile E2E on PR (Design Spec)

- **Status**: Proposed (2026-05-01)
- **Owner**: QA/SDET
- **Scope**: museum-frontend + `.github/workflows/ci-cd-mobile.yml` + helper scripts
- **Pre-req for**: nothing (independent of Phases 3–8)
- **Estimated effort**: 1 working week
- **Spec lineage**: builds on `project_v3_decisions` memory (mobile e2e URGENT) + Phase 0 ADR-012

## 1. Problem Statement

`museum-frontend/.maestro/` contains 11 e2e flows covering auth, chat, museum-search, settings, support, navigation, onboarding. The CI workflow `ci-cd-mobile.yml` already declares a `maestro-e2e` job, but the job is gated by `if: github.event_name == 'workflow_dispatch'` — flows never run on PRs and have not run automatically since they were authored.

Memory marker `project_v3_decisions` flags mobile e2e as **URGENT**. Real-device regression risk on auth, chat, and museum-search is currently uncovered between merges.

Phase 2 wires a real Android emulator + Maestro pipeline into PR CI:
1. Each PR that touches `museum-frontend/**` (or backend OpenAPI changes that affect the generated mobile API types) runs the full 11-flow Maestro suite, sharded 4 ways for ~5min wall clock.
2. iOS nightly cron catches platform divergence without paying the iOS runner premium per PR.
3. The build artifact is cached against a content-hash of mobile source paths so unrelated PRs (e.g., backend-only changes that just bump the OpenAPI spec) skip the 12-minute Expo prebuild.

## 2. Goals

1. Self-hosted Maestro runner on `macos-latest` GH-hosted (not Maestro Cloud — user decision Q1=B).
2. Cached EAS preview build artifact keyed on the SHA of `museum-frontend/{src,features,shared,app,assets,app.config.ts,package.json,package-lock.json}`. Cache hit → reuse. Cache miss → run Expo prebuild + Gradle assembleDebug, store under the cache key.
3. PR workflow runs all 11 flows, sharded 4 ways across 4 macos-runner replicas. Wall clock ≤ 10 min per PR; cost ~$3–4 per PR.
4. iOS Maestro suite runs nightly via cron (full 11 flows on a single macos runner). Failures notify but do not block PRs.
5. Backend booted via `docker-compose -f docker-compose.dev.yml up -d` on the same runner, so flows hit `http://localhost:3000`. (User decision Q4=y; staging-environment integration deferred to V2.)
6. New helper scripts (`museum-frontend/scripts/maestro-runner-setup.sh`, `museum-frontend/scripts/maestro-run-shard.sh`) so the workflow YAML stays thin.
7. A flow-shard manifest at `museum-frontend/.maestro/shards.json` makes the 4-way split deterministic + auditable.
8. A sentinel that fails CI when a new `.maestro/*.yaml` flow lands without an entry in the shard manifest (prevents silent flow drift).

## 3. Non-Goals

- **Maestro Cloud integration** — current `maestro-e2e` job uses cloud action; Phase 2 replaces that with self-hosted Maestro CLI on the runner.
- **iOS PR coverage** — iOS runs nightly only.
- **Public-staging integration** — backend stays on the runner for Phase 2; V2 will swap to public staging.
- **Maestro flow authoring** — Phase 2 wires existing flows; no new flow content.
- **Mobile coverage threshold** — Phase 8.

## 4. Architecture

### 4.1 Runner setup flow

For each Maestro shard runner (PR triggers 4 in parallel via matrix):

```
1. Checkout repo
2. Setup Node 22 + pnpm 10
3. (Cache miss only) Install backend deps + run TypeORM migrations against ephemeral PG container
4. Start docker-compose (Postgres on 5433 + backend on 3000) — wait for /api/health
5. (Cache hit) Restore cached EAS preview APK from a runner-side cache directory
   (Cache miss) Build EAS preview locally:
     - npm install
     - npx expo prebuild --platform android --clean
     - cd android && ./gradlew assembleDebug
     - Store APK + cache marker under hashFiles('museum-frontend/{src,features,shared,app,assets,app.config.ts,package.json,package-lock.json}')
6. Install Maestro CLI (mobile-dev-inc install script, version pinned)
7. Start Android emulator (reactivecircus/android-emulator-runner action)
8. Install APK on emulator
9. Run shard's flow subset via maestro test
10. Upload Maestro logs + screenshots as GH artifact
11. Tear down emulator + docker-compose
```

Step 5 (build vs cache) is the critical path. Steps 1–4 + 6–11 run regardless.

### 4.2 Shard manifest format

`museum-frontend/.maestro/shards.json`:

```json
{
  "shards": [
    {
      "name": "auth",
      "flows": ["auth-flow.yaml", "auth-persistence.yaml", "onboarding-flow.yaml"]
    },
    {
      "name": "chat",
      "flows": ["chat-flow.yaml", "chat-history-pagination.yaml", "museum-chat-flow.yaml"]
    },
    {
      "name": "museum",
      "flows": ["museum-search-geo.yaml", "navigation-flow.yaml"]
    },
    {
      "name": "settings",
      "flows": ["settings-flow.yaml", "settings-locale-switch.yaml", "support-ticket-create.yaml"]
    }
  ],
  "iosNightly": "all"
}
```

The 4 shards are roughly time-balanced (~3 flows each, ~3 min wall clock per shard).

The `iosNightly: "all"` field declares iOS runs the full set in one go.

A new flow `.yaml` file under `.maestro/` MUST be added to one shard before merge — enforced by the sentinel in §4.5.

### 4.3 Cache key & content hashing

GitHub Actions cache key:

```yaml
key: maestro-apk-${{ runner.os }}-${{ hashFiles('museum-frontend/src/**', 'museum-frontend/features/**', 'museum-frontend/shared/**', 'museum-frontend/app/**', 'museum-frontend/assets/**', 'museum-frontend/app.config.ts', 'museum-frontend/package.json', 'museum-frontend/package-lock.json') }}
restore-keys: maestro-apk-${{ runner.os }}-
```

Cached path: `museum-frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

A backend-only PR (no mobile path changes) → cache hit → skip Expo prebuild + Gradle build. Saves ~12 min per shard × 4 shards = 48 macos-runner-minutes per PR.

A mobile-source PR → cache miss → full build runs once (could parallelise the build across shards but 4×12min builds redundantly is wasteful). Solution: a single `prebuild` job runs the build once, uploads the APK as a workflow artifact, and the 4 maestro shards download it. See §4.4.

### 4.4 Workflow job graph

```
quality (existing — runs lint + tsc + jest, ubuntu-latest, ~5min)
  │
  └── prebuild (new, macos-latest, conditional)
        │ skip if cache hit on the mobile-path hash
        │ otherwise build APK + upload as workflow artifact "preview-apk"
        │
        └── maestro-shard (matrix 4-way, macos-latest)
              │ download "preview-apk" artifact (or read from runner cache if same job)
              │ start docker-compose backend
              │ start emulator, install APK, run shard's flows
              │
              └── (after all 4 shards) maestro-summary
                    │ aggregate shard logs, post a single PR comment with pass/fail
```

The `quality` job already exists and is unchanged.

The `prebuild` job is new. It uses `actions/cache` to short-circuit when the mobile content hash hasn't changed — in cache-hit case the job uploads the cached APK as the workflow artifact for downstream shards.

The `maestro-shard` matrix replaces the existing `maestro-e2e` job. The cloud action is removed.

The `maestro-summary` job (final aggregator) downloads each shard's logs/screenshots and posts a PR comment via `actions/github-script`.

### 4.5 Shard-manifest sentinel

`scripts/sentinels/maestro-shard-manifest.mjs`:

Walks `museum-frontend/.maestro/*.yaml` (excluding `config.yaml` and `helpers/`), reads `.maestro/shards.json`, asserts every flow file appears in exactly one shard. Exit non-zero if any flow is missing or duplicated.

Wired into the `quality` job (right after the existing `Check no unicode emoji in screens/copy` step):

```yaml
- name: Maestro shard-manifest sentinel
  run: node scripts/sentinels/maestro-shard-manifest.mjs
  working-directory: ${{ github.workspace }}
```

### 4.6 iOS nightly cron

A new top-level workflow trigger:

```yaml
schedule:
  - cron: '17 3 * * *'   # 03:17 UTC nightly
```

Already declared at workflow level. A new `maestro-ios-nightly` job:

```yaml
maestro-ios-nightly:
  if: github.event_name == 'schedule'
  needs: prebuild
  runs-on: macos-latest
  timeout-minutes: 60
  ...
```

Same harness as Android shards, but:
- Builds iOS preview (`expo prebuild --platform ios && xcodebuild ...`) instead of Android APK.
- Boots iOS simulator via `xcrun simctl`.
- Runs the full 11 flows sequentially (no sharding — nightly job has time budget).

### 4.7 Helper scripts

To keep workflow YAML thin, two helper scripts at `museum-frontend/scripts/`:

**`maestro-runner-setup.sh`** — handles backend boot + emulator boot + APK install. Inputs:
- `$1` = path to APK
- `$2` = platform (android | ios)

Behaviour: starts docker-compose, waits for `/api/health` (60s timeout), starts emulator (Android) or simulator (iOS), installs APK, returns 0.

**`maestro-run-shard.sh`** — runs the flows for a given shard. Inputs:
- `$1` = shard name (auth | chat | museum | settings | all)

Reads `.maestro/shards.json`, iterates the listed flows, runs `maestro test <flow>` per flow, captures logs to `.maestro/logs/<shard>-<flow>.log`. Exits non-zero on first failure.

Tests:
- Both scripts are bash, lint-checked via `shellcheck` in CI.
- The shard-runner script has a unit-y test in `museum-frontend/scripts/__tests__/maestro-run-shard.test.sh` that uses bats-core to verify shard parsing logic.

### 4.8 Open question: Maestro CLI version pinning

Maestro releases break compat across minor versions. Pin via `MAESTRO_VERSION` env var in the workflow + a one-line check that the installed CLI matches the pinned version. Maestro CLI version chosen: latest stable as of 2026-05-01 (verify in plan task at install time).

## 5. Security Considerations

- The `docker-compose.dev.yml` backend uses default test secrets — fine for ephemeral runners.
- Maestro logs may include user input (registration emails, etc.) — already use synthetic `e2e-${timestamp}@test.musaium.dev` patterns. Verify all flows. No PII.
- Artifact retention: 7 days for logs/screenshots (default), 1 day for APK (storage cost).
- No secrets in flows — `MAESTRO_CLOUD_API_KEY` is no longer needed (self-hosted). Remove from secrets if no longer used elsewhere.

## 6. Testing & Verification

### 6.1 Acceptance criteria

Phase 2 is **done** when ALL of the following hold:

- [ ] `museum-frontend/.maestro/shards.json` exists with 4 shards covering all 11 flows.
- [ ] `scripts/sentinels/maestro-shard-manifest.mjs` exists and exits 0 on the current state.
- [ ] `museum-frontend/scripts/maestro-runner-setup.sh` + `museum-frontend/scripts/maestro-run-shard.sh` exist and are exec-bit + shellcheck-clean.
- [ ] `.github/workflows/ci-cd-mobile.yml` declares `prebuild`, `maestro-shard` (matrix 4-way), `maestro-summary`, `maestro-ios-nightly` jobs.
- [ ] PR build with mobile changes: `prebuild` runs, APK uploaded, 4 shards run in parallel, `maestro-summary` posts a PR comment with pass/fail per shard.
- [ ] PR build with NO mobile changes: cache hit, prebuild short-circuits, total Maestro time ≤ 7 min.
- [ ] iOS nightly cron triggers a single `maestro-ios-nightly` run with the full 11-flow set.
- [ ] Existing `maestro-e2e` job (Maestro Cloud) is deleted.
- [ ] `MAESTRO_CLOUD_API_KEY` removed from workflow + documented for cleanup in repo secrets.
- [ ] Shard sentinel fires when a synthetic flow file added under `.maestro/` without a shard manifest entry.
- [ ] No regression in `quality` job runtime.

### 6.2 Test discipline

- Helper scripts: `bats-core` tests for `maestro-run-shard.sh` shard parsing.
- Sentinel: a unit test in Jest under `museum-frontend/__tests__/sentinels/maestro-shard-manifest.test.ts` that synthesises a temp `.maestro/` + `shards.json` and asserts the sentinel's exit code on valid + invalid inputs.
- Workflow YAML: validate via `actionlint` (CI step) + `js-yaml.load` smoke test in plan.
- End-to-end: a synthetic PR that touches `museum-frontend/features/auth/login.tsx` to force cache miss → all 4 shards run → PR comment lands.

## 7. Risks & Mitigations

### Risk: macos-latest runner cost balloons

4 shards × ~10 min × $0.08/min = ~$3.20/PR. At 20 PRs/day = ~$64/day = ~$1900/month.

**Mitigation:** Q2 cache hit reduces 80% of PRs to ~3 min × $0.08 = ~$0.24/PR. Cost concentrates on the 20% of PRs touching mobile code. Monitor via GitHub Actions billing dashboard for first 2 weeks; if monthly cost > $1500, fall back to 2-shard split (Q3=c becomes 2 shards × ~6 min wall clock).

### Risk: Maestro flake on emulator timing

Emulator boot is non-deterministic; slow runners can cause `waitForAnimationToEnd` timeouts.

**Mitigation:** All flows already use `waitForAnimationToEnd` consistently. Set Maestro retry to 2 per flow at the runner level. If flake rate > 5%, escalate to per-flow retry tuning. Track flake rate via the `maestro-summary` job's PR comment.

### Risk: APK cache key drift

A change to a non-listed mobile path (e.g., `museum-frontend/.maestro/`) doesn't bust the cache, leaving stale APK behaviour.

**Mitigation:** The cache key only depends on app source paths, not test paths. Stale cache for a flow-only change is correct (no rebuild needed). The risk is the inverse — adding a new app source directory not in the hash list. Audit the path list in the plan; adding new src dirs requires updating the cache key.

### Risk: docker-compose health check times out on the runner

Cold start of Postgres + backend may exceed the 60s timeout on a slow `macos-latest`.

**Mitigation:** Increase timeout to 120s. If still flaky, split into a longer-lived backend service via GH Actions `services:` block running Postgres directly (skip docker-compose).

### Risk: iOS nightly is silently broken because nobody monitors it

Cron runs at 03:17 UTC; failures don't block PRs.

**Mitigation:** Add a Slack/email notification on iOS nightly failure (out of scope for Phase 2 but tracked as Phase 5 follow-up — auth/social-login coverage gaps need the same notification channel).

### Risk: Existing `maestro-e2e` job (Maestro Cloud) deletion breaks an unrelated workflow

The `MAESTRO_CLOUD_API_KEY` may be used by other workflows.

**Mitigation:** Plan task does `grep -r MAESTRO_CLOUD .github/workflows/` first; only deletes if no other workflow references it.

## 8. Dependencies

- `mobile-dev-inc/maestro` install script (CLI)
- `reactivecircus/android-emulator-runner@v2` GH Action
- `actions/cache@v4` for APK cache
- `actions/upload-artifact@v4` + `actions/download-artifact@v4` for cross-job APK transfer
- `actions/github-script@v7` for PR comment in `maestro-summary`
- `actionlint` (binary in workflow setup step) for YAML validation
- `bats-core` for shell-script tests (npm dev dep in `museum-frontend/`)

All version-pinned in the plan.

## 9. Phase 2 Commit Decomposition

4 commits, sequenced for revertibility:

1. **Commit A** — Shard manifest + sentinel + helper scripts (no workflow changes yet).
2. **Commit B** — `prebuild` + `maestro-shard` matrix + `maestro-summary` jobs in `ci-cd-mobile.yml`. Delete the old `maestro-e2e` cloud job. PR-triggered Android Maestro suite goes live.
3. **Commit C** — iOS nightly cron job (`maestro-ios-nightly`).
4. **Commit D** — Cleanup: remove `MAESTRO_CLOUD_API_KEY` (if unused elsewhere), update CLAUDE.md mobile e2e section to reflect new flow.

## 10. Resolved decisions (2026-05-01)

- **Q1 = B** (self-hosted on `macos-latest` GH runners — flows run locally, not on Maestro Cloud).
- **Q2 = ii** (cached APK keyed on mobile-source content hash).
- **Q3 = c** (full suite, 4-shard parallel matrix).
- **Q4 = y** (docker-compose backend on the runner — public staging integration deferred to V2).
- **Q5 = α** (Android-only on PR; iOS nightly cron).

No remaining open questions. Ready for plan generation.
