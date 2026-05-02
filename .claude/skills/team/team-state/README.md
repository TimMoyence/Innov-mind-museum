# /team state — V12

Durable, file-based run state. One directory per run. Survives crash; resumes via `/team resume <run-id>`.

## Layout

```
.claude/skills/team/team-state/
├── README.md                  ← this file
├── state.schema.json          ← JSON schema (authoritative)
└── <YYYY-MM-DD-slug>/         ← one dir per run
    ├── state.json             ← matches state.schema.json
    ├── spec.md                ← EARS-format requirements (Spec Kit)
    ├── design.md              ← architecture decisions
    ├── tasks.md               ← atomic task list
    ├── STORY.md               ← append-only journal (sections per agent)
    └── handoffs/              ← ≤200-token JSON briefs between agents
        └── 001-architect-to-editor.json
```

## Lifecycle

1. **init** — dispatcher creates `<run-id>/`, writes initial `state.json` (`version: 1`, `status: "initializing"`).
2. **brainstorm** — fills `spec.md` (architect agent).
3. **plan** — fills `design.md` + `tasks.md` (architect).
4. **implement** — editor consumes `tasks.md`, edits code, appends `STORY.md` section.
5. **verify** — verifier runs lint/tsc/tests, writes gate verdicts to `state.json`.
6. **review** — reviewer (fresh context) inspects diff, appends `STORY.md` section.
7. **finalize** — dispatcher updates `state.json` `status: "completed"`, optional KB write.

## Optimistic lock

Every write to `state.json` does:

```ts
const current = readState(runId);      // disk
if (current.version !== expectedVersion) throw new StaleStateError();
current.version += 1;
current.updatedAt = nowIso();
writeState(runId, current);            // atomic rename
```

Concurrent writer = aborts; resumes from new state on next read.

## Resume contract

`/team resume <run-id>`:

1. Read `state.json`.
2. Replay context from `STORY.md` (read-only, no mutation).
3. Jump to `currentStep`.
4. Continue with the agent role expected by that step.

## Retention

- `team-state/<run-id>/` is git-ignored by default (set in `.claude/skills/team/team-state/.gitignore`).
- Prune: dispatcher deletes runs older than 30 days at the start of each invocation.
- For audit trail: graduate via the existing `team-reports/` workflow (manual promotion).

## Anti-patterns

- ❌ In-memory only — crash = full re-run (V12 §8 rule).
- ❌ Skip `version` increment — breaks optimistic lock guarantees.
- ❌ Mutate `STORY.md` after write — append-only by contract.
- ❌ Resume without checking `currentStep` — dispatcher must not re-run completed steps.
