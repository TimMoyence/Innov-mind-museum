# SDLC Cycle — Les 7 Phases

## Cycle Iteratif

```
┌──────────┐    ┌────────┐    ┌──────┐    ┌─────┐
│ ANALYSE  │───▶│ DESIGN │───▶│ PLAN │───▶│ DEV │
└──────────┘    └────────┘    └──────┘    └──┬──┘
     ▲              ▲            │            │
     │              │         [USER]          ▼
     │              │         valide      ┌────────┐
     │              │                     │ REVIEW │
     │              │                     └───┬────┘
     │              │                         │
     │              │               ┌─FAIL────┘──OK──┐
     │              │               │                 ▼
     │              │               │            ┌───────┐
     │              │               └──▶ DEV ◀───┤ TEST  │
     │              │                    ▲       └───┬───┘
     │              │                    │           │ OK
     │              │                    └── FAIL ───┘
     │              │                                │ OK
     │              │                            ┌──────┐
     │              │                            │ SHIP │
     │              │                            └──────┘
     │              │
     └──────────────┴──── (si le probleme est structurel)
```

**Boucle principale** : DEV → REVIEW → TEST → (OK → SHIP | FAIL → DEV)
**Boucle structurelle** : Si Review ou Test revele un probleme de design → retour en DESIGN
**Compteur de boucles** : max 3 iterations avant escalade utilisateur

---

## Phase Contracts

| Phase    | Pre-conditions                                      | Post-conditions                                                       |
| -------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| ANALYSE  | Demande utilisateur claire, mode detecte            | Scope identifie, fichiers listes, recommandations pendantes connues   |
| DESIGN   | Analyse validee (Porte 1 PASS)                      | Architecture coherente, risques identifies, questions posees           |
| PLAN     | Design valide (Porte 2 PASS)                        | Plan complet, criteres de succes definis, **utilisateur a valide**    |
| DEV      | Plan valide par l'utilisateur                       | Code implemente, typecheck PASS, tests existants PASS                |
| REVIEW   | Dev valide (Porte 3 PASS)                           | Code review PASS, QA PASS, conformite produit PASS                   |
| TEST     | Review validee (Porte 4 PASS)                       | Nouveaux tests ecrits et PASS, typecheck PASS, 0 regression          |
| SHIP     | Tests valides (Porte 5 PASS)                        | Commit, build OK, sprint tracking mis a jour                          |

---

## Phase 1 — ANALYSE

**Objectif** : Comprendre le contexte, le code existant, les besoins.

**Trois perspectives** :
1. **Code** — Lire les fichiers pertinents, comprendre l'etat actuel
2. **QA** — Quels tests existent ? Quelle couverture ? Quels gaps ?
3. **Produit** — Que demande l'utilisateur ? Quel est le business value ?

