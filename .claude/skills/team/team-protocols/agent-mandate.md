# Agent Mandate — Template & Allocation

Protocole de construction des mandats agents et regles d'allocation.

---

## TEMPLATE MANDAT

Chaque agent DEV recoit un mandat formel avec cette structure :

```
## MANDAT — {agent_role} — {task_description}

### CONTEXTE
- Mode: {mode}
- Scope: {scope}
- Branche: {branch}
- Baseline: tsc={tsc_status}, tests={test_count} passed

### OBJECTIF
{description precise de ce que l'agent doit produire}

### FICHIERS AUTORISES
{liste explicite des fichiers/repertoires que l'agent peut modifier}

### CONTRAINTES
- Ne PAS modifier de fichiers hors du scope autorise
- Ne PAS commit (le Tech Lead commit)
- Ne PAS ecrire dans team-knowledge/ ni team-reports/
- Ne PAS ajouter de deps sans validation

### COHERENCE IMPORTS (OBLIGATOIRE)

AVANT de modifier/supprimer/renommer un symbole ou fichier :
1. Run gitnexus_impact({target: "symbolName", direction: "upstream"})
2. Lire la liste des dependants d=1 (WILL BREAK)
3. Si dependants d=1 dans ton scope → les inclure dans tes modifications
4. Si dependants d=1 hors scope → FLAG comme Discovery (NE PAS modifier)
5. NE JAMAIS supprimer un fichier sans traiter ses importers (gitnexus_context)
6. NE JAMAIS renommer sans gitnexus_rename({dry_run: true}) d'abord

AVANT de creer un nouveau fichier :
1. Utiliser les path aliases (@src/, @/, @modules/) pour les imports
2. Mettre a jour le barrel index.ts parent si necessaire

LOG OBLIGATOIRE : Dans ton rapport de self-verification, lister CHAQUE appel GitNexus :
```
### GitNexus Calls Log
- gitnexus_impact({target: "X", direction: "upstream"}) → N dependants d=1, traites: [liste]
- gitnexus_context({name: "Y"}) → N importers, traites: [liste]
- gitnexus_rename({symbol_name: "Z", dry_run: true}) → N fichiers touches
```
Si aucun symbole existant modifie → ecrire: "Aucun symbole existant modifie — 0 appels GitNexus requis"
La Sentinelle verifie ce log. Absence de log = FAIL de porte.

Violation = FAIL de porte automatique.

### REGLES TECHNIQUES

REGLE ESLINT ABSOLUE: Tu ne dois JAMAIS ajouter de `eslint-disable` sauf pour les
categories autorisees dans CLAUDE.md § "ESLint Discipline > Justified disable patterns".
Si ESLint signale un probleme, tu DOIS refactorer le code pour satisfaire la regle.
Cherche la doc, cherche l'alternative, change ta maniere de penser.

Allowlist (seules exceptions autorisees):
- prefer-nullish-coalescing — traitement intentionnel de "" comme falsy
- no-unnecessary-condition — frontiere de confiance (JWT, DB row, API externe)
- require-await — implementation no-op d'interface async
- no-unnecessary-type-parameters — generic API pour inference des callers
- no-require-imports — pattern React Native require() ou chargement conditionnel OTel
- no-control-regex — sanitisation input
- sonarjs/hashing — checksum non-crypto (S3 Content-MD5)
- sonarjs/pseudo-random — jitter/backoff, pas securite
- react-hooks/refs — React Native Animated.Value / PanResponder refs read once at creation

REGLE TESTS DRY: Tu ne dois JAMAIS creer d'entites de test inline (as User, as ChatMessage, etc.).
Utilise TOUJOURS les factories partagees de tests/helpers/ :
- makeUser(overrides?) depuis tests/helpers/auth/user.fixtures.ts
- makeMessage(overrides?) depuis tests/helpers/chat/message.fixtures.ts
- makeSession(overrides?) depuis tests/helpers/chat/message.fixtures.ts
- makeToken(overrides?) depuis tests/helpers/auth/token.helpers.ts
- makeRepo(overrides?) depuis tests/helpers/chat/repo.fixtures.ts (a creer si inexistant)
- makeCache(overrides?) depuis tests/helpers/chat/cache.fixtures.ts (a creer si inexistant)

Si une factory partagee n'existe pas encore pour ton entite/mock, tu DOIS la creer
dans tests/helpers/<module>/<entity>.fixtures.ts AVANT de l'utiliser dans tes tests.
Chaque factory suit le pattern: valeurs par defaut sensees + overrides partiels.

### PROMPT ENRICHMENTS (PE)
{enrichissements injectes depuis prompt-enrichments.json, filtres par inject_when}

### ERROR PATTERNS (EP)
{erreurs passees pertinentes depuis error-patterns.json, unfixed only}

### TRACK RECORD
{historique de performance de cet agent depuis agent-performance.json > weaknessHistory}

### OUTPUT ATTENDU
{format de sortie attendu — code modifie + rapport structure}
```

---

## VIABILITE PRE-SPAWN

Avant de spawner un agent, le Tech Lead verifie :

```
1. Le scope est-il clair et delimite ?
2. Les fichiers autorises existent-ils ?
3. L'agent a-t-il les competences pour ce scope ? (cf. specializations)
4. Le mandat est-il complet (objectif + contraintes + regles) ?
5. Les PE et EP pertinents sont-ils injectes ?
```

Si un critere n'est pas rempli → ne PAS spawner, corriger d'abord.

---

## AGENTS DISPONIBLES

| Agent | Specialisation | Scope typique |
|-------|---------------|---------------|
| `backend-architect` | Node.js, Express, TypeORM, hexagonal | museum-backend/src/ |
| `frontend-architect` | React Native, Expo, Expo Router | museum-frontend/ |
| `test-engineer` | Jest, testing patterns, coverage | tests/ (backend + frontend) |
| `security-auditor` | OWASP, injection, auth flows | Tout (lecture seule) |
| `repo-scanner` | Structure, deps, config, CI/CD | Config files, .github/ |
| `code-quality` | Lint, complexity, code smells | src/ |
| `feature-verify` | Routes, coverage, contracts | tests/, routes |
| `cleanup` | Dead code, unused deps, stale TODOs | Tout |

---

## ALLOCATION DYNAMIQUE

Le Tech Lead consulte `agent-performance.json > specializations` :

```
1. Pour chaque task, identifier le type (backend-dev, frontend-dev, testing, audit)
2. Chercher les agents avec avgScore > 9.0 pour ce type → privilegier
3. Chercher les agents avec avgScore < 7.0 pour ce type (3+ runs) → eviter
4. Si egalite → utiliser l'agent par defaut du template
5. Logger le choix dans le rapport de run
```

---

## REGLES ABSOLUES

1. Tous les agents sur **opus** — pas de modele inferieur
2. Les agents ne commitent PAS
3. Les agents n'ecrivent PAS dans team-knowledge/ ni team-reports/
4. Chaque agent recoit un mandat complet avant spawn
5. Un agent qui depasse son scope → ses modifications hors scope sont revertees
6. Un agent qui ajoute un eslint-disable hors allowlist → FAIL de porte
7. Un agent qui cree des entites de test inline → FAIL de review
