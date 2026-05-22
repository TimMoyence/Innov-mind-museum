---
runId: 2026-05-21-connectivity-offline-first
mode: standard
pipeline: enterprise
completedAt: 2026-05-21T10:25:00.000Z
durationMs: 37500000
correctiveLoops: 0
costUSD: 0
tags:
  - standard
  - enterprise
---

# Lesson — 2026-05-21-connectivity-offline-first

## Trigger

_no data captured_

## What worked

- gates run: lint, tsc, tests, gitnexus_detect_changes
- verdict: PASS / WARN / FAIL
- failures: ...
- corrective loops used: 0 / 1 / 2 (cap)

- INTEGRITY: working tree contains concurrent WIP from another session (NOT this cycle): MFA enroll (MfaEnrollScreen, mfa-enroll.tsx, mfa.factories.ts, mfa-enroll-flow.yaml), authTokenStore keychain, lib-docs/expo-screen-capture/, package.json/lock, factories/index.ts (makeMfaEnrollResult). mtimes 09:04 = within session window. Green editor mislabeled these "pre-existing before my session" (timestamp-contradicted) BUT correctly never touched them + excluded from its 15-file set.
- ENTANGLEMENT: shards.json carries BOTH mfa-enroll-flow.yaml (auth shard, not mine) AND connectivity-offline-banner.yaml (chat shard, mine). factories/index.ts = MFA only. → finalize MUST selective-commit only connectivity files; shards.json needs careful handling; surface to user.

## What failed

- spec ↔ implementation alignment: ...
- KISS / DRY / hexagonal compliance: ...
- verdict: PASS / WARN / FAIL
- comments: ...

- spec ↔ implementation parity: R1 PASS, R2 PASS, R3 PASS, R4 PASS, R5 PASS, R6 PASS, R7 PASS, R8 **GAP**, R9 PASS, R10 **GAP**, R11 PASS, R12 PASS, R13 **GAP**.
- KISS / DRY / hexagonal: PASS — single pure predicate `isOnline`, one bridge, 5 consumers routed through it; zero residual `!isConnected`/`?? true` in connectivity dir. Run's DRY goal met at the predicate layer.
- Frozen-test integrity: PASS — all 8 manifest sha256 byte-identical at HEAD.
- Lib-docs compliance: PASS — netinfo:142/173/134/181, react-query:174/181/191/84/263, zustand:91/89/132 all resolve + accurately back the impl decisions.
- Deviations cross-check (UFR-014): PASS — 2 declared (impl formula `isConnected!==false` matches frozen truth table {null,null}→true vs design prose `===true`; bridge idempotency), both honest. 0 undeclared.
- a11y / design-system tokens / security grep / string-guard: all PASS (no hex/px/rgb, no eval/innerHTML/env-leak, no new emoji, banner keeps accessibilityRole/Label + testID).
- BLOCKERS (4):
  1. `app/_layout.tsx` — `GlobalOfflineBannerHost` NEVER mounted (defined + isolation-tested only). Chat-local banner removed → banner renders on ZERO screens. Net regression. R8/R10/UFR-021.
  2. `.maestro/shards.json` — `connectivity-offline-banner.yaml` unregistered; `maestro-shard-manifest.mjs` exits 1 (verified) = CI blocker. T3.2 unmet.
  3. `__tests__/infrastructure/connectivity.test.tsx` — 4 pre-existing tests regress on the new tri-state contract (R13). Not frozen → editable in green.
  4. `__tests__/screens/chat-session-deep.test.tsx` — 1 pre-existing test regresses (chat-local banner removed) (R13).
- 5-axis: correctness 50, security 90, maintainability 75, testCoverage 58, docQuality 80 → weightedMean **69.2**.
- verdict: **CHANGES_REQUESTED**, re-spawn **green** (spec/design/tasks/frozen-tests sound; green wiring incomplete).
- json: .claude/skills/team/team-reports/2026-05-21-connectivity-offline-first/code-review.json

- Prior 4 BLOCKERs ALL genuinely resolved (verified, not on faith):
  - #1 GlobalOfflineBannerHost mounted in app/_layout.tsx:40 (import) + :217 (mount), inside <ConnectivityProvider>(181) AND <DataModeProvider>(182), under <AuthenticationGuard>. PASS.
  - #2 connectivity-offline-banner.yaml in shards.json chat shard (:32). Real sentinel `scripts/sentinels/maestro-shard-manifest.mjs` (MAESTRO_REPO_ROOT) exits 0 — "29 flows/4 shards". (Prior review's path was wrong; actual passes.) PASS.
  - #3 connectivity.test.tsx updated to tri-state contract (adds isOnline/isInternetReachable asserts, isConnected:null initial) — legitimate contract update, not weakening. PASS.
  - #4 chat-session-deep.test.tsx removed the obsolete chat-local-banner forwarding test (banner now global) — legitimate obsolete-removal. PASS.
