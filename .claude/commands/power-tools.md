---
description: Analyse automatique du repo MuseumIA + reference CLI cross-platform
argument-hint: [symptome | route | module | endpoint | page | libre]
---

# Power Tools — Analyse & Reference Cross-Platform

Outil d'analyse automatique du codebase MuseumIA + reference CLI.
Cross-platform : macOS + Windows/Git Bash.

> Philosophie : Les scripts pre-machent les donnees pour l'AI. L'AI reste le cerveau qui analyse et decide. Les scripts ne sont JAMAIS la source de verite. Toujours reverifier les resultats critiques avec Read.

---

## PHASE 1 : ANALYSE AUTOMATIQUE

Executer ces verifications en parallele a chaque invocation de `/power-tools`.

> REGLE CRITIQUE DE ROBUSTESSE : Chaque check Bash DOIT etre independant et ne JAMAIS echouer. Toujours utiliser `set +e` et terminer proprement avec `echo "... DONE"` ou `|| true`. Si un check parallele echoue, Claude Code peut annuler tous les autres checks paralleles.

> REGLE CRITIQUE DE PORTEE : `power-tools` est un outil de pre-analyse. Il ne remplace ni la cartographie manuelle ni le diagnostic causal.

### 1.1 OpenAPI Route Parity
Verifier la coherence routes backend actives ↔ spec OpenAPI.

```bash
set +e
echo "=== OpenAPI Route Parity ==="
SPEC="museum-backend/openapi/openapi.json"
AUTH="museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq missing: check skipped"
  echo "=== OpenAPI Route Parity DONE ==="
  exit 0
fi

for route in \
  "/api/auth/register" \
  "/api/auth/login" \
  "/api/auth/refresh" \
  "/api/auth/logout" \
  "/api/auth/me" \
  "/api/chat/sessions" \
  "/api/chat/sessions/{id}" \
  "/api/chat/sessions/{id}/messages" \
  "/api/chat/sessions/{id}/audio" \
  "/api/chat/messages/{messageId}/image-url" \
  "/api/chat/messages/{messageId}/image"
do
  jq -e --arg p "$route" '.paths[$p]' "$SPEC" >/dev/null 2>&1 || echo "MISSING IN SPEC: $route"
done

for code_only in forgot-password reset-password; do
  if rg --color never -q "/$code_only" "$AUTH" 2>/dev/null; then
    jq -e --arg p "/api/auth/$code_only" '.paths[$p]' "$SPEC" >/dev/null 2>&1 || \
      echo "CODE!=SPEC: /api/auth/$code_only exists in code, absent from OpenAPI"
  fi
done

echo "=== OpenAPI Route Parity DONE ==="
```

### 1.2 OpenAPI Typegen Drift
Verifier que les types frontend generes sont synchronises avec la spec backend.

```bash
set +e
echo "=== OpenAPI Typegen Drift ==="
TMP_ROOT="${TMPDIR:-${TEMP:-/tmp}}"
LOG_FILE="$TMP_ROOT/museum_openapi_typegen.log"

if [ -d "museum-frontend/node_modules" ]; then
  (
    cd museum-frontend && npm run check:openapi-types
  ) >"$LOG_FILE" 2>&1
  CODE=$?
  if [ "$CODE" -eq 0 ]; then
    echo "OpenAPI typegen: OK"
  else
    echo "OPENAPI TYPEGEN DRIFT or toolchain issue"
    tail -20 "$LOG_FILE" 2>/dev/null || true
  fi
else
  echo "museum-frontend/node_modules missing: check skipped"
fi

echo "=== OpenAPI Typegen DONE ==="
```

### 1.3 Repo Boundary Integrity
Verifier que le repo reste un split front/back propre.

```bash
set +e
echo "=== Repo Boundary Integrity ==="
echo "--- package.json inventory ---"
find . -maxdepth 2 -name 'package.json' | sort

if [ -f "package.json" ]; then
  echo "NOTE: root package.json exists"
else
  echo "root package.json: absent (expected in current repo reality)"
fi

echo "--- direct cross-app references from frontend code ---"
rg --color never -n -e 'museum-backend/' museum-frontend/app museum-frontend/features museum-frontend/shared museum-frontend/services 2>/dev/null || \
  echo "(aucune reference directe frontend -> museum-backend)"

echo "--- direct cross-app references from backend code ---"
rg --color never -n -e 'museum-frontend/' museum-backend/src 2>/dev/null || \
  echo "(aucune reference directe backend -> museum-frontend)"

echo "=== Repo Boundary DONE ==="
```

### 1.4 Auth Refresh Flow Invariants
Verifier bootstrap auth, refresh token, retry et logout.

