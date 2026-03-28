# /test-routes — Validation comportementale des endpoints API

Teste les routes API contre le serveur local et compare avec la spec OpenAPI.

## PREREQUIS

Serveur backend en cours d'execution (`pnpm dev` ou equivalent).

## ARGUMENTS

```
/test-routes [module|"all"|"changed"]
```

## PIPELINE

### Step 1 — Collecter les routes

```bash
# Routes depuis la spec OpenAPI
jq '.paths | keys[]' museum-backend/openapi/openapi.json

# Routes depuis le code (cross-check)
grep -rn 'router\.\(get\|post\|put\|patch\|delete\)(' museum-backend/src/modules/ --include='*.ts'
```

Filtrer par module si argument specifie. Si "changed", croiser avec `git diff --name-only` pour ne tester que les routes modifiees.

### Step 2 — Generer les requetes

Pour chaque route, generer une requete de test :

| Methode | Body | Auth | Expected |
|---------|------|------|----------|
| GET | - | Bearer token si protege | 200 + schema match |
| POST | Payload minimal valide depuis la spec | Bearer token si protege | 201 ou 200 |
| PUT/PATCH | Payload valide | Bearer token | 200 |
| DELETE | - | Bearer token | 204 |

Pour les routes protegees, utiliser le token depuis `test.http` ou les variables d'environnement de test.

### Step 3 — Executer les requetes

```bash
# Exemple pour chaque route
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
curl -s http://localhost:3000/api/health | jq .
```

Verifier :
1. **Status code** correspond a la spec
2. **Response body** match le schema OpenAPI (structure, champs requis)
3. **Auth enforcement** : routes protegees retournent 401 sans token

### Step 4 — Rapport

```
## /test-routes Report

### Routes testees: N/N total
### Serveur: localhost:3000

| # | Route | Method | Expected | Actual | Schema Match | Verdict |
|---|-------|--------|----------|--------|-------------|---------|
| 1 | /api/health | GET | 200 | 200 | OK | PASS |
| 2 | /api/auth/login | POST | 200 | 200 | OK | PASS |

### Problemes detectes
- [route] : [description du probleme]

### Coverage API: N/N routes testees (X%)
### Verdict: PASS | FAIL
```

## INTEGRATION /team

Phase 4.5 VIABILITE : `/test-routes changed` valide que les routes modifiees repondent correctement.

## REGLES

1. Ne PAS modifier le code — read-only verification
2. Si le serveur n'est pas demarre, signaler et skip (pas de FAIL)
3. Ne PAS tester les routes /api/admin/* sauf demande explicite
4. Chaque FAIL doit inclure expected vs actual
