# SDLC Cycle — Pipeline 10 Phases

## Cycle Iteratif

```
                         Error Budget Gate (pre-flight)
                                    │
                                    ▼
┌────────────┐  ┌───────────┐  ┌────────────┐  ┌───────────┐  ┌────────────┐
│ COMPRENDRE │─▶│ PLANIFIER │─▶│ CHALLENGER │─▶│ DEVELOPPER│─▶│ REGRESSION │
│  Phase 0   │  │  Phase 1  │  │ Phase 1.5  │  │  Phase 2  │  │ Phase 2.5  │
└────────────┘  └───────────┘  └─────┬──────┘  └───────────┘  └─────┬──────┘
                                     │                               │
                                  [USER]                             ▼
                                  valide                ┌──────────────────┐
                                                        │    VERIFIER      │
                                                        │    Phase 3       │
                                                        └───────┬──────────┘
      ┌─────────────────────────────────────────────────────────┘
      ▼
┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  TESTER  │─▶│ VIABILITE │─▶│ CLEANUP  │─▶│  LIVRER  │─▶│ VALIDER  │
│ Phase 4  │  │ Phase 4.5 │  │ Phase 5  │  │ Phase 6  │  │ Phase 7  │
└──────────┘  └───────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Boucle principale** : DEV → REGRESSION → VERIFIER → TESTER → (OK → CLEANUP → LIVRER → VALIDER | FAIL → DEV)
**Boucle structurelle** : Si Verifier ou Tester revele un probleme de design → retour en COMPRENDRE
**Compteur de boucles** : max 3 iterations avant escalade utilisateur

---

## Error Budget Gate (Pre-flight)

> **AVANT Phase 0, le pre-flight evalue l'Error Budget (cf. error-budget-gate.json). Si tsc > 0 ou ratchet regression → mode force 'bug'.**

`Cf. team-protocols/error-budget-gate.json`

Le pre-flight est execute AVANT toute phase. Il mesure la sante du repo et peut forcer un changement de mode si le budget erreur est depasse.

---

## Phase Contracts

| Phase       | Pre-conditions                                                  | Post-conditions                                                       |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| COMPRENDRE  | Demande utilisateur claire, mode detecte, error budget OK       | Scope identifie, fichiers listes, recommandations pendantes connues   |
| PLANIFIER   | Analyse validee (Porte 0 PASS)                                  | Plan complet, estimation S/M/L avec correction factor, criteres definis |
| CHALLENGER  | Plan valide (Porte 1 PASS), 5+ fichiers impactes               | Plan challenge, risques reevalues, **utilisateur a valide**           |
| DEVELOPPER  | Plan valide par l'utilisateur                                   | Code implemente, lint+prettier par agent, Checkpoint 1 PASS          |
| REGRESSION  | Dev valide (Checkpoint 1 PASS)                                  | Tests manquants identifies et ecrits via /test-writer                |
| VERIFIER    | Regression couverte (Porte 2.5 PASS)                            | eslint --quiet PASS, /security-scan PASS, SAST PASS (Checkpoint 2)   |
| TESTER      | Verification validee (Checkpoint 2 PASS)                        | Tests integres PASS, couverture maintenue, ratchet check OK          |
| VIABILITE   | Tests valides (Porte 4 PASS)                                    | Product Viability Gate PASS (cf. product-viability-gate.json)        |
| CLEANUP     | Viabilite validee (Porte 4.5 PASS)                              | prettier --write + eslint --fix batch, dead code supprime            |
| LIVRER      | Cleanup valide (Porte 5 PASS)                                   | Commit granulaire (max 500 insertions), sprint tracking a jour       |
| VALIDER     | Livraison validee (Porte 6 PASS)                                | /test-routes PASS, smoke test, KB update, rapport Sentinelle         |

---

## Phase 0 — COMPRENDRE

**Objectif** : Comprendre le contexte, le code existant, les besoins. `/verify-schema` si DB impactee.

**Pre-condition** : Demande utilisateur claire, mode detecte, Error Budget Gate PASS (sinon mode force 'bug').
**Output** : Analyse structuree (scope, modules, fichiers, risques, baseline).
**Gate** : Sentinelle verifie que le scope est identifie, les fichiers listes, les recommandations pendantes prises en compte. FAIL si scope flou ou fichiers manquants.

**Trois perspectives** :
1. **Code** — Lire les fichiers pertinents, comprendre l'etat actuel
2. **QA** — Quels tests existent ? Quelle couverture ? Quels gaps ?
3. **Produit** — Que demande l'utilisateur ? Quel est le business value ?

**Actions** :
1. Executer le Pre-flight Check (cf. `quality-gates.md`) + Error Budget Gate (cf. `error-budget-gate.json`)
2. Si DB impactee → `/verify-schema` pour audit schema TypeORM
3. Lire les fichiers impactes (Tech Lead directement — pas d'agent)
4. Scanner le sprint context (`PROGRESS_TRACKER.md`, `SPRINT_LOG.md`)
5. Lire le dernier rapport Sentinelle pour recommandations pendantes
6. Si scope large → spawner agents specialises
7. Resumer : mode, scope, modules, fichiers, risques, recommandations, baseline

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
  Error Budget: [OK|EXCEEDED] (cf. error-budget-gate.json)

Tests existants: [couverture actuelle du scope]
Recommandations pendantes (Sentinelle): [si applicable]
Questions ouvertes: [si il y en a]
```