```bash
set +e
echo "=== Auth Refresh Flow Invariants ==="

echo "--- refresh calls / handlers ---"
rg --color never -n \
  -e 'authService\.refresh\(' \
  -e 'setAuthRefreshHandler\(' \
  -e 'setUnauthorizedHandler\(' \
  -e 'clearAccessToken\(' \
  museum-frontend/context/AuthContext.tsx \
  museum-frontend/shared/infrastructure/httpClient.ts \
  museum-frontend/services/authService.ts \
  museum-frontend/features/auth/infrastructure/authStorage.ts 2>/dev/null || echo "(aucun)"

echo "--- requiresAuth false on auth endpoints ---"
rg --color never -n 'requiresAuth:\s*false' museum-frontend/services/authService.ts 2>/dev/null || echo "(aucun requiresAuth:false)"

echo "=== Auth Refresh DONE ==="
```

### 1.5 Signed Media Flow Coverage
Verifier le flux image/audio signe de bout en bout.

```bash
set +e
echo "=== Signed Media Flow Coverage ==="

rg --color never -n \
  -e 'image-url' \
  -e 'verifySignedChatImageReadUrl' \
  -e 'buildSignedChatImageReadUrl' \
  -e 'buildS3SignedReadUrlFromRef' \
  -e 'refreshMessageImageUrl' \
  -e 'MEDIA_SIGNING_SECRET' \
  -e 'signedUrlTtlSeconds' \
  museum-backend/src/modules/chat \
  museum-backend/src/config/env.ts \
  museum-frontend/features/chat \
  museum-frontend/shared 2>/dev/null || echo "(aucun)"

echo "=== Signed Media DONE ==="
```

### 1.6 Legacy Docs Mismatch
Verifier les docs stale ou trompeuses par rapport a l'arbre reel.

```bash
set +e
echo "=== Legacy Docs Mismatch ==="

echo "--- root README warnings / reality markers ---"
rg --color never -n \
  -e 'Current Implementation Notes' \
  -e 'source of truth' \
  README.md CLAUDE.md museum-backend/README.md 2>/dev/null || echo "(aucun)"

echo "--- stale frontend architecture refs ---"
rg --color never -n \
  -e 'conversationService' \
  -e 'iaService' \
  -e 'components/' \
  -e 'features/conversation' \
  museum-frontend/docs/ARCHITECTURE_MAP.md 2>/dev/null || echo "(aucun)"

echo "=== Legacy Docs DONE ==="
```

### 1.7 Stale Alias / Dead Artifact Audit
Verifier les reliquats legacy qui peuvent tromper l'analyse.

```bash
set +e
echo "=== Stale Alias / Dead Artifact Audit ==="

echo "--- stale Jest aliases ---"
rg --color never -n '@IA/' museum-backend/jest.config.ts 2>/dev/null || echo "(aucun alias @IA)"

echo "--- legacy placeholder tests ---"
find museum-backend/tests -type f | rg --color never 'IA/|IAMuseumArt' 2>/dev/null || echo "(aucun test legacy IA detecte)"

echo "--- suspicious empty or near-empty files ---"
wc -c museum-backend/src/modules/auth/adapters/secondary/password.service.ts 2>/dev/null || echo "password.service.ts missing"

echo "--- residual frontend services seam ---"
find museum-frontend/services -maxdepth 2 -type f 2>/dev/null | sort || echo "(pas de seam services/ detecte)"

echo "=== Stale Alias / Dead Artifact DONE ==="
```

### 1.8 Migration / Env / CI Consistency
Verifier la coherence migrations, variables critiques et workflows CI.

```bash
set +e
echo "=== Migration / Env / CI Consistency ==="

echo "--- backend migrations ---"
find museum-backend/src/data/db/migrations -name '*.ts' | sort
echo "migration count: $(find museum-backend/src/data/db/migrations -name '*.ts' | wc -l | tr -d ' ')"

echo "--- data-source wiring ---"
rg --color never -n 'migrations:' museum-backend/src/data/db/data-source.ts 2>/dev/null || echo "(aucun wiring migrations)"

echo "--- critical env vars coverage ---"
for key in \
  JWT_ACCESS_SECRET JWT_REFRESH_SECRET MEDIA_SIGNING_SECRET \
  OPENAI_API_KEY EXPO_PUBLIC_API_BASE_URL EXPO_PUBLIC_API_BASE_URL_STAGING \
  EXPO_PUBLIC_API_BASE_URL_PROD EXPO_PUBLIC_EAS_PROJECT_ID APP_VARIANT EAS_BUILD_PROFILE
do
  echo "## $key"
  rg --color never -n "$key" \
    museum-backend/.env* \
    museum-frontend/.env* \
    museum-backend/src/config/env.ts \
    museum-frontend/app.config.ts \
    .github/workflows \
    docs 2>/dev/null || echo "(missing or undocumented)"
done

echo "=== Migration / Env / CI DONE ==="
```

### 1.9 Observability Parity
Verifier les minimums d'observabilite et les gaps de correlation.

```bash
set +e
echo "=== Observability Parity ==="

rg --color never -n \
  -e 'x-request-id' \
  -e 'requestId' \
  -e 'requestLoggerMiddleware' \
  -e 'errorHandler' \
  -e 'http_request' \
  -e 'request_failed' \
  museum-backend/src/helpers \
  museum-backend/src/app.ts \
  museum-backend/openapi/openapi.json \
  museum-frontend/shared/infrastructure/httpClient.ts 2>/dev/null || echo "(aucun)"

echo "--- frontend explicit x-request-id propagation ---"
rg --color never -n 'X-Request-Id|x-request-id' museum-frontend 2>/dev/null || \
  echo "(frontend does not appear to propagate x-request-id explicitly)"

echo "=== Observability DONE ==="
```

