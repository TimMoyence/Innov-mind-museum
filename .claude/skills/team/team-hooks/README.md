# Team v12 — deterministic hooks

LLM-critic agents are wasteful for things compilers can decide. V12 §1.4 + §8: lint / typecheck / tests run as post-edit hooks, not agent calls.

## Files

| Hook | Trigger | Purpose |
|---|---|---|
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

Returns 0 = PASS, 1 = FAIL. Stdout is concise; details land in `state.json.gates[]`.

## Anti-patterns to avoid

- Bypass the CAS helper (`update_state`) — direct `jq … | mv` loses concurrent writes.
- Mutate STORY.md after a phase completes — `pre-complete-verify.sh` will detect via sha256 mismatch and FAIL.
- Inline content in handoff briefs > 200 tokens (~800 chars) — `post-edit-lint.sh` rejects.
- Run hooks without `RUN_ID` and assume they no-op silently — they DO no-op, but you lose all gate history for the run.
