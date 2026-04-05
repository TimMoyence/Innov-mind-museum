# Quality Gates — Verification Pipeline

Protocole de verification a chaque porte Sentinelle.

---

## PRE-FLIGHT CHECK

Execute AVANT le debut du cycle SDLC pour etablir la baseline.

```bash
# Backend
cd museum-backend && pnpm lint 2>&1 | tail -3    # tsc --noEmit
cd museum-backend && pnpm test 2>&1 | tail -5    # Jest full suite

# Frontend
cd museum-frontend && npm run lint 2>&1 | tail -3  # tsc --noEmit
cd museum-frontend && npm test 2>&1 | tail -5      # Node.js test runner
```

### Baseline Record

```json
{
  "timestamp": "<ISO>",
  "backend": { "tsc": "PASS|FAIL", "tscErrors": 0, "tests": 0, "testsPassed": 0, "testsFailed": 0 },
  "frontend": { "tsc": "PASS|FAIL", "tscErrors": 0, "tests": 0, "testsPassed": 0, "testsFailed": 0 }
}
```

Envoyer la baseline a la Sentinelle. Toute regression par rapport a cette baseline = FAIL.

---

## VERIFICATION PIPELINE

Execute a **chaque porte Sentinelle** (6 portes dans le cycle complet).

### Step 1 — Typecheck (non negociable)

```bash
cd museum-backend && pnpm lint 2>&1
cd museum-frontend && npm run lint 2>&1
```

- 0 erreurs tsc = PASS
- Toute erreur tsc = FAIL immediat, pas de suite

### Step 2 — Tests

```bash
cd museum-backend && pnpm test 2>&1
cd museum-frontend && npm test 2>&1
```

- Tests passes >= baseline = PASS
- Tout test en regression = FAIL
- Nouveaux tests ajoutes = bonus (ratchet up)

### Step 3 — Quality Ratchet

Comparer avec `team-knowledge/quality-ratchet.json` :
- `testCount` ne doit jamais baisser
- `asAnyCount` ne doit jamais augmenter
- `eslintDisableCount` ne doit jamais augmenter (hors allowlist)
- Si amelioration → mettre a jour le ratchet (write-on-improve)

### Step 4 — ESLint-Disable Check

```bash
# Lister les nouveaux eslint-disable dans les fichiers staged
git diff --cached -U0 | grep '+.*eslint-disable' || echo "CLEAN"
```

Pour chaque nouveau `eslint-disable` detecte :

1. Extraire le nom de la regle desactivee
2. Verifier si la regle est dans l'**allowlist** :
   - `prefer-nullish-coalescing` — traitement intentionnel de `""` comme falsy
   - `no-unnecessary-condition` — frontiere de confiance (JWT, DB row, API externe)
   - `require-await` — implementation no-op d'interface async
   - `no-unnecessary-type-parameters` — generic API pour inference des callers
   - `no-require-imports` — pattern React Native `require()` ou chargement conditionnel OTel
   - `no-control-regex` — sanitisation input
   - `sonarjs/hashing` — checksum non-crypto (S3 Content-MD5)
   - `sonarjs/pseudo-random` — jitter/backoff, pas securite
   - `react-hooks/refs` — React Native `Animated.Value` / `PanResponder` refs
3. **Si la regle est dans l'allowlist** : verifier que le commentaire `-- raison` explique le contexte specifique (pas juste le nom de la regle)
4. **Si la regle est HORS allowlist** : **FAIL immediat**
   - Message : `ESLINT-DISABLE INTERDIT: \`{rule}\` n'est pas dans l'allowlist. Refactorer le code pour satisfaire la regle. Voir CLAUDE.md § ESLint Discipline.`
   - L'agent doit corriger en refactorant, pas en ajoutant a l'allowlist

### Step 5 — Scope Check

Verifier que les fichiers modifies correspondent au scope attendu :
- Mode backend-only → pas de modifs dans `museum-frontend/`
- Mode frontend-only → pas de modifs dans `museum-backend/`
- Aucun mode → pas de modifs dans `node_modules/`, `.env`, credentials

