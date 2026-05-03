# Lesson schema — `team-knowledge/lessons/`

> Each `/team` run that reaches `status: completed` produces exactly **one** lesson markdown file via `team-hooks/post-complete-lesson-capture.sh`. The file name is `<RUN_ID>.md` (e.g. `2026-05-03-feedback-loop-interne-t21.md`). On RUN_ID collision (re-run), the new file gets a `-HHMMSS` timestamp suffix to preserve history.

## Frontmatter (YAML)

```yaml
---
runId: 2026-05-03-feedback-loop-interne-t21
mode: feature                         # mode enum: feature | bug | mockup | refactor | hotfix | chore | audit
pipeline: standard                    # pipeline enum: micro | standard | enterprise | audit
completedAt: 2026-05-03T08:30:00Z     # ISO 8601 UTC, == state.json updatedAt at finalize
durationMs: 1234567                   # state.json updatedAt - createdAt
correctiveLoops: 0                    # state.json telemetry.correctiveLoops (cap = 2)
costUSD: 1.94                         # state.json telemetry.costUSD if present, else estimatedCostUSD
tags:                                 # mode + pipeline + first 3 keywords from STORY.md "## brainstorm" first paragraph
  - feature
  - standard
  - hook
  - knowledge-base
  - infra
---
```

## Body — five fixed sections (DO NOT rename / reorder)

```markdown
## Trigger
<one paragraph: who asked, why, what was the run about>

## What worked
- <bullet>
- <bullet>

## What failed
- <bullet>     <!-- or literal "_no failures captured_" if STORY.md verify section was PASS w/o issues -->

## Surprises
- <bullet>     <!-- non-obvious findings: env quirks, recurring patterns, missed assumptions -->

## Action items
- [ ] <free-form proposal — curator may pick up>
- [ ] <free-form proposal>
```

## Honesty rule (UFR-013)

If the STORY.md does not contain enough signal for a section, the hook MUST write the literal string `_no data captured_` rather than fabricate content. The curator must respect this marker and skip such sections in aggregation.

## Why these 5 sections

- **Trigger** — preserves "why now" context that gets lost as STORY.md is pruned at 30d
- **What worked** — positive signal feeds confidence in current rules
- **What failed** — negative signal feeds amendment proposals
- **Surprises** — anomalies that don't fit worked/failed but matter for future runs
- **Action items** — checkbox list curator scans first when grouping by tag

## Consumed by

- `learning-curator` agent (`.claude/agents/learning-curator.md`) — aggregates by tag + recency
- `/team learning:review` subcommand — surfaces source lessons in amendment review UI
- Manual grep for retrospectives + post-mortems