**Actions** :
1. Executer le Pre-flight Check (cf. `quality-gates.md`)
2. Lire les fichiers impactes (Tech Lead directement — pas d'agent)
3. Scanner le sprint context (`PROGRESS_TRACKER.md`, `SPRINT_LOG.md`)
4. Lire le dernier rapport Sentinelle pour recommandations pendantes
5. Si scope large → spawner agents specialises
6. Resumer : mode, scope, modules, fichiers, risques, recommandations, baseline

**Adaptation par mode** :
- `feature` / `refactor` : scan complet
- `bug` : FOCUSED — localiser le probleme, cause racine
- `mockup` : ecrans/composants concernes, patterns UI existants
- `hotfix` : EXPRESS — cause racine en < 2 min
- `chore` : LIGHT — fichiers config/CI concernes

**Output** :
```
## Analyse — [Titre]
Mode: [mode]
Scope: [backend|frontend|full-stack|infra]
Modules impactes: [liste]
Fichiers a modifier: [liste avec lignes pertinentes]

Pre-flight baseline:
  Typecheck backend: PASS/FAIL [N erreurs pre-existantes]
  Tests backend: N pass / N fail / N skip
  as any count: N
  Erreurs pre-existantes: [liste]

Tests existants: [couverture actuelle du scope]
Recommandations pendantes (Sentinelle): [si applicable]
Questions ouvertes: [si il y en a]
```

→ **PORTE SENTINELLE 1** : SendMessage a la Sentinelle. Attendre verdict.

---

## Phase 2 — DESIGN

**Objectif** : Concevoir la solution technique.

**Modes concernes** : feature (FULL), mockup (FULL), refactor (FULL), bug (LIGHT). SKIP pour hotfix/chore.

**Actions** :
1. Si complexe → spawner architecte(s) backend/frontend
2. Coherence avec architecture existante (hexagonale backend, feature-driven frontend)
3. Identifier risques, migrations, nouvelles env vars
4. **Questions a l'utilisateur MAINTENANT** (pas apres)
5. Si API modifiee → verifier coherence spec/code/types

→ **PORTE SENTINELLE 2** : Design coherent ? Risques identifies ?

---

## Phase 3 — PLAN

**Objectif** : Plan d'implementation complet + validation utilisateur.

Contenu obligatoire :
1. Scope : backend/frontend/full-stack
2. Fichiers a creer : chemin + description + taille estimee
3. Fichiers a modifier : chemin + nature
4. Tests a ecrire : quels tests, combien
5. Migrations si applicable
6. Risques et mitigations
7. Estimation de complexite S/M/L
8. Criteres de succes
9. Recommandations Sentinelle a appliquer

> **BLOQUANT** : NE PAS CONTINUER sans feu vert utilisateur.
> Exception : hotfix, bug evident.

---

## Phase 4 — DEV

**Objectif** : Implementer selon le plan valide.

**Actions** :
1. Impact Analysis sur les fichiers du plan
2. Spawner agents dev avec **mandats formels** (cf. `agent-mandate.md`)
3. Agents en **parallele reel** via Agent Teams (backend ⫽ frontend ⫽ api)
4. Chaque agent fait self-verification (LINT + TYPE + TEST scope)
5. Chaque agent remet rapport structure

**Verification Tech Lead** :
1. Lire chaque fichier modifie
2. Executer Verification Pipeline complet (cf. `quality-gates.md`)
3. Classifier erreurs (cf. `error-taxonomy.md`)

→ **PORTE SENTINELLE 3** : SendMessage avec fichiers, pipeline results, erreurs classifiees, ratchet delta.

---

## Phase 5 — REVIEW

**Objectif** : Triple verification — code review + QA + conformite produit.

- **Code Review** : architecture hexagonale, conventions, duplication, `any`
- **QA Review** : fonctionnement, erreurs, edge cases
- **Product Review** : correspond a la demande ?

Si problemes : Code → retour DEV | Design → retour DESIGN

→ **PORTE SENTINELLE 4** : Code/QA/Product review results, erreurs, corrections demandees.

---

## Phase 6 — TEST

**Objectif** : Tests, execution, couverture.

1. Spawner QA Engineer pour ecrire tests
2. Couverture : happy path + error paths + regression
3. Executer TOUS les tests backend + frontend
4. Typecheck complet

**Criteres obligatoires** :
- [ ] Tous tests passent (0 fail)
- [ ] Verification Pipeline PASS
- [ ] Chaque use case a 1+ test
- [ ] Pas de `.skip` injustifie
- [ ] Quality Ratchet respecte

**Phase 6b — SMOKE TEST API** (si routes modifiees) :
- `pnpm smoke:api` ou supertest inline (200, 401, 422)

→ **PORTE SENTINELLE 5** : Tests ecrits, pipeline, ratchet delta, criteres de passage.

---

## Phase 7 — SHIP

**Objectif** : Livrable — commit, PR, deploy.

**Actions** :
1. Commit structure
2. Si API : `pnpm openapi:validate` + contract tests + `npm run generate:openapi-types`
3. **CI Dry-Run** (NON NEGOCIABLE) :
   ```bash
   cd museum-backend && pnpm lint && pnpm test && pnpm build
   cd museum-frontend && npm run lint && npm test
   ```
4. Sprint Tracking : PROGRESS_TRACKER.md + SPRINT_LOG.md
5. Proposer commit/PR

**Rollback Plan** (obligatoire) :
```
Commit: [hash]
Fichiers modifies: [liste]
Revert command: git revert [hash]
Migration a reverter: [nom] ou "aucune"
```

→ **PORTE SENTINELLE FINALE** : Rapport complet → `team-reports/YYYY-MM-DD.md`

---

## Definition of Done par Mode

### feature
- [ ] Code conforme au plan, tsc PASS, 0 regression
- [ ] Nouveaux tests (happy + error + edge), coverage maintenue
- [ ] Code review + Security review si applicable
- [ ] Si API : spec OpenAPI validee, contract tests, types regeneres
- [ ] Sprint tracking + rapport Sentinelle

### bug
- [ ] Cause racine identifiee, fix minimal, tsc PASS
- [ ] Test de regression ecrit, 0 regression

### refactor
- [ ] Transformation conforme, tsc PASS, 0 regression
- [ ] Code review PASS

### hotfix
- [ ] Fix chirurgical, tsc PASS, smoke test, deploy ready

### mockup
- [ ] UI conforme, navigation fonctionnelle, UX review

### chore
- [ ] Config/CI conforme, tsc + tests PASS si code modifie

---

## Raccourcis par Mode

| Mode | Phases | Notes |
|------|--------|-------|
| `hotfix` | Analyse EXPRESS → Dev → Test MINIMAL → Ship FAST | Pas de gate architecture |
| `mockup` | Analyse → Design → Plan → Dev UI → UX Review | Pas de tests/deploy |
| `chore` | Analyse LIGHT → Dev TARGETED → Ship IF_NEEDED | Review LIGHT si code |
| `bug` | Analyse FOCUSED → Plan LIGHT → Dev → Test REGRESSION → Ship | |