→ **PORTE SENTINELLE 0** : SendMessage a la Sentinelle. Attendre verdict.

---

## Phase 1 — PLANIFIER

**Objectif** : Plan d'implementation complet + estimation avec correction factor.

**Pre-condition** : Phase 0 validee (Porte 0 PASS).
**Output** : Plan detaille avec estimation ajustee (S:1.0, M:1.1, L:1.4).
**Gate** : Sentinelle verifie completude du plan (fichiers, tests, risques, estimation). FAIL si estimation manquante ou scope incomplet.

Contenu obligatoire :
1. Scope : backend/frontend/full-stack
2. Fichiers a creer : chemin + description + taille estimee
3. Fichiers a modifier : chemin + nature
4. Tests a ecrire : quels tests, combien
5. Migrations si applicable
6. Risques et mitigations
7. Estimation de complexite S/M/L avec **correction factor** :
   - **S** (Small) : facteur **1.0** — estimation directe
   - **M** (Medium) : facteur **1.1** — 10% buffer
   - **L** (Large) : facteur **1.4** — 40% buffer pour imprevu
8. Criteres de succes
9. Recommandations Sentinelle a appliquer

→ **PORTE SENTINELLE 1** : Plan complet ? Estimation coherente ?

---

## Phase 1.5 — CHALLENGER

**Objectif** : Challenge du plan en mode code-reviewer si 5+ fichiers impactes.

**Pre-condition** : Plan valide (Porte 1 PASS). Declenche si **5+ fichiers** dans le plan.
**Output** : Plan challenge avec risques reevalues, alternatives considerees.
**Gate** : Sentinelle verifie que le challenge a ete effectue. FAIL si 5+ fichiers et pas de challenge.

**Actions** :
1. Activer le mode **code-reviewer challenger** sur le plan
2. Questionner chaque fichier : est-il necessaire ? Y a-t-il une alternative plus simple ?
3. Verifier la coherence architecturale (hexagonale backend, feature-driven frontend)
4. Reevaluer les risques post-challenge
5. Identifier les simplifications possibles

> ⛔ **BLOQUANT** : NE PAS CONTINUER sans **USER APPROVAL** apres le challenge.
> Exception : hotfix, bug evident.

→ **PORTE SENTINELLE 1.5** : Challenge effectue ? Utilisateur a valide ?

---

## Phase 2 — DEVELOPPER

**Objectif** : Implementer selon le plan valide. Agents paralleles avec lint+prettier par agent.

**Pre-condition** : Plan valide par l'utilisateur (apres Phase 1 ou 1.5 selon le nombre de fichiers).
**Output** : Code implemente, chaque agent a fait lint+prettier sur son scope. Checkpoint 1 PASS.
**Gate** : Sentinelle verifie que le code est implemente, lint+prettier par agent, pipeline results, erreurs classifiees. FAIL si typecheck FAIL ou lint non execute par agent.

**Actions** :
1. Impact Analysis sur les fichiers du plan
2. Spawner agents dev avec **mandats formels** (cf. `agent-mandate.md`)
3. Agents en **parallele reel** via Agent Teams (backend ⫽ frontend ⫽ api)
4. Chaque agent fait **lint + prettier** sur son scope (self-verification)
5. Chaque agent remet rapport structure

