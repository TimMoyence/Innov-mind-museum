# /test-writer — Generateur de tests cible

Genere des tests pour les fichiers modifies. Standalone ou integre dans /team Phase 2.5.

## ARGUMENTS

```
/test-writer [path|scope]    # fichier, dossier, ou "changed" pour git diff
```

## PIPELINE

### Step 1 — Identifier les fichiers cibles

```bash
# Si argument = "changed" ou absent
git diff --name-only HEAD | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '__tests__'

# Si argument = chemin specifique
# Utiliser le chemin directement
```

### Step 2 — Classifier par type de test

Pour chaque fichier modifie, determiner le niveau de test :

| Pattern fichier | Projet | Niveau | Framework | Template |
|----------------|--------|--------|-----------|----------|
| `*.useCase.ts` | backend | Unit | Jest | mock repos via `jest.Mocked<T>`, test `execute()` happy + error |
| `*.service.ts` | backend | Integration | Jest | `buildTestService()` factory, test orchestration |
| `*.route.ts` | backend | Contract | Jest + supertest | HTTP request, verify status + body schema |
| `*.entity.ts` | backend | Skip | - | Pas de test direct (teste via use case) |
| `use*.ts` (hook) | frontend | L2 | jest-expo | `renderHook`, `act`, `waitFor` |
| `*.tsx` (composant) | frontend | L3 | jest-expo | `render`, `fireEvent`, `screen` |
| `tests/*.test.ts` | frontend | L1 | node:test | `describe`, `it`, `assert` |
| `*.test.tsx` | web | Component | Vitest | `render`, `screen`, RTL |
| `src/lib/*.ts` | web | Unit | Vitest | `describe`, `it`, `expect` |

### Step 3 — Generer les tests

Pour chaque fichier :

1. **Lire le fichier source** completement
2. **Identifier les branches** : if/else, switch, try/catch, early returns
3. **Generer** : 1 test happy path + 1 test par error path + 1 test edge case
4. **Pattern TDD** : le test DOIT echouer si on reverte le code (pas de test tautologique)
5. **Conventions** :
   - `jest.Mocked<T>` pour les mocks (PE-001) — JAMAIS `as any`
   - `tsc --noEmit` DOIT passer avant de declarer vert (PE-003)
   - Nommage : `kebab-case.test.ts`
   - Structure : describe > it (description comportementale en anglais)

### Step 4 — Executer les tests scopes

```bash
# Backend
cd museum-backend && pnpm test -- --bail --testPathPattern=<test-file>

# Frontend L1
cd museum-frontend && npm test -- --test-path-pattern=<test-file>

# Frontend L2/L3
cd museum-frontend && npx jest --config jest.config.js <test-file>

# Web
cd museum-web && pnpm test -- <test-file>
```

### Step 5 — Rapport

```
## /test-writer Report
- Files analyzed: N
- Tests generated: N (unit: X, integration: Y, component: Z)
- Tests passing: N/N
- Coverage delta: +X.X%
- Skipped (no test needed): [list with reason]
```

## INTEGRATION /team

Phase 2.5 REGRESSION : si les agents DEV n'ont pas livre de tests pour les fichiers modifies, le Tech Lead invoque `/test-writer changed` comme fallback.

## REGLES

1. JAMAIS de test sans assertion concrete (`expect(x).toBe(y)`, pas `toBeTruthy()`)
2. JAMAIS de `as any` dans les mocks — `jest.Mocked<T>` obligatoire
3. tsc --noEmit DOIT passer sur les fichiers test crees
4. Un test qui passe meme si on supprime le code teste = test inutile = FAIL
