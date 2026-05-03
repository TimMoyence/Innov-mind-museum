# Amendment schema — `team-knowledge/amendments/`

> The `learning-curator` agent reads `team-knowledge/lessons/*.md` (filtered by `--since`, default 7 days), groups by tag + mode, detects recurring patterns, and writes 0..N amendment proposals as markdown files in `pending/`. The user reviews via `/team learning:review` and each amendment moves to `applied/` (after `git apply`) or `rejected/`.

## Lifecycle

```
+----------+        +------------------+        +-----------+
|  lesson  |  ────► | learning-curator | ────►  | pending/  |
|  *.md    |        |   (read-only)    |        +-----------+
+----------+        +------------------+              │
                                                       │ /team learning:review
                                                       ▼
                                              ┌────────┴───────┐
                                              │                │
                                              ▼                ▼
                                         applied/         rejected/
                                       (git apply OK)    (user decline)
```

`pending/` files that fail `git apply` stay in `pending/` (R9) — curator may re-propose with adjustments on next batch.

## File naming

- `pending/<date>-<slug>.md` — e.g. `2026-05-10-editor-prompt-clarify-handoff.md`
- `pending/_curator-batch-<date>.md` — always-present summary file per curator run (D7), even if 0 amendments produced (explicit empty rather than silent skip — UFR-013).

## Frontmatter (YAML)

```yaml
---
proposedAt: 2026-05-10T09:00:00Z
proposedBy: learning-curator
target: .claude/agents/editor.md       # absolute path within repo of the file being patched
risk: low                              # low | medium | high (curator self-assesses)
contentHash: sha256:abcd1234...        # of the patch block (see Dedup below)
sourceLessons:
  - 2026-05-03-feedback-loop-interne-t21
  - 2026-05-04-some-other-run
status: pending                        # pending | applied | rejected (mutated by /team learning:review)
appliedAt: null                        # ISO 8601 when status flips to applied
rejectedAt: null                       # ISO 8601 when status flips to rejected
rejectionReason: null                  # free-form string set by user at /team learning:review
---
```

## Body — three fixed sections

```markdown
## Rationale
<2-4 sentences linking to source lessons explaining why this rule should change>

## Patch

```diff
--- a/.claude/agents/editor.md
+++ b/.claude/agents/editor.md
@@ -42,7 +42,7 @@
- old line
+ new line
```

## Risk + rollback
<paragraph: blast radius if approved + how to revert (typically `git checkout HEAD~1 -- <file>` or `git revert`)>
```

## Dedup rule

Curator MUST compute `contentHash = sha256(patch_block_only)` BEFORE writing a new amendment. If a file in `applied/` or `rejected/` already has the same `contentHash`, the curator MUST skip — no re-proposal of an already-decided patch. The `_curator-batch-<date>.md` summary records skipped duplicates with their hash + which prior amendment they collide with.

## Risk taxonomy

- **low** — patch touches comments, descriptions, prompt clarifications, additive helper sections. Reversible by `git revert` with no side effect.
- **medium** — patch alters behavior of a hook or agent workflow step. May change verdict outputs of pre-existing tests.
- **high** — patch alters dispatcher logic, gate thresholds, allowedTools, or schema enums. Could affect run pipeline semantics. User MUST review carefully.

## Honesty rule (UFR-013)

If the curator finds a recurring pattern but cannot identify a concrete patch (e.g. the lesson signals "verifier output is too verbose" but the curator cannot pinpoint a specific line to change), it MUST emit a `risk: high` amendment with `target: <best guess>` AND a Rationale stating "_diagnosis only — no concrete patch proposal; user input needed_". Never fabricate a patch to fill the slot.

## Consumed by

- `/team learning:review` — interactive review subcommand
- Audit trail: `applied/` + `rejected/` are permanent archives (no auto-prune)