**Verification Tech Lead** :
1. Lire chaque fichier modifie
2. Executer Verification Pipeline complet (cf. `quality-gates.md`)
3. Classifier erreurs (cf. `error-taxonomy.md`)

→ **CHECKPOINT 1** : SendMessage avec fichiers, pipeline results, erreurs classifiees, ratchet delta.

---

## Phase 2.5 — REGRESSION

**Objectif** : Shift-left — identifier et ecrire les tests manquants immediatement apres DEV.

**Pre-condition** : Checkpoint 1 PASS (Phase 2 validee).
**Output** : Tests manquants identifies et ecrits via `/test-writer`. Couverture du nouveau code assuree.
**Gate** : Sentinelle verifie que chaque nouveau use case a au moins 1 test. FAIL si nouveau code sans test.

**Actions** :
1. Analyser le delta de code (fichiers nouveaux/modifies)
2. Identifier les tests manquants pour le nouveau code
3. Si tests manquants → spawner `/test-writer` pour generer les tests cibles
4. Executer les nouveaux tests — ils doivent PASS
5. Verifier : chaque use case a 1+ test

→ **PORTE SENTINELLE 2.5** : Tests manquants ecrits ? Couverture du nouveau code ?

---

## Phase 3 — VERIFIER

**Objectif** : Gate qualite — eslint --quiet + security scan sur fichiers changes.

**Pre-condition** : Phase 2.5 validee (tests manquants ecrits).
**Output** : eslint --quiet PASS, /security-scan changed PASS. Checkpoint 2.
**Gate** : Sentinelle verifie eslint --quiet 0 erreurs et security scan clean. FAIL si erreur eslint ou vulnerabilite detectee.

**Actions** :
1. Executer `eslint --quiet` sur tous les fichiers changes
2. Executer `/security-scan changed` sur les fichiers modifies
3. Si erreurs eslint → corriger immediatement (pas de report)
4. Si vulnerabilite security → corriger ou escalader
5. SAST Pipeline (en parallele) :
   a. `/semgrep` sur fichiers changes → findings
   b. `/vulnerability-scanner` sur fichiers changes → OWASP findings
   c. Si security-sensitive : `/codeql` sur modules impactes
   d. Si package.json modifie : `/supply-chain-auditor`
6. Consolider /security-scan + SAST → rapport unifie pour Sentinelle

→ **CHECKPOINT 2** : eslint --quiet PASS + /security-scan clean + SAST clean.

---

## Phase 4 — TESTER

**Objectif** : Tests integres, couverture, ratchet check.

**Pre-condition** : Checkpoint 2 PASS (eslint + security clean).
**Output** : Tous tests PASS, couverture maintenue, ratchet check OK.
**Gate** : Sentinelle verifie 0 fail, couverture >= baseline, ratchet non-regression. FAIL si regression ou couverture en baisse.

**Actions** :
1. Executer TOUS les tests backend + frontend
2. Typecheck complet
3. Verifier la couverture vs baseline
4. Ratchet check : pas de regression sur les metriques

**Criteres obligatoires** :
- [ ] Tous tests passent (0 fail)
- [ ] Verification Pipeline PASS
- [ ] Chaque use case a 1+ test
- [ ] Pas de `.skip` injustifie
- [ ] Quality Ratchet respecte
- [ ] Si museum-web en scope : browser-use smoke test PASS
- [ ] obra/verification-before-completion checklist satisfait

**Phase 4b — SMOKE TEST API** (si routes modifiees) :
- `pnpm smoke:api` ou supertest inline (200, 401, 422)

→ **PORTE SENTINELLE 4** : Tests ecrits, pipeline, ratchet delta, criteres de passage.

---

## Phase 4.5 — VIABILITE

**Objectif** : Product Viability Gate — verifier que le livrable est viable en production.

**Pre-condition** : Phase 4 validee (tous tests PASS, ratchet OK).
**Output** : Product Viability Gate PASS.
**Gate** : Sentinelle evalue les criteres de viabilite produit. FAIL si critere bloquant non satisfait.

`Cf. team-protocols/product-viability-gate.json`

**Actions** :
1. Evaluer les criteres du Product Viability Gate
2. Verifier la coherence produit (la feature repond-elle au besoin ?)
3. Verifier l'impact UX (pas de regression UX)
4. Verifier les dependances (pas de dette technique injustifiee)
5. Si FAIL → retour en Phase 2 (DEVELOPPER) avec les corrections requises
6. Si museum-web modifie : browser-use visual verification
7. obra/verification-before-completion : checklist finale

