# MUSAIUM — Sprint Log (Cahier de suivi technique)

> Journal detaille de chaque sprint: ce qui a ete fait, comment, quels fichiers, quels choix techniques.
> Chaque entree est un snapshot post-sprint, immutable une fois ecrit.
> Pour l'avancement global → voir [PROGRESS_TRACKER.md](PROGRESS_TRACKER.md) (meme dossier)

---

## Sprint 1 — Stabilisation (2026-03-18)

**Scope**: 37 taches, correction bugs critiques, securite, refactoring architecture.
**Commits**: `4aae795` → `58b376a` (5 commits)
**Stats**: 53 fichiers modifies, 19 nouveaux, -1499 lignes nettes, 212+8 tests.

### Resume executif

Sprint de stabilisation post-MVP. Correction de tous les bugs securite identifies par l'analyse du codebase (13 rapports dans `docs/fullcodebase-analyse/`). Refactoring majeur du chat screen frontend (extraction hooks), nettoyage dead code, ajout couverture tests.

### Changements cles

| Domaine | Action | Fichiers |
|---------|--------|----------|
| Auth securite | Password policy, rate limiter, social login verification | `shared/validation/password.ts`, `login-rate-limiter.ts`, `socialLogin.useCase.ts` |
| SSRF | 17 regex patterns pour bloquer IPs privees | `image-input.ts` |
| Token securite | SHA-256 hashing des reset tokens, indexes refresh tokens | `authSession.service.ts`, migration `RecreateRefreshTokenIndexes` |
| DB | 3 migrations (social accounts, refresh token indexes, session version) | `src/data/db/migrations/` |
| Chat refactoring | Extraction hooks, helpers, session access | `useAudioRecorder.ts`, `useImagePicker.ts`, `chat-image.helpers.ts`, `session-access.ts` |
| Frontend cleanup | Suppression styles/, old components/, dead code | `-components/`, `-app/styles/` |
| Email | Service Brevo (adapter port) | `shared/email/` |
| Validation | Module input validation | `shared/validation/` |
| Tests | 212 backend (Jest), 8 frontend (node:test) | `tests/unit/`, `tests/integration/`, `tests/contract/` |

---

## Sprint 1.5 — Remediation Post-Audit (2026-03-19)

**Scope**: 5 bugs identifies par audit adversarial (3 agents paralleles: backend, frontend, securite+architecture).
**Methode**: Audit a genere 6 findings. 1 corrige pendant l'audit (rate limiter timer fix). 5 restants corriges ici.
**Verification**: Backend 217 tests OK, Frontend 11 tests OK, typecheck OK partout.

---

### Item 1 — S3 `deleteByPrefix` implementation (RGPD)

**Severite**: HIGH — `deleteAccount` ne supprimait pas les images S3 (no-op `console.warn`).

**Probleme**: `S3CompatibleImageStorage.deleteByPrefix()` etait un `console.warn` no-op. `deleteAccount.useCase.ts` passait un pattern glob (`chat-images/*/*/user-${userId}/`) mais S3 ListObjectsV2 ne supporte pas les globs.

**Solution**:

1. **Refactoring HTTP** — `httpPut` generalise en `httpRequest(method, url, headers, body?) → {statusCode, body}`. L'ancien `httpPut` appelle desormais `httpRequest` et verifie le status code.

2. **Signature SigV4 generique** — `buildS3SignedHeaders()` factorise la logique de signature pour GET/POST/PUT (etait inline dans `buildS3SignedHeadersForPut`).

3. **`listObjectsByPrefix(config, prefix, continuationToken?)`** — GET `/{bucket}?list-type=2&prefix=...&max-keys=1000`. Parse XML avec regex (pas de dependance XML). Gere pagination via `IsTruncated` + `NextContinuationToken`.

4. **`deleteObjectsBatch(config, keys[])`** — POST `/{bucket}?delete=` avec body XML `<Delete><Quiet>true</Quiet><Object>...</Object></Delete>`. Inclut header `Content-MD5` obligatoire (base64 du MD5 du body).

