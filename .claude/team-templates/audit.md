# Team Template: audit

Full codebase audit — read-only, parallelisme maximal, rapport consolide.

## Agents

### Required
- **Sentinelle** (persistent, background) — `agents/process-auditor.md`
- **Backend Architect** — `agents/backend-architect.md`
- **Frontend Architect** — `agents/frontend-architect.md`
- **Security Analyst** — `agents/security-analyst.md`
- **QA Engineer** — `agents/qa-engineer.md`

### Optional
- **DevOps Engineer** — condition: audit infra/CI/Docker, OU audit supply-chain
- **Code Reviewer** — condition: audit conventions
- **SEO Specialist** — condition: audit museum-web SEO

## Task Graph

```
[SCAN-backend ⫽ SCAN-frontend ⫽ SCAN-security ⫽ SCAN-tests ⫽ SCAN-sast ⫽ SCAN-compliance] → CONSOLIDATE → REPORT
```

### Phase-to-Task Mapping

| Phase | Task | Agent(s) | blockedBy |
|-------|------|----------|-----------|
| SCAN-backend | Audit architecture + code backend | Backend Architect | — |
| SCAN-frontend | Audit architecture + code frontend | Frontend Architect | — |
| SCAN-security | Audit securite OWASP | Security Analyst | — |
| SCAN-tests | Audit couverture + qualite tests | QA Engineer | — |
| SCAN-sast | SAST via semgrep + codeql + variant-analysis | Security Analyst | — |
| SCAN-compliance | SOC2/GDPR/ISO + pentest-checklist | Security Analyst | — |
| SCAN-supply-chain | Audit dependances | DevOps Engineer | — |
| CONSOLIDATE | Fusionner findings | Tech Lead | tous SCANs |
| REPORT | Rapport consolide + recommandations | Sentinelle | CONSOLIDATE |

## Phase Configuration
- Phases actives: SCAN (parallele), CONSOLIDATE, REPORT
- Phases skipped: DESIGN, PLAN, DEV, REVIEW, TEST, SHIP
- Mode **read-only** : aucun code modifie
- Tous les SCANs en **parallele reel**

## Definition of Done
- [ ] 4+ scans completes (backend, frontend, security, tests)
- [ ] SAST scans completes (semgrep + codeql + vulnerability-scanner)
- [ ] Compliance scan complete (SOC2/GDPR/ISO)
- [ ] Supply chain audit si dependances
- [ ] Pentest checklist reviewe
- [ ] Findings consolides et priorises
- [ ] Rapport produit avec recommandations actionnables
- [ ] KB mise a jour si nouveaux patterns detectes

## Mode-Specific Rules
- Aucune modification de code — c'est un audit read-only
- Chaque agent SCAN produit un rapport structure avec findings priorises
- Le CONSOLIDATE merge et deduplique les findings
- Le REPORT produit les recommendations pour les prochains runs
