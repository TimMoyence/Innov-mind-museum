# Team Template: feature-backend

Backend-only feature — cycle complet, pas de frontend.

## Agents

### Required
- **Sentinelle** (persistent, background) — `agents/process-auditor.md`
- **Backend Architect** — `agents/backend-architect.md`
- **QA Engineer** — `agents/qa-engineer.md`

### Optional
- **API Contract Specialist** — condition: nouveau ou modifie endpoint
- **Security Analyst** — condition: auth, LLM pipeline, sanitization
- **DevOps Engineer** — condition: migration DB, Docker, CI

## Task Graph

```
ANALYSE → DESIGN → PLAN(user-validate) → DEV → REVIEW → TEST → SHIP
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| ANALYSE | Analyse scope + pre-flight | Tech Lead | — |
| DESIGN | Architecture backend | Backend Architect | ANALYSE |
| PLAN | Plan + validation user | Tech Lead | DESIGN |
| DEV | Implementation | Backend Architect | PLAN |
| REVIEW | Code review | Tech Lead | DEV |
| TEST | Tests + coverage | QA Engineer | REVIEW |
| SHIP | Commit + CI dry-run | Tech Lead | TEST |

## Phase Configuration
- Phases actives: toutes
- Frontend verification: `npm run lint` seulement (pas de modifs)
- Community skills actifs :
  - Si scope chat/LLM : langchain-skills (fundamentals, rag, middleware)
  - Si scope Express/TypeORM : backend-patterns
  - Phase VERIFIER : semgrep + vulnerability-scanner (toujours)
  - obra/verification-before-completion : phases CHALLENGER, REGRESSION, TESTER, VALIDER
  - Si nouvelle dep : supply-chain-auditor

## Definition of Done
- [ ] Code conforme, tsc PASS, 0 regression
- [ ] Nouveaux tests ecrits et PASS
- [ ] Si API: spec OpenAPI validee, contract tests
- [ ] SAST (semgrep + vulnerability-scanner) clean
- [ ] obra/verification-before-completion PASS
- [ ] Si LangChain modifie : patterns langchain-skills respectes
- [ ] Sprint tracking mis a jour
