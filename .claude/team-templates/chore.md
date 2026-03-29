# Team Template: chore

CI/CD, deps, docs, config — cycle minimal.

## Agents

### Required
- **Sentinelle** (persistent, lightweight) — `agents/process-auditor.md`

### Optional
- **DevOps Engineer** — condition: CI/CD, Docker, deploy pipeline
- **Backend Architect** — condition: code backend modifie
- **Frontend Architect** — condition: code frontend modifie

## Task Graph

```
ANALYSE-LIGHT → DEV-TARGETED → SHIP-IF-NEEDED
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| ANALYSE-LIGHT | Fichiers config/CI concernes | Tech Lead | — |
| DEV-TARGETED | Modification ciblee | Tech Lead ou DevOps | ANALYSE |
| SHIP-IF-NEEDED | Commit si pertinent | Tech Lead | DEV |

## Phase Configuration
- Phases actives: ANALYSE (LIGHT), DEV (TARGETED), SHIP (IF_NEEDED)
- Phases skipped: DESIGN, PLAN, REVIEW, TEST (sauf si code modifie)
- Si code modifie: ajouter Code Review LIGHT + TEST
- Community skills actifs :
  - obra/verification-before-completion : avant cloture
  - Si package.json modifie : supply-chain-auditor

## Definition of Done
- [ ] Modification config/CI/docs conforme
- [ ] Si code modifie: tsc PASS + tests PASS
- [ ] obra/verification-before-completion PASS
- [ ] Rapport Sentinelle produit

## Mode-Specific Rules
- Si la tache est triviale (typo, 1-line config) → Tech Lead directement
- DevOps spawn uniquement si CI/Docker/deploy concerne
- Pas de plan formel sauf si > 5 fichiers
