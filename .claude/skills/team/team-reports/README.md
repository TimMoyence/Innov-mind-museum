# team-reports (runtime, active)

> **Canonical write location for the `/team` skill.**
> The archive folder at `/team-reports/` (repo root) is read-only.

## Layout

- `working/<YYYY-MM-DD>-<slug>/` — scratch pad for a live or recently-closed session. Files here are ephemeral (purged on sprint close).
- `<YYYY-MM-DD>-<slug>/` or `<YYYY-MM-DD>_<slug>.md` — closed runs kept here for up to ~30 days.

## Policy

- Agents **write here**, not at `/team-reports/` (repo root).
- After ~30 days a run may be promoted to `/team-reports/` (archive) via manual move or future `scripts/archive-team-reports.sh`.
- The `working/` subfolder is always considered disposable.

## See also

- Archive: [`/team-reports/`](../../../../team-reports/)
- Skill definition: [`../SKILL.md`](../SKILL.md)
- Lifecycle policy: [`../../../../CLAUDE.md`](../../../../CLAUDE.md) section "Team reports lifecycle"
