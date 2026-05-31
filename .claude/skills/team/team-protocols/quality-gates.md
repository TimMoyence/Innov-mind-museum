# Quality Gates — Verification Pipeline

Mecanique des portes de qualite appliquees a la phase **Verify (Step 6)** du pipeline unique UFR-022 = gate deterministe execute par les hooks `team-hooks/` ; la part jugement est absorbee par le reviewer Step 8. Plus d'agent verifier. Voir `SKILL.md` Step 6.

> Note UFR-022 : lint / tsc / tests sont desormais delegues aux hooks deterministes (`post-edit-lint.sh`, `post-edit-typecheck.sh`, `pre-complete-verify.sh`) — REGLE 9. Les Steps ci-dessous decrivent la mecanique des checks que les hooks du gate verify executent ; le reviewer (Step 8) confirme la part jugement. Aucun n'est conditionnel a un mode (les selecteurs micro/standard/enterprise et feature/bug/etc. sont retires).

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

Persister la baseline dans `team-state/<run-id>/`. Toute regression par rapport a cette baseline = FAIL au Step 6 Verify.

---

## VERIFICATION PIPELINE

Execute a la phase **Verify (Step 6)** du pipeline unique (gate deterministe via hooks). Les checks alimentent aussi le reviewer (Step 8).

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

Verifier que les fichiers modifies correspondent au scope attendu (le scope `backend-only | frontend-only | full-stack | infra` est **informatif** seulement, plus de pipeline branching — SKILL.md Step 1) :
- Scope declare backend-only → modifs dans `museum-frontend/` = Discovery hors-scope a flagger
- Scope declare frontend-only → modifs dans `museum-backend/` = Discovery hors-scope a flagger
- Toujours, quel que soit le scope → pas de modifs dans `node_modules/`, `.env`, credentials = VIOLATION (FAIL)

### Step 6 — Self-Verification (phase editeur green)

L'agent editor de la phase green doit, AVANT de rendre son travail (lint/tsc/test eux-memes sont enforces par les hooks `post-edit-*.sh` — REGLE 9 ; cette checklist couvre ce que les hooks ne voient pas) :

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
   - Absence de log = FAIL de porte (verifie au Step 6b)
```

### Step 6b — Verification GitNexus Calls Log (reviewer)

Le reviewer (Step 8) verifie le GitNexus Calls Log produit par les phases editeur :
```
1. Le log est-il present ? (absent = FAIL immediat)
2. Pour chaque fichier modifie qui existait deja :
   - Un appel gitnexus_impact est-il logue pour ce symbole ? (absent = WARN)
3. Pour chaque fichier supprime :
   - Un appel gitnexus_context est-il logue ? (absent = FAIL)
4. Pour chaque rename :
   - Un appel gitnexus_rename dry_run est-il logue ? (absent = FAIL)
5. Les dependants d=1 listes sont-ils traites ou FLAGS comme Discovery ?
```

### Step 7 — Inter-Agent Scoped tsc

Scoped tsc execute sur les fichiers modifies pendant la phase Verify (Step 6).
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

## RAPPORT DE PORTE (gate verify : verdicts hooks + section reviewer)

Le gate verify (hooks) ecrit ses exit codes dans la section `verify` de `STORY.md` ; le reviewer consigne le scope-boundary + spot-check dans sa section `review` :

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
| **FAIL** | Au moins 1 check echoue | Boucle corrective (intra-phase cap 2, ou re-spawn fresh la phase pointee — SKILL.md REGLE 14) |

---

## ERROR BUDGET GATE

Evaluation au pre-flight pour enregistrer la sante de la baseline (telemetry — plus de branchement de mode, le pipeline est unique UFR-022) :

```json
{
  "tsc_errors": 0,
  "ratchet_regressions": false,
  "verdict": "CLEAR|EXCEEDED"
}
```

- Si `tsc_errors > 0` OU `ratchet_regressions = true` → verdict `EXCEEDED` : la baseline est deja rouge AVANT le run.
- Action : escalade user (la baseline doit etre verte avant de demarrer un cycle — on ne masque pas une regression pre-existante derriere une nouvelle feature). Le pipeline reste le pipeline unique 9-phase ; aucun "mode bug" force.