5. **`deleteByPrefix(userPattern)`** — Liste tous les objets sous `chat-images/`, filtre par `/${userPattern}/`, supprime par batch.

6. **Caller simplifie** — `deleteAccount.useCase.ts` passe maintenant `user-${userId}` (pattern simple) au lieu d'un glob.

**Fichiers modifies**:
| Fichier | Changement |
|---------|-----------|
| `museum-backend/src/modules/chat/adapters/secondary/image-storage.s3.ts` | +`httpRequest`, +`buildS3SignedHeaders`, +`listObjectsByPrefix`, +`deleteObjectsBatch`, rewrite `deleteByPrefix` |
| `museum-backend/src/modules/auth/core/useCase/deleteAccount.useCase.ts` | Pattern glob → `user-${userId}` |
| `museum-backend/src/modules/chat/adapters/secondary/image-storage.stub.ts` | JSDoc clarifie sur no-op |
| `museum-backend/tests/unit/chat/image-storage.s3.test.ts` | +5 tests (XML parsing, truncation, delete body, empty keys, integration) |

**Choix technique**: Regex pour parser XML (pas de dependance `xml2js`/`fast-xml-parser`) — les reponses ListObjectsV2 et DeleteObjects ont une structure simple et previsible. Si la complexite augmente, migrer vers un parser.

---

### Item 2 — Email case-sensitivity

**Severite**: HIGH — Un utilisateur inscrit en `user@example.com` ne pouvait pas se connecter avec `User@Example.com`.

**Cause racine**: `users.email` est VARCHAR (comparaison case-sensitive). `register.useCase.ts` faisait `email.trim().toLowerCase()` mais `authSession.service.ts`, `forgotPassword.useCase.ts`, et `socialLogin.useCase.ts` ne normalisaient pas.

**Solution**: Ajout `.toLowerCase()` dans les 3 fichiers + migration pour normaliser les donnees existantes et ajouter un index unique sur `LOWER(email)`.

