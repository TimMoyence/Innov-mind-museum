# Quality Gates — Verification Pipeline & Pre-flight

## Lint + Prettier — 3 Checkpoints

### Checkpoint 1 — Agent Mandate
Chaque agent DEV doit linter ses fichiers modifies avant soumission. Instruction explicite dans le mandat:
"Apres chaque Edit/Write: `npx prettier --write {file} && npx eslint --fix {file}`"

### Checkpoint 2 — Chaque Gate
Pre-check a chaque gate: `eslint --quiet $(git diff --name-only)`.
Si erreurs lint → FAIL avant meme le typecheck.

### Checkpoint 3 — Phase 5 CLEANUP
Batch final sur TOUS les fichiers modifies du run:
```bash
git diff --name-only HEAD~1 -- '*.ts' '*.tsx' | xargs npx prettier --write
git diff --name-only HEAD~1 -- '*.ts' '*.tsx' | xargs npx eslint --fix
```
Filet de securite si un hook a rate pendant le DEV.

---

## Quality Gates Non Negociables

Ces criteres causent un **FAIL automatique** a n'importe quelle porte post-DEV :

1. **tsc --noEmit fail** → FAIL. Pas de code qui ne typecheck pas. Jamais.
2. **Tests casses** → FAIL. Aucun test existant ne doit regresser.
3. **Recommandation CRITIQUE ignoree** → FAIL (cf. escalade dans `finalize.md`).
4. **Scope creep** → FAIL. Le dev doit suivre le plan valide.
5. **Faux positif rapporte comme vrai** → FAIL pour l'agent concerne.

---

## Pre-flight Check (Phase 0)

**Avant tout run**, le Tech Lead etablit la baseline du codebase.

```bash
# Backend
cd museum-backend && pnpm lint 2>&1        # typecheck baseline
cd museum-backend && pnpm test 2>&1        # tests baseline

# Frontend
cd museum-frontend && npm run lint 2>&1    # typecheck baseline
cd museum-frontend && npm test 2>&1        # tests baseline
```

**Output** :
```
## Pre-flight — [date]
Typecheck backend: PASS/FAIL [N erreurs pre-existantes]
Typecheck frontend: PASS/FAIL [N erreurs pre-existantes]
Tests backend: N pass / N fail / N skip
Tests frontend: N pass / N fail / N skip
Erreurs pre-existantes: [liste si applicable]
```

**Regles** :
- Erreurs pre-existantes ne sont **pas imputees** aux agents
- Elles sont **trackees** — le run ne doit pas en ajouter
- Si codebase degrade → signaler a l'utilisateur avant de commencer
- La Sentinelle recoit le pre-flight dans son contexte initial

---

## Verification Pipeline (3 etapes)

```
Etape 1: LINT    — ESLint + auto-fix
Etape 2: TYPE    — tsc --noEmit (type safety)
Etape 3: TEST    — Jest/node:test scope au module
```

### Commandes Backend (`cd museum-backend`)

| Etape | Commande | Cible |
| ----- | -------- | ----- |
| LINT  | `pnpm lint` | typecheck (tsc --noEmit) |
| TYPE  | `pnpm lint` | typecheck complet |
| TEST scope | `pnpm test -- --testPathPattern=tests/unit/<module>/` | module modifie |
| TEST full | `pnpm test` | tous les tests |

### Commandes Frontend (`cd museum-frontend`)

| Etape | Commande | Cible |
| ----- | -------- | ----- |
| LINT  | `npm run lint` | typecheck (tsc --noEmit) |
| TYPE  | `npm run lint` | typecheck |
| TEST  | `npm test` | tous les tests |

### Quand Executer

| Moment | Etapes | Qui |
| ------ | ------ | --- |
| Apres chaque fichier modifie (pendant DEV) | LINT + TYPE | Agent dev (self-verification) |
| Apres chaque module complete | LINT + TYPE + TEST scope | Agent dev |
| Avant chaque porte Sentinelle (post-DEV) | LINT + TYPE + TEST full | Tech Lead |
| Apres ecriture de chaque test | TEST scope (le test seul) | QA Engineer |
| Avant SHIP | LINT + TYPE + TEST full + BUILD | Tech Lead |

---

## Impact Analysis

Avant de modifier un fichier, identifier ses **dependants** :

```bash
rg "from.*<module-path>" museum-backend/src/ --files-with-matches
rg "import.*<module-path>" museum-backend/src/ --files-with-matches
```

Si fichier partage (ex: `@shared/errors/app.error.ts`) modifie → blast radius large → TEST full.

---

## Agent Self-Verification

Chaque agent DOIT verifier son travail **avant remise** au Tech Lead.

### Protocole

1. Lister fichiers modifies/crees
2. Executer LINT + TYPE sur chaque fichier modifie
3. Executer TEST scope sur modules impactes
4. Verifier recommandations Sentinelle appliquees
5. Reporter rapport structure :

```
## Self-Verification — Agent [Nom]

### Fichiers modifies
- [chemin] — [description]

### Verification Pipeline
LINT: PASS/FAIL [erreurs]
TYPE: PASS/FAIL [erreurs TS avec code]
TEST scope: PASS/FAIL [N pass, N fail]

### Recommandations Sentinelle
- [recommandation] : appliquee/non-appliquee [detail]

### Erreurs residuelles
[liste avec Error Taxonomy si applicable]
```

**Regle** : Agent sans self-verification → score Sentinelle baisse. Agent avec typecheck FAIL → echec de mandat.

---

## Pyramide de Tests Frontend

```
L4: Flows E2E (Detox/Maestro)          ← FUTUR
L3: Composants (jest-expo/render)       ← A DEVELOPPER
L2: Hooks (jest-expo/renderHook)        ← PARTIEL
L1: Fonctions pures (node:test)         ← FAIT (90 tests)
```

| Niveau | Quand tester | Comment | Priorite |
|--------|-------------|---------|----------|
| L1 | Toute fonction pure modifiee | `node:test` | Toujours |
| L2 | Tout hook React modifie/cree | `jest-expo` + `renderHook` | Si hook modifie |
| L3 | Composant UI critique modifie | `jest-expo` + `render` | Feature/refactor UI |
| L4 | Parcours complet | Detox ou Maestro | Pre-release |
