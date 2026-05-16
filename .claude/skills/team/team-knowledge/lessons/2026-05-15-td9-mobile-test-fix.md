---
runId: 2026-05-15-td9-mobile-test-fix
mode: bug
pipeline: enterprise
completedAt: 2026-05-15T00:05:00Z
durationMs: 300000
correctiveLoops: 0
costUSD: 1.66
tags:
  - bug
  - enterprise
  - td-9
  - ticket
  - docs
---

# Lesson — 2026-05-15-td9-mobile-test-fix

## Trigger

- input: TD-9 ticket in `docs/TECH_DEBT.md:214-235` claiming `chat-session-deep.test.tsx > forwards toggleRecording, playRecordedAudio, …` red on `main` with `Received: 0`.
- investigation steps:
  1. Read test file lines 1000-1100 + 1-300 + 300-450 (mock setup, beforeEach, defaultSession).
  2. Read screen `museum-frontend/app/(stack)/chat/[sessionId].tsx` (full, 400 LOC).
  3. Identified the wrapper at line 110-116: `toggleRecording` short-circuits when `!voiceDisclosureAcknowledged`. Mock on line 97-102 supplies `isAcknowledged: true`, so the gate should pass through.
  4. `git log --since="2026-02-15"` over both files → 3 suspect commits: `f795ed4dc` (test mock added 2026-05-13), `59296c75e` (Art. 50 gate introduced — caused the original break), `0358684e7` (screen split refactor).
  5. `git show f795ed4dc` confirmed it was the targeted fix for THIS exact test failure, committed 2026-05-13 16:23 — same day TD-9 was created. TD-9 was logged either against pre-`f795ed4dc` HEAD or against a stale local copy.
  6. Ran `npx jest __tests__/screens/chat-session-deep.test.tsx -t "forwards toggleRecording"` → PASS (1/1, 258 ms).
  7. Ran full file: `npx jest __tests__/screens/chat-session-deep.test.tsx` → 50/50 PASS, 1.036 s, zero `act()` warnings. (TD-9 cited "52 tests" but the file has 50 — discrepancy is in the ticket, not in reality.)
  8. `gitnexus_impact({target: "toggleRecording", file_path: "museum-frontend/app/(stack)/chat/[sessionId].tsx", direction: "upstream", maxDepth: 2})` → 0 direct callers, risk LOW (local `useCallback` consumed only in-file).
- options considered:
  - **Option A — Fix wiring in screen.** Rejected: not broken; would regress Art. 50 gate.
  - **Option B — Patch test mock.** Rejected: `f795ed4dc` already added the right mock; test already passes.
  - **Option C — ALREADY-FIXED + close debt.** Selected. Honest path per UFR-013; TD-9 is stale, not actually red.

## What worked

- gates run: lint, tsc, tests, gitnexus_detect_changes
- verdict: PASS / WARN / FAIL
- failures: ...
- corrective loops used: 0 / 1 / 2 (cap)

## What failed

- spec ↔ implementation alignment: ...
- KISS / DRY / hexagonal compliance: ...
- verdict: PASS / WARN / FAIL
- comments: ...

## Surprises

- input: tasks.md (T1.1…T1.3)
- changed files: ...
- gates that passed inline (post-edit hooks): lint ✅, tsc ✅
- gates deferred to verifier: tests, mutation
- notes: ...

## Action items

- commit: ...
- KB updates: velocity-metrics, agent-roi, error-patterns
- telemetry summary (Langfuse): tokens=... cost=$... elapsed=...