**Fichiers modifies**:
| Fichier | Changement |
|---------|-----------|
| `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | `email.trim()` → `email.trim().toLowerCase()` (ligne 121) |
| `museum-backend/src/modules/auth/core/useCase/forgotPassword.useCase.ts` | +`normalizedEmail` avec early return si vide, utilise partout (getUserByEmail, setResetToken, sendEmail, log) |
| `museum-backend/src/modules/auth/core/useCase/socialLogin.useCase.ts` | +`normalizedEmail` pour getUserByEmail, socialAccountRepository.create (linking + creation) |
| `museum-backend/src/data/db/migrations/1774100000000-NormalizeEmailCase.ts` | `UPDATE users SET email = LOWER(email)` + `CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email))` |

**Note**: L'index fonctionnel `LOWER(email)` protege contre les doublons meme si un futur code oublie le `.toLowerCase()`. Double protection: code + DB.

---

### Item 3 — DNS rebinding (documentation)

**Severite**: MEDIUM — `isSafeImageUrl` ne protege pas contre le DNS rebinding.

**Analyse**: L'URL validee n'est **jamais fetchee par le backend**. Le flow est: `chat.service.ts` → `orchestrator.generate(image)` → `langchain.orchestrator.ts:325` passe l'URL en `image_url` dans `HumanMessage` → le provider LLM (OpenAI/Google) fetch depuis leur infra.

Le DNS rebinding cible le host qui fetch. Notre backend ne fetch pas. Le risque est cote provider.

**Solution**: JSDoc documente le risque accepte + condition pour ajout futur de validation DNS si le backend devait fetcher (thumbnailing, caching).

**Fichier modifie**: `museum-backend/src/modules/chat/application/image-input.ts` — JSDoc enrichi sur `isSafeImageUrl`.

---

### Item 4 — Frontend `useCallback` stabilisation

**Severite**: MEDIUM — `toggleRecording`, `playRecordedAudio`, `onPickImage`, `onTakePicture` recreees a chaque render, causant des refs instables dans les `useEffect` deps du chat screen.

**Solution**:

**`useAudioRecorder.ts`** — Ajout de 3 refs synces avec l'etat (`isRecordingRef`, `recordedAudioUriRef`, `isPlayingAudioRef`), mises a jour a chaque render (`ref.current = state`). Les callbacks lisent les refs au lieu de l'etat, ce qui permet `useCallback` avec deps stables:
- `startRecording` — `useCallback([revokeWebAudioObjectUrl])`
- `stopRecording` — `useCallback([revokeWebAudioObjectUrl, stopWebAudioStreamTracks])`
- `toggleRecording` — `useCallback([startRecording, stopRecording])` — lit `isRecordingRef.current`
- `playRecordedAudio` — `useCallback([])` — lit `recordedAudioUriRef.current` et `isPlayingAudioRef.current`

**`useImagePicker.ts`** — Plus simple car pas de deps d'etat:
- `onPickImage` — `useCallback([])` — n'utilise que `setSelectedImage` (setter stable)
- `onTakePicture` — `useCallback([])` — n'utilise que `setIsCameraOpen` (setter stable)

**Fichiers modifies**:
| Fichier | Changement |
|---------|-----------|
| `museum-frontend/features/chat/application/useAudioRecorder.ts` | +3 refs synces, 4 fonctions wrappees useCallback |
| `museum-frontend/features/chat/application/useImagePicker.ts` | 2 fonctions wrappees useCallback |

---

### Item 5 — Frontend tests

**Severite**: P2 — Couverture tests pour la logique pure ajoutee en Sprint 1.

**Contrainte**: Node.js native test runner (`node:test`), pas de DOM/rendering. Seule la logique pure est testable.

**Solution**:

1. **Extraction pure** — `normalizeGuideLevel` et `defaults` extraits de `runtimeSettings.ts` vers `runtimeSettings.pure.ts` (zero deps externes). Le fichier original re-exporte.

2. **Tests** — 3 cas: valeurs par defaut, niveaux valides, fallback pour valeurs invalides.

3. **Nettoyage** — Variable morte `suffix` dans `chatApi.ts:listSessions` (calculee mais jamais utilisee apres refactoring vers `openApiRequest`).

**Fichiers modifies/crees**:
| Fichier | Changement |
|---------|-----------|
| `museum-frontend/features/settings/runtimeSettings.pure.ts` | **NOUVEAU** — types + logique pure |
| `museum-frontend/features/settings/runtimeSettings.ts` | Re-export depuis `.pure.ts`, constants locales restaurees |
| `museum-frontend/tests/runtime-settings.test.ts` | **NOUVEAU** — 3 tests |
| `museum-frontend/tsconfig.test.json` | Include `runtimeSettings.pure.ts` |
| `museum-frontend/features/chat/infrastructure/chatApi.ts` | Suppression variable morte `suffix` |

---

### Bilan Sprint 1.5

| Metrique | Avant | Apres | Delta |
|----------|-------|-------|-------|
| Tests backend | 212 | 217 | +5 |
| Tests frontend | 8 | 11 | +3 |
| Bugs ouverts (audit) | 5 | 0 | -5 |
| S3 RGPD compliance | NO-OP | Fonctionnel | Fix |
| Email case-sensitivity | 1/4 use cases | 4/4 use cases | Fix |
| useCallback coverage | 2/6 functions | 6/6 functions | Fix |

---

<!-- TEMPLATE POUR PROCHAIN SPRINT -->
<!--
## Sprint N — Nom (DATE)

**Scope**: ...
**Objectif**: ...
**Commits**: `hash_debut` → `hash_fin`

### Resume executif
...

### Item X — Titre
**Severite**: ...
**Probleme**: ...
**Solution**: ...
**Fichiers modifies**: ...
**Choix technique**: ...

### Bilan Sprint N
| Metrique | Avant | Apres | Delta |
|----------|-------|-------|-------|
-->
