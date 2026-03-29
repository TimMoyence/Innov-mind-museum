# Team Template: hotfix

Correction critique production — cycle minimal, vitesse maximale.

## Agents

### Required
- **Sentinelle** (persistent, lightweight) — `agents/process-auditor.md`

### Optional
- **Backend Architect** — condition: fix complexe backend
- **Frontend Architect** — condition: fix complexe frontend

## Task Graph

```
ANALYSE-EXPRESS → DEV → TEST-MINIMAL → SHIP-FAST
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| ANALYSE-EXPRESS | Cause racine < 2 min | Tech Lead | — |
| DEV | Fix chirurgical | Tech Lead | ANALYSE |
| TEST-MINIMAL | Smoke test + tsc | Tech Lead | DEV |
| SHIP-FAST | Commit + deploy ready | Tech Lead | TEST |

## Phase Configuration
- Phases actives: ANALYSE (EXPRESS), DEV, TEST (MINIMAL), SHIP (FAST)
- Phases skipped: DESIGN, PLAN (presente mais non-bloquant), REVIEW
- Pas de gate architecture
- Community skills actifs :
  - obra/verification-before-completion uniquement (pas de SAST — vitesse prioritaire)

## Definition of Done
- [ ] Fix chirurgical implemente, tsc PASS
- [ ] Smoke test minimal PASS
- [ ] Pas de regression
- [ ] Deploy readiness validee
- [ ] obra/verification-before-completion PASS

## Mode-Specific Rules
- Vitesse > thoroughness (mais jamais au detriment de la correction)
- Le plan est presente mais ne bloque PAS
- Un architecte n'est spawne que si le fix est techniquement complexe
