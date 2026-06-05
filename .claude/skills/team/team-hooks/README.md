# Team v13 (UFR-022) — deterministic hooks

LLM-critic agents are wasteful for things compilers can decide. Lint / typecheck / tests / frozen-test / lib-docs assertions run as deterministic hooks, not agent calls. Under UFR-022 there is **one** pipeline (no mode selector, no Spec-Kit bypass keywords); these 11 hooks gate its phases.

## Files (11 hooks)

### Core gates

| Hook | Trigger | Purpose |
|---|---|---|
| `post-edit-lint.sh` | After editor agent finishes a task | scoped ESLint on touched files; FAIL → loop back to editor; ALSO enforces handoff-brief ≤200 token cap |
| `post-edit-typecheck.sh` | After editor agent finishes a task | scoped `tsc --noEmit` on touched modules |
| `pre-feature-spec-check.sh` | End of Step 4b (Spec Kit closing gate), before editor phase | T1.4 ROADMAP_TEAM KR2 — verify `spec.md` / `design.md` / `tasks.md` each present + ≥ 200 bytes (non-vacuous). UFR-022: no triviality regex, no force keywords, no bypass — every applicative-code run goes through Spec Kit. Self-test : `--self-test` runs 8 scenarios. |
| `pre-complete-verify.sh` | Before dispatcher marks state `completed` | full scoped tests + STORY.md append-only check via per-phase sha256 chain |

### UFR-022 phase hooks (fresh-context 5-phase)

| Hook | Trigger | Purpose |
|---|---|---|
| `pre-phase-pure-doc-check.sh` | Step 0 INIT §8 | Auto-exemption: diff = 0 applicative-code files (pure-doc edit) → skip the whole pipeline + write `pure-doc-skip.marker`. |
| `pre-phase-doc-freshness.sh` | Step 4.5 | Detect libs imported by the diff, run 3-way staleness check (>14d / version drift / missing), write `doc-refresh-queue.json` for doc-cache. |
| `post-edit-green-test-freeze.sh` | After every edit in phase Green | FROZEN-TEST gate — re-hash sha256 of each test in `red-test-manifest.json`; any mismatch = exit 1 STOP (Green cannot mutate a Red test byte-for-byte). |
| `pre-phase-doc-reference-check.sh` | Step 6 Verify | Assert `libDocsConsulted[]` covers every non-dev-only import in the diff + hash drift check (lib-docs obligation proof). |
| `pre-complete-debug-log-check.sh` | Step 6 Verify | systematic-debugging enforcement (absorbed from superpowers): if `intraPhaseHookLoops >= 2`, require a complete `debug-log.md` (4 phases + architecture question). Else FAIL → re-spawn green with the protocol. |
| `pre-complete-review-response-check.sh` | Step 6 Verify | receiving-code-review enforcement (absorbed from superpowers): if `reviewerRejectionLoops >= 1`, require `review-response.md` (verdict per finding + Evidence per DISPUTE + no performative agreement). Else FAIL → re-spawn with the protocol. |

### Lifecycle hooks

| Hook | Trigger | Purpose |
|---|---|---|
| `pre-cycle-roadmap-load.sh` | Step 0 INIT §9 | T1.6 — read `docs/ROADMAP_PRODUCT.md` + `docs/ROADMAP_TEAM.md`, parse unchecked NOW items, write `team-state/$RUN_ID/roadmap-context.json`. WARN-tolerant. |
| `post-complete-lesson-capture.sh` | Step 9 Finalize, after cost delta | T2.1 KR4 — extract 1 lesson markdown from STORY.md into `team-knowledge/lessons/<RUN_ID>.md` for manual reading (no longer fed to a learning-curator agent). Fail-open. |
| `post-cycle-roadmap-update.sh` | Step 9 Finalize, after lesson capture | T1.6 — fuzzy-match DESCRIPTION ↔ NOW items, propose staged `[x]` patch (never auto-commits). |

## Concurrency model

All hooks mutate `team-state/<RUN_ID>/state.json` via the same compare-and-swap pattern:
1. `mkdir state.json.lock.d` (atomic on POSIX) → owner PID written inside.
2. Read current `.version`, increment, run the jq expression, write `.tmp`, `mv` to `.json`.
3. Release lock by removing the directory.
4. Stale-lock recovery: if `owner` PID is gone, reclaim.

No `flock` dependency (macOS lacks it). Lock-acquire timeout = 3s (30 attempts × 100ms). Concurrent writers serialize cleanly; no silent overwrites.

## Inputs

All hooks expect `RUN_ID` env var pointing to a directory under `team-state/`:

```bash
RUN_ID=2026-05-02-auth-rate-limit .claude/skills/team/team-hooks/post-edit-lint.sh
```

`pre-feature-spec-check.sh` reads the Spec Kit artefacts under `team-state/$RUN_ID/` directly — no `MODE`, no `DESCRIPTION`, no override env. UFR-022 retired the mode selector and the Spec-Kit bypass keywords (`OVERRIDE_SPEC_KIT` / `--no-spec-kit` no longer exist); there is one pipeline and every applicative-code run must produce a non-vacuous `spec.md` / `design.md` / `tasks.md`:

```bash
RUN_ID=2026-05-03-foo .claude/skills/team/team-hooks/pre-feature-spec-check.sh
```

Returns 0 = PASS (all three artefacts present + ≥ 200 bytes), 1 = FAIL. Stdout is concise; details land in `state.json.gates[]`.

## Anti-patterns to avoid

- Bypass the CAS helper (`update_state`) — direct `jq … | mv` loses concurrent writes.
- Mutate STORY.md after a phase completes — `pre-complete-verify.sh` will detect via sha256 mismatch and FAIL.
- Inline content in handoff briefs > 200 tokens (~800 chars) — `post-edit-lint.sh` rejects.
- Run hooks without `RUN_ID` and assume they no-op silently — they DO no-op, but you lose all gate history for the run.
