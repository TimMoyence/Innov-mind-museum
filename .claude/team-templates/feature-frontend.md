# Team Template: feature-frontend

Frontend-only feature (React Native/Expo ou museum-web).

## Agents

### Required
- **Sentinelle** (persistent, background) — `agents/process-auditor.md`
- **Frontend Architect** — `agents/frontend-architect.md`
- **QA Engineer** — `agents/qa-engineer.md`

### Optional
- **Mobile UX Analyst** — condition: UI mobile complexe, interactions gestuelles
- **SEO Specialist** — condition: museum-web/ dans le scope
- **Product Owner** — condition: requirements UX complexes

## Task Graph

```
ANALYSE → DESIGN → PLAN(user-validate) → DEV → REVIEW → TEST → SHIP
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| ANALYSE | Analyse scope + pre-flight | Tech Lead | — |
| DESIGN | Architecture UI/UX | Frontend Architect | ANALYSE |
| PLAN | Plan + validation user | Tech Lead | DESIGN |
| DEV | Implementation frontend | Frontend Architect | PLAN |
| REVIEW | Code + UX review | Tech Lead, Mobile UX Analyst (opt) | DEV |
| TEST | Tests hooks/composants | QA Engineer | REVIEW |
| SHIP | Commit + CI dry-run | Tech Lead | TEST |

## Phase Configuration
- Phases actives: toutes
- Backend verification: `pnpm lint` seulement (pas de modifs)
- Community skills actifs :
  - Si museum-web : browser-use smoke test en Phase TESTER + VIABILITE
  - Phase VERIFIER : semgrep + vulnerability-scanner (toujours)
  - obra/verification-before-completion : phases CHALLENGER, REGRESSION, TESTER, VALIDER

## Definition of Done
- [ ] UI conforme au design, tsc PASS
- [ ] 0 regression, nouveaux tests
- [ ] Si museum-web: SEO review, CWV check, browser-use smoke test
- [ ] SAST (semgrep + vulnerability-scanner) clean
- [ ] obra/verification-before-completion PASS
- [ ] Sprint tracking mis a jour