- spec ↔ impl parity: R1-R11 PASS (predicate single-source, bridge, tri-state provider, prefetch gate, store hydration, chat replay, banner global mount). R12/R13 GAP (regression below).
- KISS/DRY/hexagonal: PASS (one predicate, one bridge; zero residual `?? true`/`!isConnected` in connectivity dir).
- a11y / design-system tokens / security grep / string-guard / deviations(UFR-014): all PASS.
- frozen-test integrity: 8/8 byte-identical to red-test-manifest.json. PASS.
- lib-docs PATTERNS.md compliance: cited lines (netinfo 142/173/134/181, react-query 174/191/84, zustand 91/132) all resolve + back the impl. PASS.
- NEW BLOCKER (regression, R12/R13): `shared/data/queryClient.ts:16` calls `installOnlineManagerBridge()` as a module side-effect, which runs the REAL `NetInfo.addEventListener` (onlineManagerBridge.ts:47) at import time. 4 previously-green, UNMODIFIED suites now break: `__tests__/data/queryClient.test.ts`, `__tests__/data/resetPersistedCache.test.ts`, `__tests__/shared/data/queryClient-filter.test.ts` (worker child-process crashes) + `__tests__/context/AuthContext.test.tsx` (`Cannot read properties of undefined (reading 'isInternetReachable')` from netinfo internal). Verified: base commit queryClient.ts had ZERO netinfo/bridge ref (causation airtight); none of the 4 suites mock NetInfo; reproduced under --runInBand. The green re-spawn's "scoped suite" (11 suites) never ran these → missed it. Full `npm test` = 4 suites failed / 1 test failed / 286 passed.
- verdict: CHANGES_REQUESTED (weightedMean 75.8) — re-spawn green to make the bridge import-safe in test env (lazy-init / NetInfo guard / global NetInfo jest mock) so unmocked queryClient importers don't trip the real native subscription. Then run FULL `npm test`, not a scoped subset (acceptance §10.3 / R13).
- json: .claude/skills/team/team-reports/2026-05-21-connectivity-offline-first/code-review.json

- Iteration-2 NEW BLOCKER (eager module-load NetInfo subscription crashing 4 unmodified suites) RESOLVED. Reviewer-verified, not on faith:
  - FULL `npm test` (reviewer-run) = **290 suites / 3042 tests PASS, exit 0, 0 FAIL**. The 4 previously-crashing suites all PASS: __tests__/data/queryClient.test.ts, __tests__/data/resetPersistedCache.test.ts, __tests__/shared/data/queryClient-filter.test.ts, __tests__/context/AuthContext.test.tsx.
  - Fix is test-env only: jest.config.js +`setupFilesAfterEnv:['__tests__/helpers/setup-netinfo-mock.ts']` registering the official @react-native-community/netinfo/jest mock globally. queryClient.ts:14 module-side-effect `installOnlineManagerBridge()` is UNCHANGED (production D4 intact). Confirmed setupFilesAfterEnv → the 8 frozen tests' per-file `jest.mock` still wins (e.g. onlineManagerBridge.test.ts:43 controllable mock).
- Iteration-1 fixes still hold: banner mounted app/_layout.tsx:217 under ConnectivityProvider(181)+DataModeProvider(182); shard sentinel `scripts/sentinels/maestro-shard-manifest.mjs` exit 0 (30 flows/4 shards); connectivity-offline-banner.yaml registered exactly once; 2 pre-existing test edits (connectivity.test.tsx tri-state + chat-session-deep.test.tsx obsolete-test removal) are legit contract updates, not weakening.
- Frozen-test integrity: 8/8 byte-identical to red-test-manifest.json (sha256 matched).
- spec ↔ impl parity: R1-R13 ALL PASS.
- Predicate deviation (declared #1, honest): shipped `isConnected !== false && isInternetReachable !== false` is REQUIRED by the frozen truth table ({null,null}->true); the spec/design prose `=== true` is the internally-inconsistent form. Bridge idempotency (declared #2): guard + setEventListener reset, sound.
- Musaium gates: a11y PASS (banner keeps accessibilityRole alert/summary + Label + testID), design-system tokens PASS (0 raw hex/rgb/px), security grep PASS (0 hits), string-guard N/A, deviations cross-check PASS (2 declared / 0 undeclared). tsc 0 errors project-wide.
- lib-docs PATTERNS.md compliance: netinfo 134/142/161/173/181/223, react-query 174/191, zustand 91/132 all resolve + accurately back the impl. INDEX sha256 match (netinfo 9f39…, react-query a1b8…, zustand 6cc5…).
- NITs (non-blocking): (1) frozen test header + design §D1:89 prose formula contradicts the correct truth table; (2) 2 pre-existing eslint warnings chat-session-deep.test.tsx:71-72 on untouched lines, break no real repo gate.
- 5-axis: correctness 93, security 90, maintainability 90, testCoverage 88, docQuality 86 → weightedMean **90.2**.
- verdict: **APPROVED** — ready for finalize.
- json: .claude/skills/team/team-reports/2026-05-21-connectivity-offline-first/code-review.json

## Surprises

_no data captured_

## Action items

- commit: ...
- KB updates: velocity-metrics, agent-roi, error-patterns
- lesson capture: PASS / WARN
- telemetry summary (Langfuse): tokens=... cost=$... elapsed=...