### 1.10 Resume
Presenter un tableau recapitulatif :

```text
| Check                            | Status | Details |
|----------------------------------|--------|---------|
| OpenAPI route parity             | OK/KO  | missing paths / code!=spec |
| OpenAPI typegen drift            | OK/KO  | synced / drift / skipped |
| Repo boundary integrity          | OK/KO  | split clean / cross refs |
| Auth refresh invariants          | OK/KO  | handlers / retry / storage |
| Signed media flow coverage       | OK/KO  | route / signing / frontend |
| Legacy docs mismatch             | OK/KO  | stale docs count |
| Stale alias / dead artifacts     | OK/KO  | alias / test / file / seam |
| Migration / env / CI consistency | OK/KO  | migrations / env / workflow |
| Observability parity             | OK/KO  | requestId / logs / gaps |
```

---

## PHASE 2 : REFERENCE CLI

### Installation

#### macOS
```bash
brew install ripgrep fd jq bat ast-grep git-delta
rg --version && fd --version && jq --version && bat --version && ast-grep --version
```

#### Windows / Git Bash
```powershell
winget install BurntSushi.ripgrep.MSVC
winget install sharkdp.fd
winget install jqlang.jq
winget install sharkdp.bat
winget install ast-grep.ast-grep
winget install dandavison.delta
```

> Windows : Toujours utiliser Git Bash pour les pipelines. `sed`, `awk`, `find`, `sort`, `uniq`, `wc`, `xargs` y sont plus predictibles.

### Table des outils

| Outil | Usage principal dans MuseumIA |
|-------|-------------------------------|
| `rg` | Recherche texte, routes, env vars, drift, legacy refs |
| `find` | Recherche fichiers cross-platform dans scripts robustes |
| `jq` | Lecture `openapi.json`, validations simples de paths |
| `bat` | Lecture confortable de gros fichiers |
| `ast-grep` | Patterns TS/TSX plus fiables que regex |
| `delta` | Diffs lisibles pour drift et regenerations |

### Regles CLI
- `rg --color never` obligatoire en scripts.
- Dans les scripts portables, preferer `find` a `fd`.
- Les checks automatiques doivent rester sans effet de bord.
- Les scripts ne remplacent jamais `Read`.

### Pipelines MuseumIA

#### Routes backend actives
```bash
rg --color never -n "router\.(get|post|delete|put|patch)\(" museum-backend/src/modules -g '*.ts'
```

#### Hotspots auth refresh
```bash
rg --color never -n \
  -e 'authService\.refresh\(' \
  -e 'setAuthRefreshHandler\(' \
  -e 'setUnauthorizedHandler\(' \
  museum-frontend/context/AuthContext.tsx \
  museum-frontend/shared/infrastructure/httpClient.ts \
  museum-frontend/services/authService.ts
```

#### Signed media flow
```bash
rg --color never -n \
  -e 'image-url' \
  -e 'verifySignedChatImageReadUrl' \
  -e 'buildSignedChatImageReadUrl' \
  -e 'refreshMessageImageUrl' \
  museum-backend/src/modules/chat \
  museum-frontend/features/chat
```

#### Legacy refs trompeuses
```bash
rg --color never -n \
  -e '@IA/' \
  -e 'conversationService' \
  -e 'iaService' \
  -e 'Current Implementation Notes' \
  museum-backend museum-frontend README.md CLAUDE.md
```

#### Variables critiques
```bash
rg --color never -n \
  -e 'JWT_ACCESS_SECRET' \
  -e 'JWT_REFRESH_SECRET' \
  -e 'MEDIA_SIGNING_SECRET' \
  -e 'OPENAI_API_KEY' \
  -e 'EXPO_PUBLIC_API_BASE_URL' \
  -e 'EXPO_PUBLIC_EAS_PROJECT_ID' \
  museum-backend museum-frontend .github docs
```

### Pieges par OS

#### macOS
```bash
# pas de grep -P fiable -> preferer rg
# sed -i demande souvent ''
# bash systeme ancien -> scripts simples
```

#### Windows / Git Bash
```bash
# toujours Git Bash pour les pipelines
# chemins avec /
# /tmp peut etre absent selon setup -> preferer ${TEMP:-/tmp}
```

---

## DIRECTIVE FINALE

`/power-tools` sert a:
- pre-analyser vite le repo
- remonter les divergences structurelles
- accelerer la cartographie
- fournir des commandes fiables pour investiguer

`/power-tools` ne sert PAS a:
- poser un diagnostic causal final
- proposer une refonte complete
- remplacer la lecture du code reel

Apres execution, utiliser les signaux remontes pour guider l'enquete manuelle ou alimenter un prompt d'audit separe.