### Step 6 — Self-Verification Agent

Chaque agent DEV doit, AVANT de rendre son travail :

```
1. Relire chaque fichier modifie en entier
2. Verifier la coherence des imports (gitnexus_impact sur chaque symbole modifie)
3. S'assurer que les types compilent (tsc mental check)
4. Verifier qu'aucun console.log de debug ne reste
5. Confirmer que les tests couvrent le code ajoute
6. Reporter toute Discovery hors-scope dans le rapport de self-verification
7. Produire le GitNexus Calls Log (cf. agent-mandate.md § COHERENCE IMPORTS)
   - Lister CHAQUE appel gitnexus_impact/context/rename avec symbole + resultat
   - Si aucun symbole existant modifie → ecrire "0 appels requis"
   - Absence de log = FAIL de porte
```

### Step 6b — Verification GitNexus Calls Log (Sentinelle)

La Sentinelle verifie le GitNexus Calls Log de chaque agent :
```
1. Le log est-il present ? (absent = FAIL immediat)
2. Pour chaque fichier modifie par l'agent qui existait deja :
   - Un appel gitnexus_impact est-il logue pour ce symbole ? (absent = WARN)
3. Pour chaque fichier supprime :
   - Un appel gitnexus_context est-il logue ? (absent = FAIL)
4. Pour chaque rename :
   - Un appel gitnexus_rename dry_run est-il logue ? (absent = FAIL)
5. Les dependants d=1 listes sont-ils traites ou FLAGS comme Discovery ?
```

### Step 7 — Inter-Agent Scoped tsc (standard + enterprise)

Execute par le Tech Lead apres chaque agent DEV, AVANT la porte Sentinelle.
Cf. `import-coherence.md` niveau 2 pour le protocole complet.

```bash
# Lister fichiers modifies
CHANGED=$(git diff --name-only HEAD)

# Scoped tsc backend (si fichiers backend modifies)
cd museum-backend && npx tsc --noEmit 2>&1 | head -20

# Scoped tsc frontend (si fichiers frontend modifies)
cd museum-frontend && npx tsc --noEmit 2>&1 | head -20
```

| Resultat | Action |
|----------|--------|
| 0 erreurs | PASS — continuer |
| Erreurs dans fichiers de l'agent | Renvoyer au meme agent (max 2 retours) |
| Erreurs cascade (fichiers non modifies) | Tech Lead resout |
| 3e echec | Escalade utilisateur |

---

## RAPPORT DE PORTE (format Sentinelle)

L'output envoye a la Sentinelle via SendMessage :

```json
{
  "gate": "<phase_name>",
  "timestamp": "<ISO>",
  "checks": {
    "tsc_backend": "PASS|FAIL",
    "tsc_frontend": "PASS|FAIL",
    "tests_backend": { "total": 0, "passed": 0, "failed": 0, "new": 0 },
    "tests_frontend": { "total": 0, "passed": 0, "failed": 0, "new": 0 },
    "ratchet": "PASS|REGRESSION",
    "eslint_disable": {
      "new_disables": 0,
      "in_allowlist": 0,
      "out_of_allowlist": 0,
      "details": []
    },
    "scope": "PASS|VIOLATION"
  },
  "verdict": "PASS|WARN|FAIL",
  "details": "<explication si WARN ou FAIL>"
}
```

### Verdicts

| Verdict | Condition | Action |
|---------|-----------|--------|
| **PASS** | Tous les checks OK | Continuer le cycle |
| **WARN** | Checks OK mais metriques stagnantes | Continuer avec note |
| **FAIL** | Au moins 1 check echoue | Boucle corrective obligatoire |

---

## ERROR BUDGET GATE

Evaluation au pre-flight pour determiner si le run peut demarrer :

```json
{
  "tsc_errors": 0,
  "ratchet_regressions": false,
  "verdict": "CLEAR|EXCEEDED"
}
```

- Si `tsc_errors > 0` OU `ratchet_regressions = true` → forcer mode "bug"
- Message : "Error budget depasse. Le run est force en mode bug pour corriger les regressions."
