# Team Template: feature-fullstack

Full-stack feature — cycle complet 7 phases, parallelisme DEV.

## Agents

### Required
- **Sentinelle** (persistent, background) — `agents/process-auditor.md`
- **Backend Architect** — `agents/backend-architect.md`
- **Frontend Architect** — `agents/frontend-architect.md`
- **API Contract Specialist** — `agents/api-contract-specialist.md`
- **QA Engineer** — `agents/qa-engineer.md`
- **Code Reviewer** — `agents/code-reviewer.md`

### Optional
- **Security Analyst** — condition: auth, LLM pipeline, ou sanitization touche
- **DevOps Engineer** — condition: CI/CD, Docker, migration DB, deploy
- **SEO Specialist** — condition: fichiers museum-web/ dans le scope
- **Product Owner** — condition: requirements complexes ou ambigus
- **Mobile UX Analyst** — condition: UI mobile complexe

## Task Graph

```
ANALYSE → DESIGN → PLAN(user-validate) → [DEV-be ⫽ DEV-fe ⫽ DEV-api] → REVIEW → TEST → SHIP
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| ANALYSE | Analyse scope + pre-flight | Tech Lead | — |
| DESIGN | Architecture + risques | Backend Architect, Frontend Architect | ANALYSE |
| PLAN | Plan + validation user | Tech Lead | DESIGN |
| DEV-backend | Implementation backend | Backend Architect | PLAN |
| DEV-frontend | Implementation frontend | Frontend Architect | PLAN |
| DEV-api | Spec OpenAPI + contracts | API Contract Specialist | PLAN |
| REVIEW | Code review + QA | Code Reviewer, Tech Lead | DEV-backend, DEV-frontend, DEV-api |
| TEST | Tests + coverage | QA Engineer | REVIEW |
| SHIP | Commit + CI dry-run + tracking | Tech Lead | TEST |

## Phase Configuration
- Phases actives: ANALYSE, DESIGN, PLAN, DEV, REVIEW, TEST, SHIP
- Phases skipped: aucune
- DEV agents en **parallele reel** (run_in_background: true)

## Definition of Done
- [ ] Code conforme au plan, tsc PASS backend + frontend
- [ ] 0 regression tests existants
- [ ] Nouveaux tests: happy + error + edge cases
- [ ] Code review PASS (architecture, conventions)
- [ ] Spec OpenAPI validee, contract tests PASS, types frontend regeneres
- [ ] Security review si applicable
- [ ] Sprint tracking (PROGRESS_TRACKER + SPRINT_LOG) mis a jour
- [ ] Rapport Sentinelle produit

## Mode-Specific Rules
- DEV-backend, DEV-frontend, DEV-api sont **parallelises** — aucune dependance entre eux
- La REVIEW attend que les 3 soient termines
- Si API modifiee: `pnpm openapi:validate` + `npm run generate:openapi-types`
