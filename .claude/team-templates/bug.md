# Team Template: bug

Bug fix — cycle raccourci, focus regression test.

## Agents

### Required
- **Sentinelle** (persistent, background) — `agents/process-auditor.md`

### Optional
- **Backend Architect** — condition: bug backend complexe
- **Frontend Architect** — condition: bug frontend complexe
- **QA Engineer** — condition: test de regression complexe

## Task Graph

```
ANALYSE-FOCUSED → PLAN-LIGHT → DEV → TEST-REGRESSION → SHIP
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| ANALYSE-FOCUSED | Localiser bug + cause racine | Tech Lead | — |
| PLAN-LIGHT | Fix propose (non-bloquant si evident) | Tech Lead | ANALYSE |
| DEV | Correction ciblee | Tech Lead ou architecte | PLAN |
| TEST-REGRESSION | Test regression + 0 casse | Tech Lead ou QA | DEV |
| SHIP | Commit + CI dry-run | Tech Lead | TEST |

## Phase Configuration
- Phases actives: ANALYSE (FOCUSED), PLAN (LIGHT), DEV, TEST, SHIP
- Phases skipped: DESIGN, REVIEW (integre dans DEV/TEST)
- Plan non-bloquant si fix evident
- Community skills actifs :
  - Phase VERIFIER (si active) : semgrep + vulnerability-scanner
  - obra/verification-before-completion : avant cloture

## Definition of Done
- [ ] Cause racine identifiee
- [ ] Fix minimal implemente, tsc PASS
- [ ] Test de regression ecrit (reproduit le bug, passe apres fix)
- [ ] 0 regression tests existants
- [ ] obra/verification-before-completion PASS

## Mode-Specific Rules
- Le Tech Lead corrige directement si < 3 fichiers
- Spawner un architecte seulement si cause racine complexe
- Plan presente mais non-bloquant si fix evident
