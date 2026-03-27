# Team Template: mockup

Maquette/prototype UI — pas de tests, pas de deploy.

## Agents

### Required
- **Sentinelle** (persistent, background) — `agents/process-auditor.md`
- **Frontend Architect** — `agents/frontend-architect.md`
- **Mobile UX Analyst** — `agents/mobile-ux-analyst.md`

### Optional
- **Product Owner** — condition: requirements UX complexes
- **SEO Specialist** — condition: mockup museum-web

## Task Graph

```
ANALYSE → DESIGN → PLAN(user-validate) → DEV-UI → UX-REVIEW
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| ANALYSE | Ecrans/composants concernes | Tech Lead | — |
| DESIGN | Architecture UI/UX | Frontend Architect, Mobile UX Analyst | ANALYSE |
| PLAN | Plan UI + validation user | Tech Lead | DESIGN |
| DEV-UI | Implementation UI | Frontend Architect | PLAN |
| UX-REVIEW | Review UX/accessibilite | Mobile UX Analyst | DEV-UI |

## Phase Configuration
- Phases actives: ANALYSE, DESIGN, PLAN, DEV, UX-REVIEW
- Phases skipped: TEST (unit), SHIP
- Donnees mockees en place

## Definition of Done
- [ ] UI implementee selon le design
- [ ] Navigation fonctionnelle
- [ ] Donnees mockees en place
- [ ] UX review PASS (accessibilite, patterns mobile)

## Mode-Specific Rules
- Pas de tests unitaires requis
- Pas de deploy
- Focus sur le rendu visuel et l'interaction
- Donnees mockees, pas de connexion backend reelle
