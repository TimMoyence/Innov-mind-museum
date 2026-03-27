# Quality Ratchet

Les metriques de qualite ne peuvent **jamais regresser** entre runs.

## Metriques a Cliquet

| Metrique | Direction | Verification |
| -------- | --------- | ------------ |
| Nombre total de tests | ↑ uniquement | Le run ne peut pas supprimer de tests sans justification |
| Coverage statements | ↑ ou = | La coverage ne peut pas baisser |
| Coverage branches | ↑ ou = | La coverage ne peut pas baisser |
| Erreurs typecheck | ↓ uniquement | Le run ne peut pas introduire de nouvelles erreurs de type |
| `as any` count tests | ↓ uniquement | Le run ne peut pas augmenter le nombre de `as any` |
| Lint violations | ↓ uniquement | Le run ne peut pas introduire de nouvelles violations lint |

## Fonctionnement

1. **Pre-flight** capture la baseline des metriques
2. **Post-run** mesure les memes metriques
3. **La Sentinelle compare** : si regression → **FAIL**
4. **Exception** : regression acceptee si l'utilisateur valide explicitement (ex: suppression module = moins de tests)

## Baseline Persistee

Le fichier `.claude/quality-ratchet.json` stocke la baseline :

```json
{
  "lastUpdated": "2026-03-27",
  "testCount": 1054,
  "typecheckErrors": 0,
  "asAnyCount": 0,
  "coverageStatements": 52.45,
  "coverageBranches": 0,
  "lintErrors": 0
}
```

Le hook `ratchet-check.sh` compare automatiquement et bloque le commit si regression.
Mode **write-on-improve** : si une metrique s'ameliore, la baseline est mise a jour automatiquement.

## Mesure

```bash
# Test count backend
cd museum-backend && pnpm test 2>&1 | grep -E "Tests:|Test Suites:"

# Coverage
cd museum-backend && pnpm test -- --coverage --coverageReporters=text-summary 2>&1 | grep -E "Statements|Branches|Functions|Lines"

# as any count dans les tests
grep -r "as any" museum-backend/tests/ --include="*.ts" | wc -l

# Typecheck errors
cd museum-backend && pnpm lint 2>&1 | grep "error TS" | wc -l
```

## Integration Hooks

Le pre-commit-gate (`hooks/pre-commit-gate.sh`) appelle automatiquement le ratchet-check avant chaque commit. Un commit qui fait regresser une metrique est **bloque**.
