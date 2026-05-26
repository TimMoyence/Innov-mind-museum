# Doc Cleanup Audit — 2026-05-26

**Principe** : on ne croit pas la doc, on croit le code. Chaque claim coupable jusqu'à preuve `file:line`.
**États** : OK | À MODIFIER (avec correction code-truth) | À SUPPRIMER (avec justif + check refs entrantes).
**Scope exclu** (vendor, non-authored) : `lib-docs/` snapshots, plugins `.claude/skills/{gitnexus,superpowers,expo,sentry,code-review,frontend-design}`, `ios/Pods/*`, node_modules.

## Partition (12 agents, 3 vagues de 4)

| Agent | Lot | Rapport |
|---|---|---|
| A1 | ADR-002→022 (21) | reports/A1-adr-002-022.md |
| A2 | ADR-023→046 (22) | reports/A2-adr-023-046.md |
| A3 | ADR-047→068 + README (22) | reports/A3-adr-047-068.md |
| A4 | audit-state/ (103) | reports/A4-audit-state.md |
| A5 | gros docs vivants/index (7) | reports/A5-living-docs.md |
| A6 | docs/ engineering+test+CI (~18) | reports/A6-engineering.md |
| A7 | docs/ ops+AI+produit + operations+RUNBOOKS+observability (~36) | reports/A7-ops-ai.md |
| A8 | docs/legal+compliance+incidents (19) | reports/A8-legal-compliance.md |
| A9 | .claude process/agents/skills/lessons-team (~46) | reports/A9-claude-process.md |
| A10 | root + app docs (~34) | reports/A10-root-app.md |
| A11 | memory(39)+team lessons(10) (49) | reports/A11-memory-lessons.md |
| A12 | lib-docs LESSONS (98) | reports/A12-libdocs-lessons.md |

## État
- [ ] Vague 1 lancée
- [ ] Vague 2 lancée
- [ ] Vague 3 lancée
- [ ] Consolidation finale → CONSOLIDATED-TRIAGE.md
