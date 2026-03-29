# Team Template: refactor

Restructuration/cleanup — comportement identique, structure amelioree.

## Agents

### Required
- **Sentinelle** (persistent, background) — `agents/process-auditor.md`
- **Code Reviewer** — `agents/code-reviewer.md`

### Optional
- **Backend Architect** — condition: refactor architecture backend
- **Frontend Architect** — condition: refactor architecture frontend
- **QA Engineer** — condition: tests a adapter

## Task Graph

```
ANALYSE → PLAN(user-validate) → DEV → REVIEW → TEST
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| ANALYSE | Scope refactor + baseline | Tech Lead | — |
| PLAN | Plan transformation + user validation | Tech Lead | ANALYSE |
| DEV | Implementation | Architecte ou Tech Lead | PLAN |
| REVIEW | Code review compliance | Code Reviewer | DEV |
| TEST | 0 regression | QA Engineer ou Tech Lead | REVIEW |

## Phase Configuration
- Phases actives: ANALYSE, PLAN, DEV, REVIEW, TEST
- Phases skipped: DESIGN (inline dans PLAN), SHIP (optionnel)
- Community skills actifs :
  - Phase VERIFIER : semgrep + vulnerability-scanner
  - obra/verification-before-completion : avant cloture

## Definition of Done
- [ ] Transformation conforme au plan
- [ ] tsc PASS, 0 regression (comportement identique)
- [ ] Code review PASS (hexagonal, conventions)
- [ ] SAST (semgrep + vulnerability-scanner) clean
- [ ] obra/verification-before-completion PASS
- [ ] Tests supplementaires si necessaire

## Mode-Specific Rules
- Le comportement ne doit PAS changer — seule la structure change
- Refactor opportuniste interdit (scope strict)