→ **PORTE SENTINELLE 4.5** : Product Viability Gate result.

---

## Phase 5 — CLEANUP

**Objectif** : Nettoyage final — prettier + eslint --fix batch sur TOUS fichiers + dead code.

**Pre-condition** : Phase 4.5 validee (viabilite PASS).
**Output** : Code formate, lint clean, dead code supprime.
**Gate** : Sentinelle verifie que prettier et eslint --fix ont ete executes sur tous les fichiers modifies. FAIL si formatage inconsistant ou dead code restant.

**Actions** :
1. `prettier --write` sur TOUS les fichiers modifies
2. `eslint --fix` batch sur TOUS les fichiers modifies
3. Identifier et supprimer le dead code (imports inutiles, variables non utilisees, fonctions orphelines)
4. Verifier que le cleanup n'a pas casse de tests (re-run rapide)

→ **PORTE SENTINELLE 5** : Cleanup complet ? Formatage uniforme ?

---

## Phase 6 — LIVRER

**Objectif** : Commit granulaire (max 500 insertions) + sprint tracking.

**Pre-condition** : Phase 5 validee (cleanup PASS).
**Output** : Commit(s) structure(s), sprint tracking mis a jour.
**Gate** : Sentinelle verifie que chaque commit <= 500 insertions, message conforme, sprint tracking a jour. FAIL si commit trop gros ou tracking manquant.

**Actions** :
1. Commit structure — **max 500 insertions par commit**. Si plus → decouper en commits granulaires logiques.
2. Si API : `pnpm openapi:validate` + contract tests + `npm run generate:openapi-types`
3. **CI Dry-Run** (NON NEGOCIABLE) :
   ```bash
   cd museum-backend && pnpm lint && pnpm test && pnpm build
   cd museum-frontend && npm run lint && npm test
   ```
4. Sprint Tracking : PROGRESS_TRACKER.md + SPRINT_LOG.md

**Sprint Tracking Gate** (AM-004) : Sentinelle verifie que `docs/V1_Sprint/PROGRESS_TRACKER.md` et `SPRINT_LOG.md` sont mis a jour avec les items du run courant. FAIL si manquant.

**Rollback Plan** (obligatoire) :
```
Commit: [hash]
Fichiers modifies: [liste]
Revert command: git revert [hash]
Migration a reverter: [nom] ou "aucune"
```

→ **PORTE SENTINELLE 6** : Commits conformes ? Sprint tracking a jour ?

---

## Phase 7 — VALIDER

**Objectif** : Validation finale — /test-routes + smoke test + feedback loop → KB update.

**Pre-condition** : Phase 6 validee (commits crees, tracking a jour).
**Output** : Validation comportementale PASS, smoke test OK, KB mise a jour, rapport Sentinelle final.
**Gate** : Sentinelle verifie /test-routes PASS, smoke test OK, KB update effectue. FAIL si route cassee ou KB non mise a jour.

**Actions** :
1. `/test-routes` — validation comportementale des endpoints API
2. Smoke test si applicable (`pnpm smoke:api`)
3. Feedback loop : identifier les apprentissages du run
4. KB update : mettre a jour la knowledge base avec les decisions et patterns
5. Rapport Sentinelle final → `team-reports/YYYY-MM-DD.md`
6. obra/verification-before-completion : derniere passe verification

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
| `hotfix` | Phase 0 EXPRESS → Phase 2 → Phase 4 MINIMAL → Phase 6 FAST | Pas de gate architecture, skip 1/1.5/2.5/3/4.5/5/7 |
| `mockup` | Phase 0 → Phase 1 → Phase 1.5 → Phase 2 UI → UX Review | Pas de tests/deploy, skip 2.5/3/4/4.5/6/7 |
| `chore` | Phase 0 LIGHT → Phase 2 TARGETED → Phase 6 IF_NEEDED | Review LIGHT si code, skip 1/1.5/2.5/4.5/5/7 |
| `bug` | Phase 0 FOCUSED → Phase 1 LIGHT → Phase 2 → Phase 2.5 REGRESSION → Phase 4 → Phase 6 | Skip 1.5/4.5/5/7 |
