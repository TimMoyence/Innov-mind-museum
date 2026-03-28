# /rollback — Rollback atomique

Restaure l'etat precedent en cas de deploy echoue ou de regression detectee.

## ARGUMENTS

```
/rollback [--to <commit>] [--component api|frontend|web]
```

## PIPELINE

### Step 1 — Identifier le point de restauration

```bash
# Dernier deploy reussi (tag ou commit)
git log --oneline --grep="deploy" -5
git tag -l "v*" --sort=-creatordate | head -5

# Si --to specifie, utiliser le commit donne
git log --oneline <commit>
```

### Step 2 — Verifier l'etat actuel

```bash
# Tests passent-ils ?
cd museum-backend && pnpm test -- --bail 2>&1 | tail -5

# Typecheck OK ?
cd museum-backend && pnpm lint 2>&1 | tail -3

# Build OK ?
cd museum-backend && pnpm build 2>&1 | tail -3
```

Si tout passe, confirmer avec l'utilisateur avant de rollback (peut-etre pas necessaire).

### Step 3 — Executer le rollback

**IMPORTANT** : Toujours demander confirmation a l'utilisateur avant d'executer.

```bash
# Option A : Revert les commits (safe, preserve history)
git revert --no-commit <commit>..HEAD
git commit -m "revert: rollback to <commit> — [reason]"

# Option B : Reset soft (si branche locale uniquement)
git reset --soft <commit>
```

### Step 4 — Verification post-rollback

```bash
# Smoke test
cd museum-backend && pnpm lint && pnpm test -- --bail && pnpm build

# Si deploy : verifier que le serveur repond
curl -s http://localhost:3000/api/health
```

### Step 5 — Rapport

```
## /rollback Report
- Rollback from: <current-commit>
- Rollback to: <target-commit>
- Component: <api|frontend|web|all>
- Method: revert|reset
- Post-rollback health: PASS|FAIL
- Files affected: N
```

## INTEGRATION /team

Phase 7 VALIDER : si la validation post-deploy echoue, le Tech Lead peut invoquer `/rollback` pour restaurer.

## REGLES

1. TOUJOURS demander confirmation utilisateur avant rollback
2. Preferer `git revert` (preserve history) a `git reset` (destructif)
3. Verifier post-rollback (tests + typecheck + build)
4. Ne JAMAIS force push sur main sans approbation explicite
