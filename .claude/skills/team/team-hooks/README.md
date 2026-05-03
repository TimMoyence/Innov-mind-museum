# Team v12 — deterministic hooks

LLM-critic agents are wasteful for things compilers can decide. V12 §1.4 + §8: lint / typecheck / tests run as post-edit hooks, not agent calls.

## Files

| Hook | Trigger | Purpose |
|---|---|---|
| `pre-feature-spec-check.sh` | End of Step 4 (post Spec Kit), before Step 5 (editor) | T1.4 ROADMAP_TEAM KR2 — enforce spec.md + design.md + tasks.md presence + non-vacuity for non-trivial feature/refactor runs. Triviality detected via description regex; force keywords (auth/security/migration/...) override triviality. Override env `OVERRIDE_SPEC_KIT=1` (CLI `--no-spec-kit`) → WARN + STORY.md audit. Self-test : `--self-test` runs 7 scenarios. |
| `post-edit-lint.sh` | After editor agent finishes a task | scoped ESLint on touched files; FAIL → loop back to editor; ALSO enforces handoff-brief ≤200 token cap |
| `post-edit-typecheck.sh` | After editor agent finishes a task | scoped `tsc --noEmit` on touched modules |
| `pre-complete-verify.sh` | Before dispatcher marks state `completed` | full scoped tests + STORY.md append-only check via per-phase sha256 chain |

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

`pre-feature-spec-check.sh` additionally requires `MODE` and `DESCRIPTION` (and optionally `OVERRIDE_SPEC_KIT=1`):

```bash
RUN_ID=2026-05-03-foo MODE=feature DESCRIPTION="add admin RBAC" \
  .claude/skills/team/team-hooks/pre-feature-spec-check.sh
```

Returns 0 = PASS, 1 = FAIL. Stdout is concise; details land in `state.json.gates[]`.

## Anti-patterns to avoid

- Bypass the CAS helper (`update_state`) — direct `jq … | mv` loses concurrent writes.
- Mutate STORY.md after a phase completes — `pre-complete-verify.sh` will detect via sha256 mismatch and FAIL.
- Inline content in handoff briefs > 200 tokens (~800 chars) — `post-edit-lint.sh` rejects.
- Run hooks without `RUN_ID` and assume they no-op silently — they DO no-op, but you lose all gate history for the run.
