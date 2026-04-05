# Template: Enterprise

Pipeline complet pour les features fullstack, migrations, refactors majeurs, audits.

**Criteres :** 20+ fichiers, cross-module, migration DB, security-sensitive.
**Contexte :** ~1200 lignes chargees (tous protocoles + tous KB).

---

## TASK GRAPH (feature-fullstack)

```
T1: COMPRENDRE       (blockedBy: rien)
T2: CONCEVOIR         (blockedBy: T1)
T3: CHALLENGER        (blockedBy: T2)
T4: PLANIFIER         (blockedBy: T3)      ← validation utilisateur
T5: DEV-backend       (blockedBy: T4)
T6: DEV-frontend      (blockedBy: T4)      ← parallele avec T5
T7: DEV-api           (blockedBy: T4)      ← parallele avec T5, T6
T8: REGRESSION        (blockedBy: T5, T6, T7)
T9: VERIFIER          (blockedBy: T8)
T10: TESTER           (blockedBy: T9)
T11: VIABILITE        (blockedBy: T10)
T12: CLEANUP          (blockedBy: T11)
T13: LIVRER           (blockedBy: T12)
```

## PHASES

### Phase 0 — COMPRENDRE

```
1. Lire les fichiers concernes
2. gitnexus_query({query: "<sujet>"}) → execution flows
3. gitnexus_context({name: "<symboles cles>"}) → 360-degree view
4. Lire le dernier rapport team-reports/ pour contexte
5. Lire next-run.json pour recommendations actives
```

### Phase 1 — CONCEVOIR

```
1. Design technique: architecture, interfaces, data flow
2. gitnexus_impact sur les symboles cles → blast radius
3. Si risk HIGH/CRITICAL → WARN utilisateur avant de continuer
4. Produire: liste des fichiers, interfaces entre agents, schema de donnees si migration

Gate Sentinelle: design coherent, blast radius accepte
```

### Phase 1.5 — CHALLENGER

```
1. Review architecturale approfondie (skill /challenger ou inline)
2. Verifier: pas de regression, coherence avec l'existant, edge cases
3. GitNexus: impact analysis sur les 3 symboles les plus critiques

Gate Sentinelle: pas de blocage architectural
```

### Phase 2 — PLANIFIER

```
1. Plan detaille avec task graph
2. Estimation par agent (fichiers, lignes, complexite)
3. Allocation dynamique: consulter agent-performance.json > specializations
   - avgScore > 9.0 → privilegier
   - avgScore < 7.0 (3+ runs) → eviter
4. VALIDATION UTILISATEUR BLOQUANTE (sauf hotfix, autonomie L3+)
```

### Phase 3 — DEVELOPPER (parallele reel)

```
1. Construire les mandats (cf. agent-mandate.md):
   - Section COHERENCE IMPORTS obligatoire
   - PE pertinents injectes (filtre inject_when)
   - EP unfixed injectes
   - Track Record agent injecte (weaknessHistory)
2. Spawner agents DEV en PARALLELE REEL:
   Agent(subagent_type: "backend-architect", team_name, run_in_background: true)
   Agent(subagent_type: "frontend-architect", team_name, run_in_background: true)
3. Quand chaque agent termine:
   a. Scoped tsc sur fichiers modifies + dependants d=1
   b. Si FAIL → renvoi au meme agent avec erreur exacte (max 2 retours)
   c. Si PASS → marquer comme complete
4. Quand tous les agents PASS → continuer
```

### Phase 3.5 — REGRESSION

```
1. Verifier que les chemins existants non modifies fonctionnent
2. Tests existants: doivent tous passer (0 regression)
3. Si regression detectee → identifier la cause, spawner agent de correction
```

### Phase 4 — VERIFIER (Gate Sentinelle)

```
1. tsc global (backend + frontend)
2. Tests complets
3. Quality Ratchet check
4. ESLint-disable scan (cf. quality-gates.md)
5. Scope check
6. gitnexus_detect_changes({scope: "staged"})

Gate Sentinelle: rapport structure, verdict PASS/WARN/FAIL
```

### Phase 5 — TESTER

```
1. Tests supplementaires si coverage gap
2. Smoke tests API si routes modifiees (1 happy + 1 auth + 1 validation par route)
3. Tests de non-regression specifiques

Gate Sentinelle: coverage non regresse, smoke tests OK
```

### Phase 5.5 — VIABILITE

```
Checklist produit (chaque agent DEV doit avoir verifie, mais le Tech Lead re-verifie):
- [ ] Donnees persistees (DB, pas juste state local)
- [ ] Edge cases (timeout, offline, permission refusee, payload invalide)
- [ ] UX coherente pour un utilisateur reel
- [ ] Retrocompatibilite API preservee (pas de breaking change)
- [ ] Migration reversible si applicable
```

### Phase 6 — CLEANUP

```
1. Supprimer dead code cree pendant le dev
2. Supprimer imports inutiles
3. Supprimer console.log de debug
4. Verifier nommage coherent
```

### Phase 7 — LIVRER (Gate Sentinelle finale)

```
1. tsc final (dernier filet)
2. Tests final
3. Quality Ratchet: write-on-improve
4. git add + commit
5. FINALIZE protocol (cf. finalize.md):
   a. Update error-patterns.json (toute boucle corrective = 1 entry)
   b. Update prompt-enrichments.json (scoring PE utilises ce run)
   c. Update agent-performance.json (score par agent, specializations)
   d. Update velocity-metrics.json (run metrics)
   e. Update next-run.json (recommendations pour le prochain run)
   f. Update autonomy-state.json (promotion/demotion si applicable)
6. Ecrire team-reports/YYYY-MM-DD.md (Executive Summary)
7. Update docs/V1_Sprint/ (PROGRESS_TRACKER + SPRINT_LOG)

Gate Sentinelle finale: DoD machine-verified (7 checks programmatiques)
```

## DoD

- [ ] tsc PASS (backend + frontend)
- [ ] Tests PASS (pas de regression + nouveaux tests)
- [ ] Quality Ratchet: pas de regression
- [ ] Import coherence: 0 erreur tsc post-agent
- [ ] Sentinelle: 4 verdicts PASS (CONCEVOIR, VERIFIER, TESTER, LIVRER)
- [ ] Viabilite: checklist produit validee
- [ ] KB: 7 fichiers JSON mis a jour
- [ ] Rapport: team-reports/ ecrit
- [ ] Sprint tracking: mis a jour
- [ ] Code commite
