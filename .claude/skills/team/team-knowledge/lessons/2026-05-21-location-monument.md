---
runId: 2026-05-21-location-monument
mode: standard
pipeline: enterprise
completedAt: 2026-05-21T09:00:41Z
durationMs: 3983000
correctiveLoops: 0
costUSD: 0
tags:
  - standard
  - enterprise
---

# Lesson — 2026-05-21-location-monument

## Trigger

_no data captured_

## What worked

- gates run: lint, tsc, tests, gitnexus_detect_changes
- verdict: PASS / WARN / FAIL
- failures: ...
- corrective loops used: 0 / 1 / 2 (cap)

## What failed

- spec ↔ implementation parity: R1..R11 ALL PASS. B9 (R1/R4/R5): location_to_llm in THIRD_PARTY_AI_SCOPES (thirdPartyAiConsent.ts:34) → Settings row auto-renders + dedicated Location group in sheet (AiConsentSheetContent.tsx:131-146,338-355) + 8-locale i18n verified non-empty. B8 (R6/R7/R10): per-userId namespace musaium.consent.aiAccepted.${userId} (useAiConsent.ts:26-35) + clearConsentAcceptedFlag wired into clearPerUserFeatureStorage (AuthContext.tsx:120), ordering invariant (clear before clearPersistedTokens) correct in logout() + unauthorizedHandler. No-museum (R8/R9/R3): BE src UNCHANGED, characterization test 3/3 PASS (verify-first, UFR-013) — llm-prompt-builder.ts:204-209 confirmed to emit coarse + monument framing, never fine reverseGeocode.
- KISS / DRY / hexagonal compliance: ALL PASS. Single source array reuse (Settings row = zero added code); location.fixtures.ts factories (no inline entities); reused infoCard/switchRow styles. BE domain pure, no source change.
- frozen-test: PASS — 8/8 manifest paths byte-identical (sha256 verified).
- a11y: PASS (Location Switch has accessibilityRole=switch + accessibilityLabel; no web route).
- design-system tokens: PASS (0 raw hex/rgb/px in touched style code).
- security grep: PASS (0 hits across 4 source files).
- string-guard audit: PASS (no *.no-hardcoded-strings.test.ts in diff; no fromCharCode/array-join/alias workarounds).
- deviations cross-check (UFR-014): PASS — 0 declared / 0 undeclared (no .skip/TODO/as any/non-null/eslint-disable; forbidden set untouched).
- 5-axis: correctness 94 / security 92 / maintainability 91 / testCoverage 90 / docQuality 84 → weightedMean 91.4.
- verdict: APPROVED (weightedMean ≥ 85)
- comments: 0 BLOCKER, 0 IMPORTANT, 2 NIT (green-phase STORY section left as template placeholder → documenter backfill; CLAUDE.md GitNexus symbol-count auto-noise rode in — harmless). Pre-existing repo-wide lint debt (12 warnings, 6 untouched chat-screen test files) NOT in this changeset — does not affect score.
- json: .claude/skills/team/team-reports/2026-05-21-location-monument/code-review.json

## Surprises

_no data captured_

## Action items

- commit: ...
- KB updates: velocity-metrics, agent-roi, error-patterns
- lesson capture: PASS / WARN
- telemetry summary (Langfuse): tokens=... cost=$... elapsed=...
