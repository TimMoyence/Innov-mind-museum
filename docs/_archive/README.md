# `docs/_archive/`

Read-only archive. Not maintained. Kept in-tree for repo memory and ease of `grep`.

Contents are moved here when they:
- describe a finished sprint or training pass (debrief documents, post-mortems, recaps),
- represent a plan whose actions have all merged,
- are referenced from `git log` for historical context but not consulted day-to-day.

Anything that is still load-bearing belongs in `docs/`, an ADR, `TECH_DEBT.md`, or a runbook — NOT here.

## Subfolders

- **`training-2026-05/explications-sprint-2026-05-05/`** — 22 fichiers en français, "professeur explicatif", 6239L total. Sprint debrief Banking-Grade Hardening 2026-04-30 → 2026-05-05. Audience: Tim personal training. Archived 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12).
- **`sprints/`** — recaps de sprints fermés.

## Rules

- **No edits** to archived files. If something is wrong, leave it — `git log` is the source of truth.
- **No new references** from live docs. Live docs link to live docs; archived material may only be cited from another archive entry.
- **Promotion** from archive back to live docs requires a deliberate decision (not "accidentally became useful again"). When in doubt, write a new doc.

If you arrive here looking for "what got built in May 2026," start with the relevant ADRs (`docs/adr/`), `docs/PHASE_HISTORY.md`, and `git log --oneline --since=2026-05-01 --until=2026-06-01`.
