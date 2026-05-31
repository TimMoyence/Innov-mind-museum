# Lesson schema — `team-knowledge/lessons/`

> Each `/team` run that reaches `status: completed` produces exactly **one** lesson **JSON** file via `team-hooks/post-complete-lesson-capture.sh` (schema `lesson/v2`). The file name is `<RUN_ID>.json` (e.g. `2026-05-03-feedback-loop-interne-t21.json`). On RUN_ID collision (re-run), the new file gets a `-HHMMSS` timestamp suffix to preserve history.
>
> **Why JSON (v2, 2026-05-31).** Lessons are machine-read — the `learning-curator` agent groups them by tag + recency and diffs `whatFailed`/`surprises` across runs. The content is already field-structured (frontmatter + 5 fixed sections), so JSON gives consumers direct keyed access (`.tags`, `.whatFailed`) instead of re-parsing markdown, and lets `jq` filter the archive. The hook builds the JSON via `jq -n` so arbitrary STORY.md text (quotes, newlines, angle brackets) is escaped safely. Humans read a lesson by rendering it with `scripts/render-artifact.mjs <file>.json` (CLAUDE.md § Output format).
>
> **Historical `<RUN_ID>.md` files predate v2** and are left as-is (read-only archive). Consumers handle both: JSON `lesson/v2` and the legacy markdown (YAML frontmatter + `## Section` bodies).

## Shape (`lesson/v2`)

```json
{
  "schema": "lesson/v2",
  "runId": "2026-05-03-feedback-loop-interne-t21",
  "mode": "feature",
  "pipeline": "standard",
  "completedAt": "2026-05-03T08:30:00Z",
  "durationMs": 1234567,
  "correctiveLoops": 0,
  "costUSD": 1.94,
  "tags": ["feature", "standard", "hook", "knowledge-base", "infra"],
  "trigger": "who asked, why, what the run was about",
  "whatWorked": "- bullet\n- bullet",
  "whatFailed": "- bullet",
  "surprises": "- non-obvious finding",
  "actionItems": "- [ ] free-form proposal a curator may pick up"
}
```

### Fields

| Field | Type | Source |
|---|---|---|
| `schema` | `"lesson/v2"` | literal — lets consumers distinguish from legacy `.md` |
| `runId` | string | `state.json.runId` |
| `mode` | enum | `feature \| bug \| mockup \| refactor \| hotfix \| chore \| audit` |
| `pipeline` | enum | `micro \| standard \| enterprise \| audit` |
| `completedAt` | ISO 8601 UTC | `state.json.updatedAt` at finalize |
| `durationMs` | number | `updatedAt − createdAt` |
| `correctiveLoops` | number | `state.json.telemetry.correctiveLoops` (cap = 2) |
| `costUSD` | number | `telemetry.costUSD` else `estimatedCostUSD` else `0` |
| `tags` | string[] | mode + pipeline + ≤3 keywords from STORY.md `## brainstorm` first paragraph |
| `trigger` | string \| null | STORY.md `## brainstorm` |
| `whatWorked` | string \| null | STORY.md `## verify` |
| `whatFailed` | string \| null | STORY.md `## review` |
| `surprises` | string \| null | STORY.md `## implement` |
| `actionItems` | string \| null | STORY.md `## finalize` |

The five body fields keep their raw markdown fragment (bullet lines preserved as `- …\n- …`) so the renderer can turn them into real lists and no signal is lost.

## Honesty rule (UFR-013)

If STORY.md has no signal for a section, the hook writes **`null`** for that field — never fabricated prose. (The legacy markdown era wrote the literal string `_no data captured_`; treat both `null` and that sentinel as "skip in aggregation".) The curator MUST skip null/sentinel sections rather than invent a finding.

## Why these 5 sections

- **trigger** — preserves "why now" context that gets lost as STORY.md is pruned at 30d
- **whatWorked** — positive signal feeds confidence in current rules
- **whatFailed** — negative signal feeds amendment proposals
- **surprises** — anomalies that don't fit worked/failed but matter for future runs
- **actionItems** — proposals the curator scans first when grouping by tag

## Consumed by

- `learning-curator` agent (`.claude/agents/learning-curator.md`) — aggregates by tag + recency
- `/team learning:review` subcommand — surfaces source lessons in amendment review UI
- `scripts/render-artifact.mjs <file>.json` — human-readable HTML view
- Manual `jq` over the archive for retrospectives + post-mortems
