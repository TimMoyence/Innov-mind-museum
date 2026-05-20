# Doc Audit Inventory — 2026-05-19

Audit lance : 2026-05-19. Methodologie : fresh-context per-file (UFR-022 spirit), max 2 agents parallele.

## Strategie

| Categorie | Files | Action |
|---|---:|---|
| **INDIVIDUAL** | 216 | 1 fresh agent par fichier, verdict KEEP/UPDATE/CONSOLIDATE/DELETE |
| **GROUP:docs-adr** | 54 | 1 fresh agent audite l'ensemble du dossier docs/adr/ |
| **GROUP:lib-docs-lessons** | 53 | 1 fresh agent audite tous les LESSONS.md de lib-docs/ |
| **GROUP:docs-archive** | 26 | 1 fresh agent audite docs/_archive/ |
| **GROUP:team-reports-runtime** | 14 | 1 fresh agent audite .claude/skills/team/team-reports/ |
| **GROUP:team-reports-archive** | 5 | 1 fresh agent audite /team-reports/ root |
| **EXCLUDE** | 356 | Auto-classifie (Python venv, lib-docs cache, team-state ephemere, workflow code) |
| **TOTAL** | 724 | |

## Action mode (defini par user)

- **UPDATE** verdict → fresh editor agent SPAWNED IMMEDIATELY, fichier modifie
- **CONSOLIDATE** verdict → fresh editor agent SPAWNED IMMEDIATELY, merge into target
- **DELETE** verdict → ajoute a la liste finale, **PAS** d'`rm`, decision Tech Lead
- **KEEP** verdict → no-op

## Suivi

| Phase | Status |
|---|---|
| A — Recensement + classification | DONE |
| B — Audit individual (216 files, max 2 parallele) | PENDING |
| B-bis — Audit groupes (5 groupes) | PENDING |
| C — Apply UPDATE/CONSOLIDATE auto | IN-FLIGHT (parallele a B) |
| D — Rapport final (3 listes) | PENDING |

## Source de verite machine-readable

- `docs/_audit-2026-05-19/classified-full.tsv` — full inventory avec categorie/tracked/mtime/lines/size/path
- `docs/_audit-2026-05-19/verdicts/<run-id>.json` — verdict per file (un fichier par audit agent)
- `docs/_audit-2026-05-19/actions-applied.tsv` — log des UPDATE/CONSOLIDATE appliques en live

## Verdicts agreges (rempli en cours de route)

| Verdict | Count | Notes |
|---|---:|---|
| KEEP | 0 | |
| UPDATE applied | 0 | |
| CONSOLIDATE applied | 0 | |
| DELETE (proposition) | 0 | |

## Listes finales (Phase D — rempli a la fin)

### A SUPPRIMER (proposition Tech Lead)

_(rempli en phase D)_

### CONSOLIDES (action faite)

_(rempli en phase D)_

### MIS A JOUR (action faite)

_(rempli en phase D)_
