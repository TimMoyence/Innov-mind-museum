# Template: Standard

Pipeline intermediaire pour les features ciblees, refactors, bugs complexes.

**Criteres :** 6-20 fichiers, ou multi-scope, ou interface publique modifiee.
**Contexte :** ~600 lignes chargees.

---

## TASK GRAPH

### Single-scope (backend-only ou frontend-only)

```
T1: COMPRENDRE      (blockedBy: rien)
T2: PLANIFIER        (blockedBy: T1)
T3: CHALLENGER       (blockedBy: T2)
T4: DEVELOPPER       (blockedBy: T3)
T5: VERIFIER         (blockedBy: T4)
T6: TESTER           (blockedBy: T5)     ← si coverage gap
T7: LIVRER           (blockedBy: T5 ou T6)
```

### Multi-scope (backend + frontend)

```
T1: COMPRENDRE       (blockedBy: rien)
T2: PLANIFIER         (blockedBy: T1)
T3: CHALLENGER        (blockedBy: T2)
T4: DEV-backend       (blockedBy: T3)
T5: DEV-frontend      (blockedBy: T3)     ← parallele avec T4
T6: VERIFIER          (blockedBy: T4, T5)
T7: TESTER            (blockedBy: T6)     ← si coverage gap
T8: LIVRER            (blockedBy: T6 ou T7)
```

## PHASES

### Phase 0 — COMPRENDRE

```
1. Lire les fichiers concernes
2. gitnexus_query({query: "<sujet>"}) → comprendre les execution flows
3. Si scope depasse 20 fichiers → AUTO-ESCALADE vers enterprise
4. Identifier: single-scope ou multi-scope
```

### Phase 1 — PLANIFIER

```
1. Lister les fichiers a modifier avec les changements prevus
2. Estimer le nombre de lignes (pour validation pipeline)
3. Notification utilisateur (pas approbation bloquante sauf autonomie L1)
```

### Phase 1.5 — CHALLENGER

```
1. Si skill /challenger disponible → deleguer (token-budgete: max 10 fichiers, verdict en 5 lignes si clean)
2. Sinon inline: verifier architecture, regression potentielle, coherence
3. Max 1 appel GitNexus (gitnexus_impact sur le symbole le plus critique)
```

### Phase 2 — DEVELOPPER

**Single-scope :**
```
1. Spawner 1 agent DEV avec mandat complet
2. Mandat inclut: section COHERENCE IMPORTS (cf. import-coherence.md)
3. Injecter PE pertinents (filtre inject_when)
4. Injecter EP unfixed pertinents
5. Post-agent: scoped tsc (cf. import-coherence.md niveau 2)
```

**Multi-scope :**
```
1. Spawner 2 agents DEV en parallele (run_in_background: true)
2. Chaque mandat inclut: section COHERENCE IMPORTS
3. Quand agent A termine → scoped tsc sur ses fichiers + dependants d=1
4. Quand agent B termine → scoped tsc sur ses fichiers + dependants d=1
5. Si conflit inter-agents (tsc FAIL sur fichiers non modifies) → Tech Lead resout
```

### Phase 3 — VERIFIER (Gate Sentinelle legere)

```
1. tsc global (backend + frontend)
2. Tests complets (pnpm test / npm test)
3. Quality Ratchet check
4. Scope check (fichiers modifies vs scope attendu)
5. gitnexus_detect_changes({scope: "staged"}) → verifier scope
6. Envoyer rapport a Sentinelle → verdict PASS/WARN/FAIL
```

### Phase 4 — TESTER (conditionnel)

```
Execute SEULEMENT si coverage gap detecte a Phase 3.
1. Identifier les chemins non couverts
2. Spawner qa-engineer pour ecrire les tests manquants
3. Re-run tests
```

### Phase 5 — LIVRER

```
1. Quality Ratchet: write-on-improve si amelioration
2. git add + commit
3. velocity-metrics.json: {pipeline: "standard", duration, files, agents, escalated}
4. error-patterns.json: enregistrer toute boucle corrective
5. Sprint tracking si applicable
```

## DoD

- [ ] tsc PASS (backend + frontend)
- [ ] Tests PASS (pas de regression, nouveaux tests si coverage gap)
- [ ] Quality Ratchet: pas de regression
- [ ] Import coherence: 0 erreur tsc post-agent
- [ ] Sentinelle: verdict PASS
- [ ] Code commite
- [ ] velocity-metrics mis a jour
