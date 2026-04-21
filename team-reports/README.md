# team-reports — Archive (read-only)

> **Canonical location for archived SDLC reports.**
> Active `/team` runs write to `.claude/skills/team/team-reports/`, not here.

## Policy

- **This folder** is an **archive**: closed audits, brainstorms, and external reports dated before a runtime rollover.
- **Agents must not write here**. The `/team` skill (`.claude/skills/team/SKILL.md`) writes exclusively to `.claude/skills/team/team-reports/`.
- **Rollover**: content in `.claude/skills/team/team-reports/` older than ~30 days may be promoted here (manual or via a future `scripts/archive-team-reports.sh`).

## See also

- Runtime runs: [`.claude/skills/team/team-reports/`](../.claude/skills/team/team-reports/)
- Skill definition: [`.claude/skills/team/SKILL.md`](../.claude/skills/team/SKILL.md)
- Lifecycle policy: [`CLAUDE.md`](../CLAUDE.md) section "Team reports lifecycle"
