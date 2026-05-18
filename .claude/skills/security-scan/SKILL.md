---
name: security-scan
description: "/security-scan — Audit securite leger (UFR-022 fresh-context aware)"
last-verified: 2026-05-18
---

# /security-scan — Audit securite leger

Scan securite cible sur les fichiers modifies ou un module specifie. Plus leger qu'un `/team audit` complet.

## ARGUMENTS

```
/security-scan [path|module|"changed"]
```

## PIPELINE

### Step 1 — Identifier le scope

```bash
# Si "changed" ou absent
git diff --name-only HEAD | grep -E '\.(ts|tsx)$'

# Si module specifie (ex: "auth", "chat")
find museum-backend/src/modules/<module> -name '*.ts'
find museum-frontend/features/<module> -name '*.ts' -o -name '*.tsx'
```

### Step 2 — Checks automatiques

Pour chaque fichier en scope, verifier :

**Backend** :
| Check | Pattern recherche | Severite |
|-------|-------------------|----------|
| SQL injection | Concatenation dans query (`${`, template literal dans `.query()`) | CRITICAL |
| Prompt injection | User input dans SystemMessage sans `sanitizePromptInput()` | CRITICAL |
| Auth bypass | Route sans middleware `authenticated` (sauf whitelist) | HIGH |
| Secret leak | Hardcoded key/password/token (regex: `(key|secret|password|token)\s*[:=]\s*['"][^'"]+['"]`) | HIGH |
| Missing validation | `req.body` ou `req.params` utilise sans `parse*Request()` | HIGH |
| Unsafe any | `as any` sur des donnees user-controlled | MEDIUM |
| Console leak | `console.log` avec des donnees sensibles | MEDIUM |

**Frontend** :
| Check | Pattern recherche | Severite |
|-------|-------------------|----------|
| Token storage | Token stocke dans AsyncStorage (doit etre expo-secure-store) | HIGH |
| Hardcoded URL | URL API hardcodee (doit etre EXPO_PUBLIC_*) | MEDIUM |
| Missing auth | Appel API sans token (sauf endpoints publics) | MEDIUM |

### Step 3 — Analyse contextuelle

Pour les findings CRITICAL/HIGH, lire le contexte (10 lignes avant/apres) pour eliminer les faux positifs :
- SQL dans migration = OK (pas de donnees user)
- `as any` dans un test mock = OK si `jest.Mocked<T>` n'est pas applicable
- Concatenation dans un log message = OK si pas de donnees sensibles

**Regle anti-faux-positif** : Chaque finding DOIT inclure le contexte qui prouve qu'il est reel. "Potentiellement dangereux" sans preuve = pas un finding.

### Step 4 — Rapport JSON

```json
{
  "scan": {
    "date": "YYYY-MM-DD",
    "scope": "changed|module|path",
    "filesScanned": 0,
    "duration": "Xs"
  },
  "findings": [
    {
      "id": "SEC-001",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "category": "injection|auth|secrets|validation",
      "file": "path/to/file.ts",
      "line": 42,
      "description": "Description precise du probleme",
      "evidence": "La ligne de code problematique",
      "recommendation": "Fix propose concret"
    }
  ],
  "summary": {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "falsePositivesEliminated": 0
  },
  "verdict": "PASS|FAIL (FAIL si CRITICAL ou HIGH > 0)"
}
```

## INTEGRATION /team

Phase 3 VERIFIER : `/security-scan changed` execute automatiquement. FAIL si findings CRITICAL ou HIGH.

## UFR-022 — Fresh-context contract

Si invoque dans le cadre d'un run `/team` (RUN_ID set) :
- Premiere reponse : `BRIEF-ACK: <sha256-of-args>`.
- Si message history contient des artefacts d'une autre phase du meme RUN_ID → `BLOCK-CONTEXT-LEAK` + refus.
- Si la diff touche une lib auth/crypto/llm (jsonwebtoken, bcryptjs, jose, langchain, openai, anthropic, etc.), consulter `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` pour les patterns securite documentes ; citer `PATTERNS.md:<line>` quand un finding match un anti-pattern documente.

## REGLES

1. Zero faux positif — chaque finding doit etre verifiable avec evidence
2. PE-006 : les .env locaux gitignores ne sont PAS des vulnerabilites
3. Context obligatoire — lire le code autour avant de rapporter
4. CRITICAL/HIGH = bloqueur deploy, MEDIUM/LOW = backlog
5. UFR-022 : fresh-context si invoque depuis /team, lib-docs consulte pour libs auth/crypto/llm.
