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

| Domaine          | Action                                                                 | Fichiers                                                                                 |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Auth securite    | Password policy, rate limiter, social login verification               | `shared/validation/password.ts`, `login-rate-limiter.ts`, `socialLogin.useCase.ts`       |
| SSRF             | 17 regex patterns pour bloquer IPs privees                             | `image-input.ts`                                                                         |
| Token securite   | SHA-256 hashing des reset tokens, indexes refresh tokens               | `authSession.service.ts`, migration `RecreateRefreshTokenIndexes`                        |
| DB               | 3 migrations (social accounts, refresh token indexes, session version) | `src/data/db/migrations/`                                                                |
| Chat refactoring | Extraction hooks, helpers, session access                              | `useAudioRecorder.ts`, `useImagePicker.ts`, `chat-image.helpers.ts`, `session-access.ts` |
| Frontend cleanup | Suppression styles/, old components/, dead code                        | `-components/`, `-app/styles/`                                                           |
| Email            | Service Brevo (adapter port)                                           | `shared/email/`                                                                          |
| Validation       | Module input validation                                                | `shared/validation/`                                                                     |
| Tests            | 212 backend (Jest), 8 frontend (node:test)                             | `tests/unit/`, `tests/integration/`, `tests/contract/`                                   |

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

| Metrique               | Avant         | Apres         | Delta |
| ---------------------- | ------------- | ------------- | ----- |
| Tests backend          | 212           | 217           | +5    |
| Tests frontend         | 8             | 11            | +3    |
| Bugs ouverts (audit)   | 5             | 0             | -5    |
| S3 RGPD compliance     | NO-OP         | Fonctionnel   | Fix   |
| Email case-sensitivity | 1/4 use cases | 4/4 use cases | Fix   |
| useCallback coverage   | 2/6 functions | 6/6 functions | Fix   |

---

## Sprint 2 — Phase 1A: Store Blockers + Quick Security Wins (2026-03-19)

**Scope**: 9 items (S2-01, 02, 03, 19, 20abcd, 21, 23, 25) + 4 tests.
**Verification**: Backend 256 tests OK (37 suites), Frontend 13 tests OK, typecheck OK partout.

---

### S2-01 — Fix iOS/Android Permissions (Store Blocker)

**Probleme**: `photosPermission: false` bloquait l'acces a la galerie photo. `android.permission.CAMERA` manquant.

**Solution**:

- `photosPermission` → string descriptif `'Allow $(PRODUCT_NAME) to select artwork photos from your library.'`
- Ajout `'android.permission.CAMERA'` dans `android.permissions`
- `expo-camera` plugin injecte deja `NSCameraUsageDescription` automatiquement — pas de doublon dans infoPlist.

**Fichier modifie**: `museum-frontend/app.config.ts`

---

### S2-02 — Fix Support Page Placeholders (Store Blocker)

**Probleme**: Texte dev visible ("Replace placeholder handles before production release"), tokens `TO_FILL_*`.

**Solution**:

- Supprime texte dev de la hero card subtitle
- `TO_FILL_SUPPORT_RESPONSE_TIME` → "within 48 hours"
- `TO_FILL_SUPPORT_OWNER` → "the Musaium team"
- Supprime "(placeholder)" des labels
- `supportLinks.ts` — ajout champ `ready` boolean. Telegram = `true`, Instagram = `false` (handle non confirme).

**Statut**: PARTIEL — Instagram handle en attente de confirmation.

**Fichiers modifies**: `museum-frontend/app/(stack)/support.tsx`, `museum-frontend/shared/config/supportLinks.ts`

---

### S2-03 — PrivacyInfo.xcprivacy (Store Blocker)

**Probleme**: Apple exige un privacy manifest pour App Store Review.

**Solution**: Expo 53 supporte `privacyManifests` nativement sous `ios` config. Pas besoin de config plugin custom.

- `NSPrivacyTracking: false`
- `NSPrivacyTrackingDomains: []`
- `NSPrivacyAccessedAPITypes`: `NSPrivacyAccessedAPICategoryUserDefaults` (AsyncStorage), reason `CA92.1`
- `NSPrivacyCollectedDataTypes: []`
- Les plugins Expo (expo-camera, expo-av, expo-tracking-transparency) gerent leurs propres entries automatiquement.

**Fichier modifie**: `museum-frontend/app.config.ts`

---

### S2-20a — Login Oracle Fix

**Probleme**: Login avec email social-only retournait `'This account uses social sign-in...'` (code `SOCIAL_ACCOUNT`) — revele l'existence et le type du compte.

**Solution**: Remplace par `'Invalid credentials'` (code `INVALID_CREDENTIALS`). Les 3 chemins d'echec (user inexistant, social-only, mauvais mot de passe) retournent desormais la meme erreur. JSDoc explique l'opacite deliberee.

**Fichier modifie**: `museum-backend/src/modules/auth/core/useCase/authSession.service.ts`

---

### S2-20b — Rate Limit IP Bypass Fix

**Probleme**: `byIp()` fallait sur `req.header('x-forwarded-for')` — spoofable par un attaquant qui injecte le header.

**Solution**: Fallback vers `req.socket?.remoteAddress` au lieu du header. `req.ip` (via Express `trust proxy`) gere deja X-Forwarded-For correctement quand un reverse proxy est configure.

**Fichier modifie**: `museum-backend/src/helpers/middleware/rate-limit.middleware.ts`

---

### S2-20c — Report Comment Length Validation

**Probleme**: Pas de limite sur le champ `comment` dans `parseReportMessageRequest`.

**Solution**: Ajout `if (comment && comment.length > 500) throw badRequest(...)` apres extraction `optionalString`.

**Fichier modifie**: `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts`

---

### S2-20d — Register Response Strip

**Probleme**: `/register` retournait l'objet User complet avec `password: 'hidden'` et firstname/lastname.

**Solution**: `res.status(201).json({ user: { id: user.id, email: user.email } })`. Frontend `authService.register()` retourne `void` (corps ignore) — changement safe.

**Fichier modifie**: `museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts`

---

### S2-21 — Bcrypt Cost 10 → 12

**Probleme**: `bcrypt.hash(password, 10)` hard-code dans 3 endroits. Cost factor 10 insuffisant.

**Solution**:

- Nouveau `shared/security/bcrypt.ts` → exporte `BCRYPT_ROUNDS = 12`
- Import dans les 3 sites d'appel:
  - `user.repository.pg.ts:registerUser()`
  - `user.repository.pg.ts:updatePassword()`
  - `resetPassword.useCase.ts:execute()`
- Grep confirme: 0 occurrence residuelle de `bcrypt.hash(*, 10)`.

**Fichiers modifies/crees**:
| Fichier | Changement |
|---------|-----------|
| `museum-backend/src/shared/security/bcrypt.ts` | **NOUVEAU** — constante `BCRYPT_ROUNDS = 12` |
| `museum-backend/src/modules/auth/adapters/secondary/user.repository.pg.ts` | Import + remplacement 2 sites |
| `museum-backend/src/modules/auth/core/useCase/resetPassword.useCase.ts` | Import + remplacement 1 site |

---

### S2-23 — Hard-code includeDiagnostics=false en Production

**Probleme**: `LLM_INCLUDE_DIAGNOSTICS` pouvait etre force a `true` en prod via env var.

**Solution**: `nodeEnv === 'production' ? false : toBoolean(process.env.LLM_INCLUDE_DIAGNOSTICS, true)`. Production = toujours `false`, dev/test = env var respectee (default `true`).

**Fichier modifie**: `museum-backend/src/config/env.ts`

---

### S2-19 — npm audit dans CI

**Solution**: Ajout step `pnpm audit --audit-level=critical` (backend) et `npm audit --audit-level=critical` (frontend) apres install dans les workflows CI. `continue-on-error: true` pour ne pas bloquer immediatement.

**Fichiers modifies**: `.github/workflows/ci-backend.yml`, `.github/workflows/ci-frontend.yml`

---

### S2-25 — Document EXPO_PUBLIC_EAS_PROJECT_ID

**Solution**: Ajout dans `museum-frontend/.env.example` avec commentaire explicatif (commente par defaut, optionnel).

**Fichier modifie**: `museum-frontend/.env.example`

---

### Tests Phase 1A

**Nouveau fichier**: `museum-backend/tests/unit/auth/security-fixes.test.ts` — 4 tests:

| Test                      | Verifie                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| S2-20a: social-only login | Erreur = `INVALID_CREDENTIALS`, pas de leak "social"/"Apple"/"Google" |
| S2-20c: comment 500 chars | Boundary: 500 accepte, 501 rejete                                     |
| S2-20d: register response | Shape = `{ user: { id, email } }`, pas de password/names              |

---

### Bilan Phase 1A

| Metrique             | Avant  | Apres  | Delta   |
| -------------------- | ------ | ------ | ------- |
| Tests backend        | 217    | 256    | +39     |
| Tests frontend       | 11     | 13     | +2      |
| Store blockers       | 3 open | 0 open | -3      |
| Security items S2-20 | 4 open | 0 open | -4      |
| Bcrypt cost          | 10     | 12     | Upgrade |
| Phase 1A items       | 0/9    | 9/9    | Done    |

**Note**: S2-02 Instagram handle marque partiel (`[~]`) en attente de confirmation.

---

## Sprint 2 — Phase 3: SSE Streaming Chat (2026-03-19)

**Scope**: S2-04 + S2-05 — True LLM streaming via SSE
**Objectif**: Replace blocking 3-8s chat responses with progressive token-by-token streaming

### Resume executif

Full SSE streaming pipeline: backend streams LLM tokens via `text/event-stream`, frontend consumes via `fetch()` + `ReadableStream` with throttled React state updates (15/sec max). Output guardrail runs incrementally on accumulated text. Prompt restructured from strict JSON to text-first `[META]` delimiter format enabling answer tokens to stream before metadata. Feature-gated behind `FEATURE_FLAG_STREAMING`.

### S2-04 — SSE Streaming Backend

**Solution**: 12-step implementation following hexagonal architecture patterns.

**Key decisions**:

- **Prompt format**: Changed from `{"answer":"..."}` JSON to text-first + `\n[META]\n{...}` delimiter. Parser handles both formats (backward compat).
- **`prepareMessage()` extraction**: Shared pre-LLM logic (session access, validation, image storage, input guardrail, user message persistence) extracted from `postMessage()` into private `prepareMessage()`. Zero behavior change — validated by 360+ existing tests.
- **`postMessageStream()`**: Uses `onToken` callback pattern (not AsyncGenerator) to keep the port interface clean. Incremental output guardrail every ~50 chars with early-ALLOW on art keyword detection.
- **Compression bypass**: `compression({ filter })` checks `Accept: text/event-stream` header — `compression.filter` is a valid static function.
- **SSE route**: POST (not GET) with JSON body. No multer (text-only). `res.setTimeout(0)` + `req.socket.setTimeout(0)`. All errors caught internally (never calls `next()` — headers already sent).
- **Client disconnect handling**: `req.on('close')` → `AbortController.abort()` → cancels LangChain stream.

**Fichiers modifies (backend)**:

- `src/config/env.ts` — `featureFlags.streaming` added
- `.env.local.example` — `FEATURE_FLAG_STREAMING=false`
- `src/app.ts` — compression filter for SSE bypass
- `src/modules/chat/application/llm-sections.ts` — text-first + `[META]` prompt format
- `src/modules/chat/application/assistant-response.ts` — dual-format parser (META + legacy JSON), `extractMetadata()` helper
- `src/modules/chat/adapters/secondary/langchain.orchestrator.ts` — `ChatModel.stream()`, `ChatOrchestrator.generateStream()`, `LangChainChatOrchestrator.generateStream()`
- `src/modules/chat/application/chat.service.ts` — `prepareMessage()`, `commitAssistantResponse()`, `postMessageStream()`
- `src/modules/chat/adapters/primary/http/chat.route.ts` — SSE route handler
- `src/modules/chat/adapters/primary/http/sse.helpers.ts` — NEW: SSE response utilities
- `openapi/openapi.json` — streaming endpoint spec

### S2-05 — Frontend SSE Integration

**Solution**: Progressive streaming with throttled renders + automatic fallback.

**Key decisions**:

- **SSE parser**: Custom `parseSseChunk()` handles progressive buffer parsing with remainder tracking.
- **Streaming fetch**: Raw `fetch()` with `ReadableStream` (primary) or full `response.text()` (fallback). No EventSource (POST body needed).
- **`sendMessageSmart()`**: Tries streaming first, falls back to non-streaming on 404 (feature flag off). Image/audio messages always use non-streaming path.
- **Throttled renders**: Token text accumulated in `useRef`, flushed to React state via `setTimeout` at max 15 updates/sec (~66ms). Reduces ~800 renders to ~60.
- **`ChatMessageBubble` memoization**: `React.memo()` with custom comparator — always re-renders during streaming, otherwise only on id/text change. Animated blinking cursor `▍` during stream.
- **Typing indicator suppression**: Shows only when `isSending && !isStreaming` (streaming shows inline cursor).

**Fichiers modifies (frontend)**:

- `features/chat/infrastructure/sseParser.ts` — NEW: SSE event parser
- `features/chat/infrastructure/chatApi.ts` — `postMessageStream()`, `sendMessageSmart()`
- `features/chat/application/useChatSession.ts` — streaming path with throttled updates, `isStreaming` state
- `features/chat/ui/ChatMessageBubble.tsx` — `React.memo()`, `isStreaming` prop, animated cursor
- `features/chat/ui/ChatMessageList.tsx` — `isStreaming` prop, suppressed typing indicator
- `app/(stack)/chat/[sessionId].tsx` — passes `isStreaming` to list

### Tests added

- `tests/unit/chat/sse-helpers.test.ts` — 9 tests (SSE format, headers, destroyed guards)
- `tests/unit/chat/chat-service-stream.test.ts` — 5 tests (token streaming, guardrail blocking, error propagation, message persistence)
- `tests/unit/chat/assistant-response.test.ts` — 7 new tests ([META] format parsing, extractMetadata, backward compat)
- `museum-frontend/tests/sse-parser.test.ts` — 9 tests (all 4 event types, remainder, malformed JSON)

### Bilan Sprint 2 Phase 3

| Metrique                  | Avant | Apres | Delta |
| ------------------------- | ----- | ----- | ----- |
| Backend tests             | 339   | 360   | +21   |
| Frontend tests            | 13    | 22    | +9    |
| Backend suites            | 38    | 41    | +3    |
| New files                 | -     | 6     | +6    |
| Modified files (backend)  | -     | 10    | -     |
| Modified files (frontend) | -     | 6     | -     |

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

---

## Sprint 3 — Polish "Make it Delightful" (2026-03-19)

**Scope**: 14/17 tasks implemented (3 deferred, 2 blocked on S2). Frontend polish + backend infrastructure.
**Stats**: ~60 files modified/created, 234 backend tests (227+7), 13 frontend tests (11+2), 0 failures.

### Resume executif

Sprint 3 delivers dark mode, skeleton loading, onboarding carousel, image preview+crop, message context menu, conversation search+infinite scroll, haptic feedback, ATTrackingManager, TTS voice mode, Redis cache layer, GDPR data export, feature flags, log aggregation, and dashboard title museum name priority fix.

Post-implementation audit (3 parallel teams: backend, frontend, QA/regression) found and fixed 1 CRITICAL + 5 HIGH + 5 MEDIUM issues.

### Taches realisees

#### S3-01: Dark Mode Theme System (FE)

- **Fichiers crees**: `shared/ui/themes.ts` (ThemePalette + light/dark palettes), `shared/ui/ThemeContext.tsx` (ThemeProvider + useTheme hook)
- **Fichiers modifies**: `shared/ui/liquidTheme.ts` (themeColors function + backward-compat static export), `app/_layout.tsx` (ThemeProvider wrapper + ThemedStatusBar), `shared/ui/LiquidScreen.tsx`, `shared/ui/GlassCard.tsx`, `app/(tabs)/_layout.tsx`, `features/chat/ui/ChatInput.tsx`, `features/chat/ui/ChatMessageBubble.tsx`, `features/chat/ui/TypingIndicator.tsx`, `app/(stack)/settings.tsx` (theme toggle UI), `shared/ui/FloatingContextMenu.tsx`
- **Choix**: System/light/dark mode persisted via AsyncStorage. `liquidColors` export kept for backward compatibility with unmigrated files.

#### S3-03: Onboarding Carousel (FE)

- **Fichiers crees**: `features/onboarding/application/useOnboarding.ts`, `features/onboarding/ui/OnboardingSlide.tsx` (Reanimated entrance animations), `features/onboarding/ui/StepIndicator.tsx`
- **Fichiers modifies**: `app/(stack)/onboarding.tsx` (complete rewrite: FlatList carousel + snapToInterval)
- **Audit fix**: Removed conflicting `pagingEnabled` (supersedes `snapToInterval` on iOS).

#### S3-04: Voice Mode TTS (BE)

- **Fichiers crees**: `modules/chat/adapters/secondary/text-to-speech.openai.ts` (TTS port + OpenAI impl + disabled stub)
- **Fichiers modifies**: `config/env.ts` (tts section), `modules/chat/application/chat.service.ts` (synthesizeSpeech method + cache), `modules/chat/adapters/primary/http/chat.route.ts` (POST /messages/:messageId/tts), `modules/chat/index.ts` (conditional TTS wiring)
- **Audit fix**: Added feature flag gate (`env.featureFlags.voiceMode`) + session rate limiter to TTS route.

#### S3-05: Image Preview + Crop (FE)

- **Fichiers crees**: `features/chat/application/useImageManipulation.ts`, `features/chat/ui/ImagePreviewModal.tsx`
- **Fichiers modifies**: `features/chat/application/useImagePicker.ts` (pendingImage state), `app/(stack)/chat/[sessionId].tsx`
- **Audit fix**: Moved setState from render body to useEffect in ImagePreviewModal.

#### S3-06: Message Context Menu (FE)

- **Fichiers crees**: `features/chat/application/useMessageActions.ts`, `features/chat/ui/MessageContextMenu.tsx`
- **Fichiers modifies**: `app/(stack)/chat/[sessionId].tsx` (contextMenuMessage state, onMessageLongPress)

#### S3-07: Skeleton Loading (FE)

- **Fichiers crees**: `shared/ui/SkeletonBox.tsx` (Reanimated shimmer), `shared/ui/SkeletonConversationCard.tsx`, `shared/ui/SkeletonChatBubble.tsx`
- **Fichiers modifies**: `app/(tabs)/conversations.tsx`, `app/(stack)/chat/[sessionId].tsx` (replacing ActivityIndicator)

#### S3-08: Conversation Search + Infinite Scroll (FE)

- **Fichiers crees**: `features/conversation/ui/ConversationSearchBar.tsx`
- **Fichiers modifies**: `app/(tabs)/conversations.tsx` (search state, cursor pagination, onEndReached + onEndReachedThreshold)
- **Audit fix**: Added ref-based guard to prevent double-fire race condition on loadMore.

#### S3-09: Redis Cache Layer (BE)

- **Fichiers crees**: `shared/cache/cache.port.ts`, `shared/cache/redis-cache.service.ts`, `shared/cache/noop-cache.service.ts`
- **Fichiers modifies**: `config/env.ts` (cache section), `modules/chat/application/chat.service.ts` (ChatServiceDeps options object + cache reads/invalidation), `modules/chat/index.ts` (CacheService pass-through), `app.ts` (Redis init), `tests/helpers/chat/chatTestApp.ts` (options object constructor), `tests/e2e/api.postgres.e2e.test.ts`
- **Audit fix**: Added error logging on Redis connection failure. Fixed InMemoryChatRepository to apply sessionUpdates (title, museumName, visitContext).

#### S3-11: GDPR Data Export (BE)

- **Fichiers crees**: `modules/auth/core/domain/exportUserData.types.ts`, `modules/auth/core/useCase/exportUserData.useCase.ts`
- **Fichiers modifies**: `modules/chat/domain/chat.repository.interface.ts` (exportUserData method), `modules/chat/infrastructure/chat.repository.typeorm.ts`, `modules/chat/index.ts` (getChatRepository getter), `modules/auth/core/useCase/index.ts` (lazy-bound chatDataExportProxy), `modules/auth/adapters/primary/http/auth.route.ts` (GET /export-data)
- **Audit fix CRITICAL**: Route was casting req.user (JWT claims) with createdAt/updatedAt which don't exist in JWT. Fixed to fetch full user entity from DB before passing to use case.

#### S3-12: Feature Flags (DV)

- **Fichiers crees**: `shared/feature-flags/feature-flags.port.ts` (FeatureFlagService + StaticFeatureFlagService), `tests/unit/shared/feature-flags.test.ts` (3 tests)
- **Fichiers modifies**: `config/env.ts`, `app.ts`, `shared/routers/api.router.ts`

#### S3-15: Haptic Feedback (FE)

- **Fichiers modifies**: `features/chat/ui/ChatInput.tsx`, `features/chat/ui/ChatMessageBubble.tsx`, `shared/ui/FloatingContextMenu.tsx`, `components/CameraView.tsx`, `app/(stack)/chat/[sessionId].tsx`

#### S3-17: Log Aggregation (DV)

- **Fichiers crees**: `deploy/promtail-config.yml`
- **Fichiers modifies**: `shared/logger/logger.ts` (structured fields), `helpers/middleware/request-logger.middleware.ts` (userId)

#### S3-18a: ATTrackingManager (FE)

- **Fichiers modifies**: `app.config.ts` (plugin + NSUserTrackingUsageDescription), `app/_layout.tsx` (requestTrackingPermissionsAsync)
- **Dep ajoutee**: `expo-tracking-transparency`

#### S3-18b: Dashboard Title Fix (FS)

- **Fichiers modifies**: `modules/chat/application/visit-context.ts` (museum mode priority), `features/chat/domain/dashboard-session.ts` (museumName dedup)
- **Tests ajoutes**: 3 backend (visit-context.test.ts), 2 frontend (dashboard-session-mapper.test.ts)

### Audit post-implementation (3 equipes paralleles)

| #   | Severite | Corrige | Probleme                                               | Cause                                                           | Impact                                                   |
| --- | -------- | ------- | ------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | CRITICAL | OUI     | GDPR export crash: req.user manque createdAt/updatedAt | JWT ne contient que id/email/name                               | TypeError a chaque appel export-data                     |
| 2   | HIGH     | OUI     | TTS non gate par feature flag                          | featureFlagService accepte mais jamais lu dans les routes       | Endpoint accessible meme si voiceMode=false              |
| 3   | HIGH     | OUI     | TTS sans rate limit                                    | Route manque sessionLimiter                                     | Abus API OpenAI possible                                 |
| 4   | HIGH     | OUI     | InMemoryChatRepository n'applique pas sessionUpdates   | Seul version++ etait fait, pas title/museumName/visitContext    | Tests integration silencieusement faux sur visit context |
| 5   | HIGH     | OUI     | ImagePreviewModal setState pendant render              | setState directement dans le corps du composant, hors useEffect | Anti-pattern React, bug de staleness potentiel           |
| 6   | HIGH     | OUI     | Onboarding pagingEnabled + snapToInterval conflit      | pagingEnabled supersede snapToInterval sur iOS                  | Snapping desaligne                                       |
| 7   | MEDIUM   | OUI     | Redis connection failure silencieuse                   | catch vide                                                      | Pas de log, pas de diagnostic                            |
| 8   | MEDIUM   | OUI     | FloatingContextMenu tint='light' en dur                | Non migre vers theme                                            | Broken en dark mode                                      |
| 9   | MEDIUM   | OUI     | StatusBar non synce avec theme override                | style="auto" suit l'OS, pas le theme manuel                     | Status bar invisible en dark mode force                  |
| 10  | MEDIUM   | OUI     | Infinite scroll double-fire                            | useState guard vs useRef guard                                  | Doublons possibles dans la liste                         |
| 11  | MEDIUM   | OUI     | JSDoc "Debounced" sans debounce                        | Documentation trompeuse                                         | Confusion developpeur                                    |

### Points non verifies (a surveiller)

| Point                                                  | Raison                                                        | Statut (audit 2026-03-21) |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------------------------- |
| TTS base64 cache en Redis — impact memoire             | Pas de maxmemory configure; 200-500KB par message cache       | OUVERT — Redis maxmemory a configurer |
| BlurView tint sur Android 13                           | expo-blur a un support limite sur Android                     | OUVERT — limitation Expo connue |
| GDPR export OOM sur gros utilisateurs                  | Eager loading de toutes les sessions+messages sans pagination | CORRIGE — pagination + transaction REPEATABLE READ |
| Cache race condition (read stale pendant invalidation) | Trade-off accepte du pattern cache-aside                      | ACCEPTE — trade-off documente |
| ~~Pas de tests pour cache, TTS, GDPR export~~         | ~~Couverture de tests a ajouter en priorite~~                 | RESOLU — tests existent: chat-service-tts.test.ts, chat-service-cache.test.ts, export-user-data.test.ts |
| ~~OpenAPI spec manque TTS + GDPR export~~              | ~~Contract drift~~                                            | RESOLU — endpoints documentes dans openapi.json |

### Audit forensique post-remediation (3 equipes paralleles, 2eme passe)

6 corrections supplementaires appliquees:
| # | Fichier | Correction |
|---|---------|-----------|
| F1 | `.env.local.example` | Ajout 13 env vars manquantes (cache, TTS, feature flags, Brevo) |
| F2 | `conversations.tsx` | Migration theme complet (useTheme, inline colors sur tous les textes/cards) |
| F3 | `chat/[sessionId].tsx` | Migration theme (header, close button, attach, audio, recording) |
| F4 | `chat.service.ts` | Cache invalidation session list dans createSession |
| F5 | `OnboardingSlide.tsx`, `StepIndicator.tsx`, `onboarding.tsx` | Migration theme (tous hardcoded colors remplaces) |
| F6 | `MessageContextMenu.tsx` | Migration theme (sheet bg, text, icons adaptes isDark) |
| F7 | `api.router.ts` | featureFlagService: dead underscore supprime, void explicit |
| F8 | `logger.ts` | Version resolue depuis APP_VERSION/npm_package_version au lieu de hardcoded |

---

## Sprint 2 — Phase 2: Infrastructure + Auth + GDPR (2026-03-19)

**Scope**: 7 items (S2-22, S2-08, S2-17, S2-18, S2-13, S2-09, S2-14)
**Stats**: 18 fichiers modifies, 9 nouveaux, 4 fichiers test nouveaux, 20 tests ajoutes, 1 migration generee.

### Resume executif

Phase 2 du Sprint 2. Strip PII des JWT (fondation), Redis infra, cron token cleanup, change password, email verification, OpenAPI completion, GDPR checkbox frontend. Corrige le bug pre-existant `/export-data` (crash sur `req.user.createdAt`/`updatedAt` absents du JWT). Etablit le pattern `req.user = { id }` + DB lookup via `GetProfileUseCase`.

### Ordre d'execution et dependances

```
S2-22 (strip JWT PII) → fondation pour tous les autres
S2-08 (Redis infra)   → prerequis S2-17 (lock distribue)
S2-17 (token cleanup)  → utilise setNx de S2-08
S2-18 (change password) → utilise req.user={id} de S2-22
S2-13 (email verify)   → modifie RegisterUseCase, entity User
S2-09 (OpenAPI)        → doit inclure change-password + verify-email
S2-14 (GDPR checkbox)  → frontend independant
```

### Changements cles

| #   | Item                      | Fichiers principaux                                                                                                                                              | Detail                                                                                                                                                                                                                           |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | S2-22: Strip PII JWT      | `user-jwt-payload.ts`, `authSession.service.ts`, `authenticated.middleware.ts`, `auth.route.ts`, NEW `getProfile.useCase.ts`                                     | AccessTokenClaims: `{sub,type,jti}` only. `verifyAccessToken()` returns `{id}`. `isAuthenticated` sets `req.user={id}`. `/me` et `/export-data` migres vers DB lookup via `GetProfileUseCase`.                                   |
| 2   | S2-08: Redis container    | `docker-compose.dev.yml`, `cache.port.ts`, `redis-cache.service.ts`, `noop-cache.service.ts`, `app.ts`, `.env.local.example`                                     | Redis 7-alpine ajoute. `setNx` sur interface CacheService + implementations. `createApp()` accepte `cacheService` optionnel.                                                                                                     |
| 3   | S2-17: Token cleanup      | NEW `tokenCleanup.service.ts`, `index.ts`                                                                                                                        | `TokenCleanupService`: lock distribue via `setNx`, batch 10K, intervalle 6h, `timer.unref()`. Wire dans `index.ts` avec shutdown propre.                                                                                         |
| 4   | S2-18: Change password    | NEW `changePassword.useCase.ts`, `refresh-token.repository.pg.ts`, `auth.route.ts`, `useCase/index.ts`                                                           | `revokeAllForUser()` sur RefreshTokenRepositoryPg. UseCase: verify current → validate new → check not same → `updatePassword(plain-text)` → revoke all. `PUT /change-password`. Shared `RefreshTokenRepositoryPg` singleton.     |
| 5   | S2-13: Email verification | `user.entity.ts`, `user.repository.interface.ts`, `user.repository.pg.ts`, `register.useCase.ts`, NEW `verifyEmail.useCase.ts`, migration `AddEmailVerification` | 3 colonnes: `email_verified`, `verification_token`, `verification_token_expires`. Index partiel. `registerSocialUser()` set `email_verified=true`. RegisterUseCase envoie email (non-bloquant, try/catch). `POST /verify-email`. |
| 6   | S2-09: OpenAPI spec       | `openapi/openapi.json`, `openapi-response.contract.test.ts`, `api.postgres.e2e.test.ts`                                                                          | Register 201: `{user:{id,email}}`. 5 endpoints ajoutes. Contract tests mis a jour (type `put` ajoute). E2E test register assertion corrige (ancien format `{email, password:'hidden'}`). Frontend types regeneres.               |
| 7   | S2-14: GDPR checkbox      | `museum-frontend/app/auth.tsx`                                                                                                                                   | Checkbox avec liens Terms/Privacy en mode register. Desactive sign-up + social buttons si non coche. Apple: `pointerEvents` wrapper. Google: `disabled`. Reset `gdprAccepted` au toggle mode. Login: texte legal simple.         |

### Decisions techniques

| Decision                                         | Raison                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `updatePassword()` recoit plain-text, pas hash   | Evite double-hashing: `updatePassword` hash en interne avec `BCRYPT_ROUNDS`. Pre-hasher causerait mots de passe inverifiables. |
| Verification token stocke en clair               | Risque acceptable pour email verification (inferieur aux auth tokens). Coherence avec reset_token existant.                    |
| Social users `email_verified=true` a la creation | Providers (Apple/Google) verifient l'email. Sans ca, tous les social users apparaitraient non-verifies.                        |
| Single-batch token cleanup (10K/tick)            | Leger, non-bloquant. Si >10K expires, ticks suivants nettoient. Script standalone pour purge manuelle.                         |
| `NoopCacheService.setNx` retourne `true`         | Sans Redis, le cleanup s'execute toujours (pas de lock). Correct pour dev/test.                                                |

### Tests ajoutes

| Fichier                                   | Tests | Couvre                                                                                                   |
| ----------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| `tests/unit/auth/jwt-pii-strip.test.ts`   | 5     | verifyAccessToken returns {id}, token decoded has no PII, login response has SafeUser, GetProfileUseCase |
| `tests/unit/auth/token-cleanup.test.ts`   | 4     | Lock acquired → runs, lock held → skips, no cache → runs, DB error → returns 0                           |
| `tests/unit/auth/change-password.test.ts` | 6     | Wrong password, same password, weak password, social-only, success + revoke, user not found              |
| `tests/unit/auth/verify-email.test.ts`    | 5     | Valid token, expired token, empty token, register generates token, register succeeds if email fails      |

### Bug fixes inclus

| Bug                                                | Cause                                                                                                 | Fix                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `/export-data` crash sur `createdAt`/`updatedAt`   | JWT ne contenait jamais ces champs, cast incorrect                                                    | DB lookup via `GetProfileUseCase`        |
| E2E test register assertion                        | Phase 1A changed response to `{user:{id,email}}` but test still expected `{email, password:'hidden'}` | Updated assertion                        |
| `request-logger.middleware.ts` ts-node error       | Global Express augmentation not picked up by ts-node at runtime                                       | Explicit type assertions                 |
| Frontend `expo-tracking-transparency` crash on web | Top-level import loads native module eagerly                                                          | Lazy `import()` inside Platform.OS check |

### Verification finale

- [x] Backend `tsc --noEmit`: OK
- [x] Backend tests: 30/30 suites, 247 passed, 7 skipped (AI tests)
- [x] New tests: 4 suites, 20 tests, all pass
- [x] `pnpm openapi:validate`: OK (20 paths, 22 operations)
- [x] `pnpm test:contract:openapi`: 2/2 pass
- [x] Frontend `tsc --noEmit`: OK
- [x] Frontend tests: 13/13 pass
- [x] Frontend OpenAPI types regenerated and synced

### Bilan Sprint 3 (post-forensic)

| Metrique              | Avant (S1.5) | Apres (S3)                                                             | Delta |
| --------------------- | ------------ | ---------------------------------------------------------------------- | ----- |
| Backend tests         | 217          | 247                                                                    | +30   |
| Frontend tests        | 11           | 13                                                                     | +2    |
| Backend test suites   | 24           | 30                                                                     | +6    |
| New dependencies (BE) | 0            | 1 (ioredis)                                                            | +1    |
| New dependencies (FE) | 0            | 3 (expo-tracking-transparency, expo-image-manipulator, expo-clipboard) | +3    |
| New API endpoints     | 0            | 2 (TTS, GDPR export)                                                   | +2    |
| New env vars          | 0            | 13 (cache, TTS, feature flags)                                         | +13   |
| Audit issues fixed    | 0            | 19 (1 CRITICAL, 5 HIGH, 5+8 MEDIUM)                                    | +19   |

---

## Sprint 3 Remediation — Forensic Completion (2026-03-19)

**Scope**: 4 remediation items from forensic audit, closing all deferred S3 tasks.
**Stats**: 40+ fichiers modifies/crees, 93 tests ajoutes (267→360), 1 migration generee.

### Resume executif

Cloture des 4 items identifies par les audits forensiques Sprint 3: (1) OpenAPI TTS endpoint + contract drift fix, (2) couverture tests TTS/cache/OCR/GDPR, (3) migration complete liquidColors → useTheme (15 fichiers), (4) 3 features reportees implementees (offline support, OCR guard, API key auth). Passe d'audit destructive avec 3 agents paralleles: 1 CRITICAL corrige (migration manquante), 2 HIGH corriges (async middleware, snapshot instabilite), 5 MEDIUM corriges.

### Changements cles

| Domaine              | Action                                                                                               | Fichiers cles                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Item 1: OpenAPI      | TTS endpoint + FeatureUnavailable response + API key schemas/endpoints ajoutés au spec               | `openapi/openapi.json` (24 paths, 27 ops)                             |
| Item 1: Frontend     | `synthesizeSpeech()` API call + `responseType` support dans httpRequest                              | `chatApi.ts`, `services/http.ts`                                      |
| Item 2: Tests TTS    | 7 tests: audio buffer, empty text, user msg 400, ownership 404, no TTS 501, cache hit, no cache      | `tests/integration/chat/chat-service-tts.test.ts`                     |
| Item 2: Tests Cache  | 4 tests: getSession cached, listSessions cached, postMessage invalidates, createSession invalidates  | `tests/integration/chat/chat-service-cache.test.ts`                   |
| Item 2: Tests GDPR   | 3 tests: full payload, no chat data, null optional fields                                            | `tests/unit/auth/export-user-data.test.ts`                            |
| Item 2: Test helpers | InMemoryCacheService, FakeTextToSpeechService, FakeOcrService + buildChatTestService overload        | `tests/helpers/`                                                      |
| Item 3: Theme        | 15 fichiers migres de `liquidColors` vers `useTheme()` (chat UI, screens, shared UI)                 | Batch A (7), B (3), C (5)                                             |
| Item 4A: OCR Guard   | OcrService port + TesseractOcrService + DisabledOcrService + fail-open integration + 4 tests         | `ocr-service.ts`, `chat.service.ts`, `chat-service-ocr-guard.test.ts` |
| Item 4B: API Keys    | ApiKey entity + HMAC-SHA256 hashing + timing-safe middleware + CRUD use cases + 14 tests + migration | 9 new files + auth.route.ts + authenticated.middleware.ts             |
| Item 4C: Offline     | ConnectivityProvider + OfflineQueue + useOfflineQueue + OfflineBanner + useChatSession integration   | 5 new files + useChatSession.ts + \_layout.tsx                        |

### Audit destructif (3 agents paralleles)

| Severity | Count | Corriges | Exemples                                                                                                           |
| -------- | ----- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| CRITICAL | 1     | 1        | Migration `api_keys` manquante — generee                                                                           |
| HIGH     | 2     | 2        | async `validateApiKey` sans `.catch(next)`, `useSyncExternalStore` snapshot instabilite                            |
| MEDIUM   | 7     | 5        | `synthesizeSpeech` 204 dead code, OCR fail-open sans logging, contract tests API keys manquants, `setNx` TTL check |
| LOW      | 6     | 0        | Performance concerns (Tesseract worker-per-request, base64 cache overhead), architecture notes                     |

### Points non verifies (hors scope)

- `ConversationSearchBar.tsx`: pas de migration theme (fichier pas dans le scope initial)
- Quelques fichiers avec couleurs hardcoded residuelles dans StyleSheet (non-bloquant, dark mode fonctionnel sur les tokens principaux)
- Offline queue flush ne renvoie pas la reponse assistant au state (design limitation, reload session la recupere)

### Verification finale

- [x] Backend `tsc --noEmit`: OK
- [x] Backend tests: 40/40 suites, 360 passed, 7 skipped (AI tests)
- [x] `pnpm openapi:validate`: OK (24 paths, 27 operations)
- [x] `pnpm test:contract:openapi`: 2/2 pass (incl. API key schemas)
- [x] Frontend `tsc --noEmit`: OK (5 pre-existing i18n errors only)
- [x] Frontend tests: 13/13 pass (or 22 with streaming tests)
- [x] Frontend `liquidColors` refs: 0 (definition file only)
- [x] New dependencies: tesseract.js (BE), @react-native-community/netinfo (FE)

---

## S2-06 + S3-14 — i18n 7 langues (2026-03-19)

> Internationalization complete: 7 langues (EN, FR, ES, DE, IT, JA, ZH), 296 cles de traduction.
> Backend: prompts English-only + directive `Reply in ${language}`, refusals/fallbacks multilingues.
> Frontend: react-i18next + expo-localization, language picker dans Preferences.
> 2 passes d'audit critiques, 9 bugs corriges.

### Decisions d'architecture

| Decision                  | Choix                                         | Raison                                                          |
| ------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| Prompts LLM               | English-only + `Reply in ${language}`         | Elimine 16+ ternaires FR/EN, fiable avec GPT-4o/Gemini/Deepseek |
| Frontend framework        | react-i18next + expo-localization             | Standard RN, useSuspense: false, bundles statiques              |
| Locale propagation        | Accept-Language header + context.locale body  | Double canal: header global, body override par requete          |
| Guardrail refusals        | Dictionnaire statique 7 langues x 3 variantes | Pas de LLM call pour les refus                                  |
| Locale storage            | `runtime.defaultLocale` (cle unique)          | Evite desync entre I18nContext et runtimeSettings               |
| Device language detection | Seulement si aucune preference stockee        | Respect du choix explicite de l'utilisateur                     |

### Backend — Nouveaux fichiers

| Fichier                                                | Role                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/shared/i18n/locale.ts`                            | `resolveLocale()`, `localeToLanguageName()`, `parseAcceptLanguageHeader()`, `SUPPORTED_LOCALES` |
| `src/shared/i18n/guardrail-refusals.ts`                | 21 strings statiques (7 langues x 3 variantes: insult, external_request, default)               |
| `src/shared/i18n/fallback-messages.ts`                 | Templates de fallback LLM localises (7 langues)                                                 |
| `src/helpers/middleware/accept-language.middleware.ts` | Parse Accept-Language → `req.clientLocale`                                                      |

### Backend — Fichiers modifies

| Fichier                        | Changement                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.ts`                       | +middleware acceptLanguage, +Accept-Language dans CORS allowedHeaders                                                                                                                                            |
| `llm-sections.ts`              | Supprime `isFrenchLocale()` + 16 ternaires. Prompts EN-only + `Reply in ${language}`. Fallback localise via `FALLBACK_TEMPLATES[locale].defaultQuestion`                                                         |
| `art-topic-guardrail.ts`       | Supprime `isFrench()`. `buildGuardrailRefusal` → lookup `GUARDRAIL_REFUSALS[resolveLocale()]`. +CJK keywords (8), +greetings multilangues. +`isCjk()` guard pour `containsKeyword` (`\b` ne marche pas avec CJK) |
| `langchain.orchestrator.ts`    | `startsWith('fr') ? 'French' : 'English'` → `localeToLanguageName(resolveLocale([locale]))`                                                                                                                      |
| `chat.route.ts`                | Accept-Language fallback dans messages/audio/stream/sessions handlers                                                                                                                                            |
| `chat.service.ts`              | Session locale update mid-conversation (normalise via `resolveLocale()` avant persistance)                                                                                                                       |
| `chat.repository.interface.ts` | +`locale?: string` dans `PersistMessageSessionUpdates`                                                                                                                                                           |
| `chat.repository.typeorm.ts`   | Applique `sessionUpdates.locale` dans la transaction persistMessage                                                                                                                                              |

### Frontend — Nouveaux fichiers

| Fichier                                                  | Role                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `shared/i18n/i18n.ts`                                    | Init i18next avec 7 bundles statiques                                                  |
| `shared/i18n/I18nContext.tsx`                            | Provider React: AsyncStorage + device detection + sync i18n/httpClient/runtimeSettings |
| `shared/i18n/types.ts`                                   | Module augmentation i18next pour type-safe keys                                        |
| `shared/config/supportedLocales.ts`                      | `LANGUAGE_OPTIONS`, `toSupportedLocale()`                                              |
| `shared/locales/{en,fr,es,de,it,ja,zh}/translation.json` | 296 cles chacun                                                                        |
| `scripts/check-i18n-completeness.js`                     | CI: verifie toutes les cles EN existent dans chaque langue                             |

### Frontend — Fichiers modifies (~25 fichiers)

- `app/_layout.tsx` — mount I18nProvider (outermost)
- `shared/infrastructure/httpClient.ts` — `setLocale()`/`getLocale()` + Accept-Language interceptor
- `features/chat/infrastructure/chatApi.ts` — Accept-Language sur streaming fetch()
- `app/(stack)/preferences.tsx` — Language picker (7 boutons) remplace TextInput libre
- `features/chat/ui/WelcomeCard.tsx` — Supprime `locale` prop + `getEnSuggestions`/`getFrSuggestions`, remplace par `t()`
- ~20 autres screens/components — extraction strings `t()`

### Tests

| Suite            | Avant                     | Apres                                                                                  |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| Backend total    | 346 (1 fail pre-existant) | 367 (40/40 suites pass)                                                                |
| Backend nouveaux | —                         | `locale.test.ts` (35), `guardrail-refusals.test.ts` (5), `accept-language.test.ts` (4) |
| Backend modifies | —                         | `llm-sections.test.ts` (+7 locales), `art-topic-guardrail.test.ts` (+4 locales)        |
| Frontend         | 13                        | 22                                                                                     |
| i18n CI check    | —                         | 7 langues x 296 cles = PASS                                                            |

### Bugs trouves et corriges par audit

| #   | Severite | Fichier                                          | Bug                                                                             | Correction                                             |
| --- | -------- | ------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | CRITICAL | `art-topic-guardrail.ts`                         | `\b` regex ne fonctionne pas avec CJK — keywords JA/ZH ne matchent jamais       | `isCjk()` guard → `includes()` pour CJK                |
| 2   | CRITICAL | `art-topic-guardrail.ts`                         | `GREETING_PATTERN` `\b` casse apres こんにちは/你好                             | `\b` → `(\b\|$)` en fin de pattern                     |
| 3   | CRITICAL | `llm-sections.ts`                                | Fallback `'Artwork question.'` hardcode EN dans texte sinon localise            | Utilise `FALLBACK_TEMPLATES[locale].defaultQuestion`   |
| 4   | HIGH     | `I18nContext.tsx`                                | Dual AsyncStorage keys (`app.language` vs `runtime.defaultLocale`)              | Unifie: lit `runtime.defaultLocale` directement        |
| 5   | HIGH     | `guardrail-refusals.ts` + `fallback-messages.ts` | Diacritiques manquants FR/ES/DE/IT                                              | Tous accents corriges                                  |
| 6   | MEDIUM   | `chat.service.ts`                                | `requestedLocale` brut persiste en DB                                           | Normalise via `resolveLocale()`                        |
| 7   | MEDIUM   | `I18nContext.tsx`                                | `defaults.defaultLocale = "en-US"` empeche detection device pour nouveaux users | Lit raw AsyncStorage, detecte device si null           |
| 8   | MEDIUM   | `chatApi.ts`                                     | Streaming `fetch()` sans Accept-Language header                                 | Ajoute `'Accept-Language': getLocale()`                |
| 9   | LOW      | `check-i18n-completeness.js`                     | Valeurs `null` dans JSON non detectees                                          | Ajoute check `value === null` et `typeof !== 'string'` |

### Verification finale

- [x] Backend `tsc --noEmit`: 0 erreurs
- [x] Frontend `tsc --noEmit`: 0 erreurs nouvelles
- [x] Backend tests: 120/120 i18n tests pass, 360+ total pass
- [x] Frontend tests: 22 pass
- [x] i18n completeness: 7 langues x 296 cles PASS
- [x] Aucun `isFrenchLocale`/`isFrench`/`startsWith('fr')` residuel dans backend src/
- [x] 2 passes d'audit adversarial (4 agents x 2 = 8 audits paralleles)

---

## Sprint 2 (suite) — Lot A+C: Services consolidation, x-request-id, FlatList perf, a11y (2026-03-21)

> 4 taches implementees (S2-07, S2-15, S2-16, S2-24). 26 tests frontend (22 → 26). 3 equipes de review (Architecture, Frontend Integration, QA/Risk).

### S2-16 — Consolider services/ → features/auth/ + shared/

**Probleme** : le repertoire `services/` (6 fichiers, 625 lignes) melangeait auth-specific et cross-cutting dans un dossier plat, hors architecture feature-driven.

**Solution** : migration en 6 phases ordonnees par dependance :

1. `apiConfig.ts` → `shared/infrastructure/apiConfig.ts` (cross-cutting)
2. `http.ts` → `shared/api/httpRequest.ts` (generic HTTP wrapper)
3. `tokenStore.ts` + `authStorage.ts` → `features/auth/infrastructure/authTokenStore.ts` (merge in-memory + persistent)
4. `authService.ts` → `features/auth/infrastructure/authApi.ts` (auth HTTP adapter)
5. `socialAuthService.ts` → `features/auth/infrastructure/socialAuthProviders.ts`
6. Suppression `services/` + ancien `authStorage.ts`

**Fichiers crees** : `shared/infrastructure/apiConfig.ts`, `shared/api/httpRequest.ts`, `features/auth/infrastructure/authTokenStore.ts`, `features/auth/infrastructure/authApi.ts`, `features/auth/infrastructure/socialAuthProviders.ts`
**Fichiers supprimes** : `services/index.ts`, `services/authService.ts`, `services/apiConfig.ts`, `services/http.ts`, `services/tokenStore.ts`, `services/socialAuthService.ts`, `features/auth/infrastructure/authStorage.ts`
**Consumers mis a jour** : 10 fichiers (AuthContext.tsx, \_layout.tsx, auth.tsx, settings.tsx, httpClient.ts, useSocialLogin.ts, openapiClient.ts, chatApi.ts, runtimeSettings.ts, StartupConfigurationErrorScreen.tsx)

**Verification** : grep `@/services` = 0 resultats, typecheck OK, 22 tests green, pas de dependance circulaire.

### S2-24 — Propagation x-request-id depuis frontend + enrichissement AppError

**Probleme** : le backend genere un `requestId` pour chaque requete mais le frontend n'en envoie jamais — impossible de correler logs mobile ↔ backend.

**Solution** :

- **Nouveau fichier** `shared/infrastructure/requestId.ts` — generateur UUID v4-like (Math.random, suffisant pour tracing)
- **httpClient.ts** : injection `X-Request-Id` dans l'interceptor request (ligne 102), log en DEV (ligne 124)
- **chatApi.ts** : injection `X-Request-Id` dans les headers SSE fetch (ligne 367)
- **AppError.ts** : ajout champ `requestId?: string` a l'interface + assignation dans `createAppError`
- **httpClient.ts mapAxiosError** : extraction `requestId` depuis `response.data.error.requestId` via nouveau helper `getApiRequestId()`, threade dans les 6 appels `createAppError` (401, 403x2, 404, 4xx, 5xx)

**Test** : `tests/request-id.test.ts` — 4 tests (format UUID, unicite 100 appels, version nibble, variant bits)

### S2-15 — FlatList performance

**Probleme** : 3 FlatLists sans optimisation de rendu, inline renderItem recree a chaque render.

**Solution** :

- **Conversations** (`conversations.tsx`) : extraction `renderItem` en `useCallback` avec deps completes (`theme, savedSessionIds, t, toggleSavedSession, router`), ajout `initialNumToRender={10}`, `maxToRenderPerBatch={8}`, `windowSize={5}`, `removeClippedSubviews={Platform.OS === 'android'}`
- **Chat messages** (`ChatMessageList.tsx`) : ajout `initialNumToRender={15}`, `maxToRenderPerBatch={10}`, `windowSize={7}` (renderItem deja en useCallback, ChatMessageBubble deja memo)
- **Onboarding** (`OnboardingSlide.tsx`) : wrap `React.memo` (3 slides statiques, evite re-renders au swipe)
- Pas de `getItemLayout` (hauteur variable), pas de `removeClippedSubviews` sur chat (flicker images)

### S2-07 — Accessibility labels/roles/hints

**Probleme** : 0% de couverture a11y — 100+ elements interactifs sans label sur 14 ecrans.

**Solution** :

- **Traductions** : section `"a11y"` ajoutee aux 7 fichiers de traduction (en, fr, es, de, it, ja, zh) — ~85 cles par langue
- **22 fichiers de composants modifies** : ajout `accessibilityRole`, `accessibilityLabel={t('a11y.xxx')}`, `accessibilityHint`, `accessibilityState` sur tous les Pressable, TextInput, Switch, TouchableOpacity
- Props dynamiques : `accessibilityState={{ checked: gdprAccepted }}` (checkbox), `{{ checked: museumMode }}` (switch), `{{ selected: mode === option.value }}` (theme/language), `{{ disabled }}` (boutons disabled)
- Labels dynamiques : `accessibilityLabel={item.title}` (conversation cards), `accessibilityLabel={question}` (follow-up), `accessibilityLabel={suggestion.text}` (welcome card)

### Review multi-teams post-implementation

3 equipes lancees en parallele (Architecture, Frontend Integration, QA/Risk) — 12 categories verifiees.

**Issues trouvees et corrigees** :

1. `router` manquant dans deps useCallback `renderConversationItem` → ajoute
2. Pas de test pour `generateRequestId()` → 4 tests ajoutes

**Confirmations** :

- 0 reference orpheline `@/services`
- 0 dependance circulaire
- Singleton accessToken partage correctement entre httpClient et chatApi
- Auth flow (login + refresh) intact via nouveau authTokenStore
- CORS header case match (X-Request-Id title case)
- Backend requestId extraction match (nested `error.requestId`)
- React.memo + Reanimated safe (shared values internes au composant)
- GoogleSignin.configure() idempotent au module load
- Platform.OS web safe avec try/catch fallback

### Verification finale

- [x] Frontend `tsc --noEmit`: 0 erreurs
- [x] Frontend tests: 26 pass (22 → 26)
- [x] `grep @/services` : 0 resultats
- [x] `services/` : repertoire supprime
- [x] 3 equipes de review (Architecture, Frontend, QA) : APPROVED
- [x] 2 corrections post-review appliquees et verifiees

---

## Post-Sprint Audit — Remediation Plan v2 (2026-03-21)

> Audit forensique complet du repo apres 9 commits (Sprint 2-3). 3 equipes de review (Architecture, Backend/Frontend, QA/Risk) + websearch. 9 lots identifies, 9 implementes. 12 anomalies traitees.

### LOT H — Fix streaming mobile (expo/fetch) — CRITICAL

**Probleme** : Le `fetch()` global de React Native ne supporte pas `response.body.getReader()` — le streaming SSE tombait silencieusement dans le fallback `response.text()` = pas de streaming progressif sur mobile.
**Source** : [RN#27741](https://github.com/facebook/react-native/issues/27741), [RN#37505](https://github.com/facebook/react-native/issues/37505)

**Fix** : `import { fetch as expoFetch } from 'expo/fetch'` dans `chatApi.ts:postMessageStream()`. Expo SDK 52+ supporte `response.body.getReader()` sur iOS/Android.
**Fichier** : `museum-frontend/features/chat/infrastructure/chatApi.ts`

### LOT A — OCR Worker Pool (Tesseract Scheduler) — CRITICAL

**Probleme** : Worker Tesseract cree/detruit par requete = 2-5s overhead. Non concurrent-safe (singleton serialise).
**Source** : [tesseract.js#875](https://github.com/naptha/tesseract.js/issues/875)

**Fix** : `TesseractOcrService` refactorise avec `createScheduler()` + 2 workers lazy-init. `destroy()` methode ajoutee. Getter `getOcrService()` expose pour shutdown. `tesseract.js` deplace en `optionalDependencies`.
**Fichiers** : `ocr-service.ts`, `chat/index.ts`, `index.ts`, `package.json`

### LOT B — Nginx SSE + migration domaine musaium.com/fr — CRITICAL

**Probleme** : Config Nginx existante avait `proxy_read_timeout 60s` (tue SSE) + pas de `gzip off` (bufferise chunks SSE). Migration vers nouveaux domaines musaium.com/musaium.fr.
**Source** : [OneUptime blog](https://oneuptime.com/blog/post/2025-12-16-server-sent-events-nginx/view)

**Fix** : Config Nginx complete avec location SSE dedie (`proxy_read_timeout 600s`, `proxy_buffering off`, `gzip off`, `Connection ''`). Support certbot multi-domaines (SAN cert). Redirect legacy `museum.asilidesign.fr`.
**Fichier** : `museum-backend/deploy/nginx/musaium.conf` (nouveau)

### LOT C — Dockerfile HEALTHCHECK — HIGH

**Fix** : `HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3` + `STOPSIGNAL SIGTERM` ajoutes au Dockerfile.prod. Utilise `fetch('http://localhost:3000/api/health')` (Node 22 global fetch).
**Fichier** : `museum-backend/deploy/Dockerfile.prod`

### LOT D — Rate limit POST /api-keys — MEDIUM

**Probleme** : Pas de rate-limit dedie sur POST /api-keys. Le global IP s'execute avant auth → req.user n'existe pas.

**Fix** : `byUserId` key generator dans rate-limit.middleware.ts. Applique route-level APRES `isAuthenticatedJwtOnly` (10 req/60s).
**Fichiers** : `rate-limit.middleware.ts`, `auth.route.ts`

### LOT E — i18n strings manquantes — MEDIUM

**Fix** : `OfflineBanner.tsx` et `useAudioRecorder.ts` (5 Alert.alert) migres vers `useTranslation()`. 2 nouvelles sections (`offline`, `audio`) ajoutees aux 7 fichiers de traduction.
**Fichiers** : `OfflineBanner.tsx`, `useAudioRecorder.ts`, 7 x `translation.json`

### LOT G — Offline queue sync post-flush — MEDIUM

**Probleme** : Apres flush des messages en queue, les reponses assistant n'apparaissaient qu'apres reload manuel.

**Fix** : Apres flush reussi, `chatApi.getSession()` refetch les messages serveur et remplace l'etat local.
**Fichier** : `useChatSession.ts`

### LOT I — Locale sync CI guard — LOW

**Fix** : Script `scripts/check-locale-sync.sh` compare `SUPPORTED_LOCALES` backend/frontend et fail si divergence.
**Fichier** : `scripts/check-locale-sync.sh` (nouveau)

### Hypotheses invalidees par review

| Hypothese v1                             | Verdict                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| ReadableStream RN 0.79 = "a investiguer" | INVALIDE — fetch global ne supporte pas, fix requis via expo/fetch |
| OCR singleton simple                     | CORRIGE — singleton serialise, utiliser Scheduler                  |
| Nginx `proxy_buffering off` suffit       | CORRIGE — `gzip off` obligatoire                                   |
| Rate limit byUserId en global            | CORRIGE — global avant auth, doit etre route-level                 |
| ThemePalette 23 tokens                   | CORRIGE — 21 tokens                                                |
| I18nContext.tsx TS error                 | RESOLU — code propre                                               |
| Double loadRuntimeSettings()             | FAUX POSITIF — pas de doublon                                      |
| StartupConfigurationErrorScreen 12 hex   | PAR DESIGN — avant ThemeProvider                                   |

### Verification finale

- [x] Backend: `tsc --noEmit` OK, 360 tests pass (40 suites, 7 skipped)
- [x] Frontend: `tsc --noEmit` OK, 26 tests pass

---

## Sprint 2 (suite) — Lot B Infrastructure : Sentry + Uptime + Backup (2026-03-21)

> 3 taches infra implementees (S2-10, S2-11, S2-12). Sprint 2 passe de 88% a 100%.

### S2-10 — Sentry backend + frontend

**Probleme** : zero observabilite sur les erreurs — pas de crash reporting, pas de tracking, logs stdout uniquement.

**Solution backend** :

- Installe `@sentry/node` v10.45
- **Nouveau module** `src/shared/observability/sentry.ts` — centralise toute l'integration Sentry :
  - `initSentry()` : init SDK avec DSN/env/release/tracesSampleRate, no-op si `SENTRY_DSN` absent
  - `setupSentryExpressErrorHandler(app)` : middleware error handler SDK entre routes et custom errorHandler
  - `captureExceptionWithContext(error, context)` : wrapper avec scope tags (requestId, method, path)
  - `isSentryEnabled()` : boolean
- `env.ts` : ajout bloc optionnel `sentry?` (meme pattern que `tts`, `cache`)
- `index.ts` : `initSentry()` premiere ligne de `start()`, avant DB init
- `app.ts` : `setupSentryExpressErrorHandler(app)` entre routes et errorHandler
- `error.middleware.ts` : `captureExceptionWithContext()` sur les 5xx uniquement (pas les 4xx = bruit)
- `.env.local.example` : ajout `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`

**Solution frontend** :

- Installe `@sentry/react-native`
- `app.config.ts` : ajout plugin `@sentry/react-native/expo` avec org/project
- `_layout.tsx` : `Sentry.init()` avec DSN platform-specific (Android/iOS via env vars), `enabled: !!dsn`, wrap export `Sentry.wrap(RootLayout)`
- `.env.local.example` : ajout `EXPO_PUBLIC_SENTRY_DSN_ANDROID`, `EXPO_PUBLIC_SENTRY_DSN_IOS`

**CI** :

- `deploy-backend.yml` + `deploy-backend-staging.yml` : ajout steps "Create Sentry release" + "Upload source maps" avec guard `if: secrets.SENTRY_AUTH_TOKEN`
- `docs/CI_CD_SECRETS.md` : section Sentry documentant tous les secrets

**Fichiers** : 1 cree (`sentry.ts`), 11 modifies

### S2-11 — Uptime monitoring (BetterUptime)

**Probleme** : health endpoint existant a `/api/health` (DB + LLM checks, 200/503) mais aucun service externe qui le poll.

**Solution** :

- `api.router.ts` : ajout `responseTimeMs` au payload health (timing autour du healthCheck)
- `openapi.json` : ajout `responseTimeMs: integer` au schema HealthResponse
- **Nouveau doc** `docs/UPTIME_MONITORING.md` : provider (Better Stack), config monitors prod/staging, politique d'alerte, heartbeats pour taches planifiees

**Fichiers** : 1 cree (`UPTIME_MONITORING.md`), 2 modifies

### S2-12 — Backup DB automatise

**Probleme** : zero backup automatise — tout repose sur le provider VPS ou des sauvegardes manuelles.

**Solution** :

- **Nouveau script** `scripts/backup-db.sh` :
  - `pg_dump --format=custom --compress=9 --no-owner`
  - Nommage : `musaium-backup-YYYY-MM-DD-HHMMSS.dump`
  - Repertoires `daily/` + `weekly/` (copie dimanche)
  - Retention configurable : 7 daily + 4 weekly (defaut)
  - Cross-platform `stat` (Linux + macOS)
  - Heartbeat ping optionnel (BetterUptime)
  - Toutes valeurs via env vars, zero hardcode
- **Nouveau doc** `docs/DB_BACKUP_RESTORE.md` :
  - Schedule, role PostgreSQL backup (SELECT only), cron setup
  - Procedure restore staging puis prod
  - Note RGPD : retention max 35 jours
  - Integration monitoring heartbeat
- `DEPLOYMENT_STEP_BY_STEP.md` : section 23 remplacee par reference vers backup doc
- `.env.local.example` : ajout vars backup (`BACKUP_DB_USER`, `BACKUP_DB_PASSWORD`, `BACKUP_DIR`, `BACKUP_HEARTBEAT_URL`)

**Fichiers** : 2 crees (`backup-db.sh`, `DB_BACKUP_RESTORE.md`), 2 modifies

### Verification finale

- [x] Backend: `tsc --noEmit` OK, 360 tests pass (40 suites)
- [x] Frontend: `tsc --noEmit` OK, 26 tests pass
- [x] Sprint 2: 25/25 (100%) — S2-02 (Instagram handle) compte comme reporte [-]
- [x] S3-13 (Sentry APM) debloque par S2-10
- [x] `scripts/check-locale-sync.sh` : SUPPORTED_LOCALES in sync
- [x] 3 equipes de review (Architecture, Backend/Frontend, QA/Risk) : corrections integrees

---

## S3-13 — APM setup (Sentry Performance) (2026-03-21)

### S3-13: Sentry Performance / APM

**Backend — Custom Spans + User Identification**
- Enhanced `src/shared/observability/sentry.ts`: added `startSpan()` wrapper with `NOOP_SPAN` Proxy (safe no-op when Sentry disabled) + `setUser()` helper. Added `profilesSampleRate` to `Sentry.init()`.
- `src/config/env.ts`: added `profilesSampleRate: number` field to `sentry?` config block, parsed from `SENTRY_PROFILES_SAMPLE_RATE` (default: 0).
- `src/app.ts`: added `sentry-trace` and `baggage` to CORS `allowedHeaders` for distributed tracing.
- `src/modules/chat/adapters/secondary/langchain.orchestrator.ts`: wrapped `generate()` in `ai.orchestrate` span with attributes (provider, model, has_image, history_length), added `llm.latency_ms` and `llm.degraded` attributes. Wrapped each section task `model.invoke` in `ai.invoke` span. Wrapped `generateStream()` in `ai.orchestrate` span, `model.stream` in `ai.stream` child span.
- `src/modules/chat/adapters/secondary/audio-transcriber.openai.ts`: wrapped `transcribe()` in `ai.transcribe` span with mime_type and model attributes.
- `src/modules/chat/adapters/secondary/ocr-service.ts`: wrapped `extractText()` in `ai.ocr` span.
- `src/modules/chat/adapters/secondary/image-storage.s3.ts`: wrapped `save()` in `storage.upload` span.
- `src/helpers/middleware/authenticated.middleware.ts`: added `setUser({ id })` after JWT verification in both `isAuthenticated` and `isAuthenticatedJwtOnly`.
- `src/helpers/middleware/apiKey.middleware.ts`: added `setUser({ id })` after API key validation.
- `.env.local.example`: documented `SENTRY_PROFILES_SAMPLE_RATE`.

**Frontend — Navigation Instrumentation + User ID + Error Capture + Distributed Tracing**
- `app/_layout.tsx`: replaced minimal `Sentry.init()` with full APM config: `reactNativeTracingIntegration()` + `reactNavigationIntegration({ enableTimeToInitialDisplay: true })` as peer integrations, `enableAutoPerformanceTracing: true`. Added `useNavigationContainerRef()` + `registerNavigationContainer()` for Expo Router screen performance tracking.
- `context/AuthContext.tsx`: added `identifySentryUser()` helper (JWT decode → `Sentry.setUser({ id })`), called on all 3 auth success paths (bootstrap, refresh handler, checkTokenValidity). Added `Sentry.setUser(null)` on logout, unauthorized handler, and auth failure.
- `features/chat/application/useChatSession.ts`: added `Sentry.captureException()` in both `loadSession` and `sendMessage` catch blocks with flow tags.
- `features/chat/infrastructure/chatApi.ts`: imported `getTraceData`/`isInitialized` from `@sentry/core` (not re-exported by `@sentry/react-native`), injected trace headers into SSE `expoFetch` call for distributed tracing.

**Key Decisions**
- `@sentry/profiling-node` NOT installed (native dep, build complexity) — config field future-ready at 0 default.
- `NOOP_SPAN` uses a Proxy pattern instead of `undefined` cast — prevents runtime crashes if callback uses `span.setAttribute()`.
- `reactNativeTracingIntegration` and `reactNavigationIntegration` are peer integrations in v8, not nested.
- Only 4 business-critical adapters instrumented with spans (LLM, audio, OCR, S3) — Express HTTP, outgoing HTTP, and DB auto-instrumented by defaults.

**Fichiers** : 0 crees, 14 modifies (9 backend, 4 frontend, 1 config)

### Verification
- [x] Backend: `tsc --noEmit` OK, 360 tests pass (40 suites)
- [x] Frontend: `tsc --noEmit` OK, 26 tests pass

---

## Enterprise Audit — Post-Sprint 3 Forensic Review (2026-03-21)

**Scope**: Full-stack forensic audit of Sprints 1-3 work. 3 explore agents (codebase cartography) + 2 plan agents (remediation design) + 4 review teams (architecture, backend validation, frontend integration, QA/risk).

### Resume executif

Enterprise-grade audit verifying 84/101 tasks across Sprints 1-3. All tracker claims confirmed against code. Architecture verified sound (hexagonal backend, feature-driven frontend). 0 CRITICAL, 2 HIGH, 10 MEDIUM, 6 LOW findings. Key remediations applied.

### Findings Summary

| Severity | Count | Key Items |
|----------|-------|-----------|
| CRITICAL | 0 | — |
| HIGH | 2 | Frontend Sentry absent (F-06), uncommitted changeset (C-02) |
| MEDIUM | 10 | Rate limiter leak (A-01), GDPR OOM (A-04), OCR timeout (A-09), OpenAPI params (A-02), TTS Redis (A-05), Google OAuth hardcoded (F-03), 429 mapping (F-05), a11y gaps (F-07), Sentry whitelist (NEW-6), GDPR transaction (NEW-5) |
| LOW | 6 | Logger consistency (A-03), feature flag docs (A-06), APM (A-07), DRY violations (A-10/A-11), CI locale sync (C-01), sprint log stale (C-03) |

### Corrections applied

| Fix | Files | Description |
|-----|-------|-------------|
| A-01 | `rate-limit.middleware.ts`, `index.ts` | Sweep timer + MAX_MAP_SIZE cap + graceful shutdown |
| A-02 | `openapi.json` | Added missing query params and x-feature-flag extensions |
| A-03 | `app.ts` | console.error → logger.error for Redis init |
| A-04 | `chat.repository.typeorm.ts` | GDPR export paginated with REPEATABLE READ transaction |
| A-09 | `ocr-service.ts` | Promise.race timeout (30s) with fail-open |
| F-05 | `AppError.ts`, `httpClient.ts`, `errors.ts` | RateLimited error kind + 429 mapping |
| F-06 | `errorReporting.ts`, `AuthContext.tsx`, `httpClient.ts` | Sentry error reporting with kind whitelist + dedup guard |
| F-07 | `OfflineBanner.tsx`, `OnboardingSlide.tsx`, `ChatMessageBubble.tsx` | Accessibility props added |
| F-08 | `chatApi.ts` | requestId passed through SSE onError callback |
| F-03 | `socialAuthProviders.ts`, `app.config.ts` | Google OAuth IDs externalized to env vars |

### Verified as sound (no action needed)

- Hexagonal architecture, JWT PII stripping, guardrail layering, prompt isolation
- Session ownership on all endpoints, auth refresh dedup, React lifecycle
- services/ migration complete, 13 migrations no drift, Docker build, nginx SSE
- No circular dependencies (lazy binding), intentional HTTP layering, security storage tiers

### Test metrics

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Backend tests | 360 | 364+ | +4 (rate limiter sweep) |
| Frontend tests | 26 | 29+ | +3 (RateLimited error) |
| Backend typecheck | OK | OK | — |
| Frontend typecheck | OK | OK | — |

---

## Post-Sprint 3 Audit (2026-03-21)

### Context

Enterprise-grade forensic audit of the full monorepo post-Sprint 3 (9 commits, ~12.5K insertions). Methodology: 3 exploration agents + 9 automated checks (power-tools) + 2 planning agents + 3 rounds of 4-team critical review (Architecture, Backend, Frontend, QA) = 12 review agents total.

### Findings Summary

- **14 anomalies** identified (0 CRITICAL, 0 HIGH, 7 MEDIUM, 7 LOW)
- **6 user-reported issues corrected as FALSE POSITIVES**:
  - OpenAPI spec is COMPLETE (24 endpoints, all documented)
  - POST /api-keys HAS a dedicated rate limiter (10/min/userId)
  - `createSummaryFallback` IS multi-locale (7 languages)
  - `OfflineBanner` IS i18n'd
  - `useAudioRecorder` IS i18n'd
  - X-Request-Id propagation IS already implemented in frontend

### Corrections Applied (5 lots)

#### S3-A1 — Typed Client Alignment (ANO-01, ANO-11)

**Problem**: `authApi.ts` used `httpRequest<unknown>()` for `forgotPassword` and `resetPassword` while all other 7 auth endpoints used typed `openApiRequest()`.

**Fix**:
- Migrated both endpoints to `openApiRequest()` with `OpenApiResponseFor<>` typed returns
- Removed dead `AUTH_ENDPOINTS` map, `buildAuthUrl()`, `AUTH_BASE_PATH` from `apiConfig.ts`

**Files**: `authApi.ts`, `apiConfig.ts`

#### S3-A2 — i18n Completeness (ANO-02, ANO-03, ANO-04, ANO-05)

**Problem**: 3 hardcoded EN strings (`useMessageActions`, `support.tsx`), 1 FR string in backend response.

**Fix**:
- Added `useTranslation()` to `useMessageActions` hook (pattern: `useAudioRecorder`)
- Replaced hardcoded Alert.alert and setStatus strings with `t()` calls
- Added 5 i18n keys (`chat.copied_title`, `chat.copied_body`, `support.invalid_link_body`, `support.channel_opened`, `support.channel_failed`) to all 7 locales
- Standardized `auth.route.ts:174` from French to English

**Files**: `useMessageActions.ts`, `support.tsx`, `auth.route.ts`, 7 locale JSON files

#### S3-A3 — Dead Code Removal (ANO-06)

**Problem**: `persistArtworkMatch()` deprecated method with 0 callers.

**Fix**:
- Removed method signature from `ChatRepository` interface
- Removed implementation from `TypeOrmChatRepository`
- Removed unused `artworkMatchRepo` class field and `PersistArtworkMatchInput` import from implementation
- **Kept** `PersistArtworkMatchInput` type definition (still used by `PersistMessageInput.artworkMatch`)

**Files**: `chat.repository.interface.ts`, `chat.repository.typeorm.ts`

#### S3-A4 — Rate Limiters Password Reset (ANO-13, ANO-14)

**Problem**: `/forgot-password` and `/reset-password` had no dedicated rate limiter (only global IP 120/min).

**Fix**:
- Added `passwordResetLimiter` (5 req/5min per IP) using existing `createRateLimitMiddleware` + `byIp`
- Applied to both routes
- Trust proxy verified: `app.ts` + nginx `X-Forwarded-For` correctly configured

**Files**: `auth.route.ts`

#### S3-A5 — README Update (ANO-09)

**Problem**: README referenced deleted `services/`, wrong paths (`cd backend`), stale tech stack (Tailwind, GPT-4).

**Fix**: Updated tech stack table, installation paths, and architecture tree to match current monorepo structure.

**Files**: `README.md`

### Risks Accepted & Monitoring Points

| Point | Status |
|---|---|
| Redis maxmemory deployment config | Must configure `256MB + allkeys-lru` in production |
| GDPR export doesn't cover social accounts / API keys | Gap documented |
| Reset token stored plain text | Acceptable: single-use, 1h TTL, 160 bits entropy |
| Google OAuth fallback client IDs hardcoded | Verify dev-only IDs |

### Verification

| Check | Result |
|---|---|
| Backend typecheck (`tsc --noEmit`) | OK |
| Frontend typecheck (`tsc --noEmit`) | OK |
| Backend tests (364 pass) | OK |
| Frontend tests (29 pass) | OK |
| i18n completeness (405 keys x 7 locales) | OK |

---

## Sprint 4 Wave 1 — Enterprise Foundation (2026-03-23)

### Context

Sprint 4 "Make it Scalable" — Wave 1 targets the foundational enterprise features: RBAC, audit logging, and CDN preparation. These are prerequisites for the admin dashboard, multi-tenancy, and content moderation in Wave 2-3.

### S4-02 — RBAC (admin, moderator, museum_manager)

**What**: Added role-based access control to the user model with 4 roles: `visitor` (default), `moderator`, `museum_manager`, `admin`.

**How**:
- `UserRole` const + type in `modules/auth/core/domain/user-role.ts`
- `role` column on `User` entity (PostgreSQL enum, default `'visitor'`)
- Migration `1774200000000-AddUserRoleColumn.ts`: creates `user_role_enum` type, adds column
- Role embedded in JWT access token claims (`role` field in payload)
- `verifyAccessToken()` returns `{ id, role }` — old tokens fallback to `'visitor'`
- `requireRole(...roles)` middleware factory in `helpers/middleware/require-role.middleware.ts`
- API key auth resolves user role from DB via `setUserRoleResolver()`
- `forbidden()` error factory added to `app.error.ts`
- `SafeUser`, `UserJwtPayload`, `UserProfile`, Express `req.user` all include `role`
- `/me` endpoint returns `role` in response
- OpenAPI spec updated: `AuthUser.role` (required enum), `Forbidden` response added
- Frontend types regenerated

**Files created**:
- `src/modules/auth/core/domain/user-role.ts`
- `src/helpers/middleware/require-role.middleware.ts`
- `src/data/db/migrations/1774200000000-AddUserRoleColumn.ts`
- `tests/unit/auth/require-role.test.ts` (6 tests)

**Files modified**: `user.entity.ts`, `user-jwt-payload.ts`, `express/index.d.ts`, `authSession.service.ts`, `authenticated.middleware.ts`, `apiKey.middleware.ts`, `getProfile.useCase.ts`, `auth.route.ts`, `auth/core/useCase/index.ts`, `app.error.ts`, `exportUserData.types.ts`, `openapi.json`, `jwt-pii-strip.test.ts`, `security-fixes.test.ts`, `openapi-response.contract.test.ts`

### S4-08 — Audit Logging (immutable trail)

**What**: Immutable audit trail recording 17 event types across auth, security, and admin domains.

**How**:
- New shared module `src/shared/audit/` with hexagonal architecture (port + PG adapter)
- `AuditLog` entity: UUID PK, action (varchar 64), actorType, actorId, targetType, targetId, metadata (JSONB), ip (inet), requestId, createdAt (timestamptz)
- Fire-and-forget `AuditService.log()` — never throws, never blocks the caller
- Migration with 5 indexes + DB-level immutability triggers (UPDATE/DELETE blocked)
- Integrated at auth route level: login (success/fail), register, logout, social-login, password change/reset, account delete, GDPR export, API key CRUD, rate limit triggers
- Integrated in ChatService: guardrail block events

**Files created**:
- `src/shared/audit/audit.types.ts` (17 action constants)
- `src/shared/audit/auditLog.entity.ts`
- `src/shared/audit/audit.repository.interface.ts`
- `src/shared/audit/audit.repository.pg.ts`
- `src/shared/audit/audit.service.ts`
- `src/shared/audit/index.ts`
- `src/data/db/migrations/1774200100000-CreateAuditLogsTable.ts`
- `tests/unit/audit/audit.service.test.ts` (5 tests)

**Files modified**: `data-source.ts`, `auth.route.ts`, `chat.service.ts`, `chat/index.ts`

### S4-12 — CDN Setup (CloudFlare)

**What**: Prepared backend and Nginx for CloudFlare CDN integration.

**How**:
- Default `Cache-Control: no-store` middleware in `app.ts` (secure by default)
- `/api/health` override: `public, max-age=10, s-maxage=10`
- `cache-control.middleware.ts` with preset directives
- Nginx `musaium.conf`: added all CloudFlare IPv4/IPv6 ranges via `set_real_ip_from` + `real_ip_header CF-Connecting-IP`
- Documentation `docs/CDN_CLOUDFLARE_SETUP.md`: DNS migration, SSL, caching rules, security, SSE handling, rollback plan

**Files created**:
- `src/helpers/middleware/cache-control.middleware.ts`
- `docs/CDN_CLOUDFLARE_SETUP.md`

**Files modified**: `app.ts`, `api.router.ts`, `deploy/nginx/musaium.conf`

### Verification

| Check | Result |
|---|---|
| Backend typecheck (`tsc --noEmit`) | OK |
| Frontend typecheck (`tsc --noEmit`) | OK |
| Backend tests (382 pass, 43 suites) | OK (+18 tests) |
| Frontend tests (29 pass) | OK |
| OpenAPI validate (24 paths, 27 ops) | OK |
| Contract tests (6 pass) | OK |
| OpenAPI types freshness | OK (regenerated) |
| `pnpm build` | OK |

---

## Sprint 4 Wave 2 — Enterprise Core Features (2026-03-23)

### Context

Wave 2 implements the core enterprise features: admin dashboard (web + backend), multi-tenancy, cross-session user memory, Arabic RTL support, and biometric authentication. These build on Wave 1 foundations (RBAC, audit logging, CDN).

### S4-01 — Admin Dashboard MVP

**What**: New `museum-admin/` web application + `src/modules/admin/` backend module.

**Backend** (11 files):
- Hexagonal module: `admin.types.ts` (DTOs) → `admin.repository.interface.ts` (port) → `admin.repository.pg.ts` (raw SQL, never exposes passwords)
- 4 use cases: `listUsers`, `changeUserRole` (last-admin guard + audit logging), `listAuditLogs`, `getStats`
- 4 endpoints: `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `GET /api/admin/audit-logs`, `GET /api/admin/stats`
- All behind `requireRole('admin', 'moderator')`, write ops admin-only
- Offset-based pagination for admin queries
- 8 unit tests for changeUserRole (role validation, last-admin guard, audit)

**Frontend** (18 files in `museum-admin/`):
- React 19 + Vite 6 + Tailwind 4 + React Router 7 + TanStack Query 5
- JWT in-memory only (no localStorage — XSS protection)
- Pages: Login → Dashboard (6 stat cards) → Users (table + search + role filter) → User Detail (role change) → Audit Logs (filters)
- Dark sidebar + white content layout, 332 kB JS bundle

### S4-05 — Multi-tenancy (B2B Museum Scoping)

**What**: `Museum` entity + tenant FK columns on User/ChatSession/ApiKey + museum CRUD endpoints.

**How**:
- New `museums` table: id, name, slug (unique), address, description, config (JSONB), is_active
- Nullable `museum_id` FK added to `users`, `chat_sessions`, `api_keys` tables
- New `src/modules/museum/` hexagonal module: entity, CRUD use cases, routes at `/api/museums`
- `museumId` added to JWT claims + `UserJwtPayload` + `Express.Request`
- Tenant resolution: JWT claim → `req.museumId`, API key → `req.museumId`
- `CreateSessionInput` accepts `museumId`
- Feature-flagged: `FEATURE_FLAG_MULTI_TENANCY`
- Migration: `1774300000000-CreateMuseumsAndTenantFKs.ts`
- Fully backward compatible: existing data gets `museum_id = NULL`

**Files**: 15 created (museum module + migration), 12 modified (entities, auth service, middleware, types, routes, env)

### S4-07 — Cross-Session User Memory

**What**: Per-user memory profile that accumulates knowledge across chat sessions.

**How**:
- `user_memories` table: userId (UNIQUE FK), preferredExpertise, favoritePeriods[], favoriteArtists[], museumsVisited[], notableArtworks (JSONB cap 20), interests[], summary (text), sessionCount, version
- `UserMemoryService`: cache-through `getMemoryForPrompt`, `updateAfterSession` (merges with array caps), GDPR delete
- `buildUserMemoryPromptBlock`: pure function, sanitized, max 600 chars, `[USER MEMORY]` block
- Integration: `prepareMessage` loads memory (fail-open), `commitAssistantResponse` updates memory (fire-and-forget)
- Redis caching: `memory:prompt:{userId}` with TTL
- Feature-flagged: `FEATURE_FLAG_USER_MEMORY`
- 9 unit tests for prompt builder

**Files**: 8 created, 5 modified (chat.service, chat/index, env, data-source, migration)

### S4-09 — Arabic RTL Support

**What**: Arabic as 8th language + full RTL layout support.

**How**:
- `shared/locales/ar/translation.json` with 415 keys (matching all other locales)
- `shared/i18n/rtl.ts`: `isRTLLocale()`, `applyRTLLayout()`, `needsRTLReload()`
- `I18nContext.tsx`: on language change, if RTL/LTR switch, persist locale → `forceRTL()` → `Updates.reloadAsync()` (restart required — React Native limitation)
- RTL style fixes: `marginRight` → `marginEnd` (ConversationSearchBar), `writingDirection: 'auto'` (ChatInput)
- `I18nManager.isRTL` persists natively across relaunches

**Files**: 2 created, 5 modified (supportedLocales, i18n.ts, I18nContext, 2 UI components)

### S4-10 — Biometric Authentication

**What**: Optional Face ID / Fingerprint lock on app launch.

**How**:
- `expo-local-authentication` dependency installed
- `biometricStore.ts`: AsyncStorage-backed preference
- `useBiometricAuth.ts` hook: hardware check, enrollment check, authenticate/enable/disable
- `BiometricLockScreen.tsx`: full-screen lock UI with unlock/retry buttons
- `AuthContext.tsx`: `isBiometricLocked` state, checked after token refresh
- `_layout.tsx`: `BiometricGate` wrapper shows lock screen before app content
- `settings.tsx`: Security card with biometric toggle
- `app.config.ts`: `NSFaceIDUsageDescription` for iOS
- Biometric i18n keys added to all 8 translation files

**Files**: 3 created, 4 modified + 8 translation files updated

### Verification

| Check | Result |
|---|---|
| Backend typecheck (`tsc --noEmit`) | OK |
| Frontend typecheck (`tsc --noEmit`) | OK |
| Backend tests (399 pass, 45 suites) | OK (+17 from Wave 1) |
| Frontend tests (29 pass) | OK |
| OpenAPI validate | OK |
| Contract tests (6 pass) | OK |
| `pnpm build` | OK |
| Admin frontend build (Vite) | OK (332 kB JS) |
| i18n completeness (8 locales, 415 keys) | OK |

---

## Sprint 4 Wave 3 — Enterprise Final (2026-03-23)

### Context

Wave 3 completes Sprint 4 with the remaining 8 tasks: content moderation, analytics, museum directory, ticket system, OpenTelemetry, load testing, E2E tests, and Data Safety documentation.

### S4-03 — Content Moderation Queue

- Added `status` (pending/reviewed/dismissed), `reviewedBy`, `reviewedAt`, `reviewerNotes` to `MessageReport` entity
- Migration `1774400000000-AddModerationColumnsToMessageReports.ts`
- 2 new admin endpoints: `GET /api/admin/reports` (list with status/reason/date filters), `PATCH /api/admin/reports/:id` (resolve)
- `AUDIT_ADMIN_REPORT_RESOLVED` event

### S4-04 — Analytics API

- 3 new admin endpoints: `GET /api/admin/analytics/usage` (time-series daily/weekly/monthly), `GET /api/admin/analytics/content` (top artworks/museums, guardrail rate), `GET /api/admin/analytics/engagement` (avg messages/session, duration, return rate)
- Raw SQL with `date_trunc()`, `Promise.all` for parallel queries, no new tables

### S4-06 — Museum Directory + Geolocation

- **Backend**: Added `latitude`/`longitude` to Museum entity + migration. New `GET /api/museums/directory` (visitor-accessible). `museumId` wired through chat session creation HTTP contract.
- **Frontend**: `expo-location` installed. New `features/museum/` module: `useLocation` hook, `useMuseumDirectory` hook (Haversine sort), `MuseumCard`, `MuseumDirectoryList`. New "Museums" tab + `museum-detail` stack screen with "Start Chat Here" CTA.
- i18n: `museumDirectory.*` keys added to all 8 locales (424 keys each)

### S4-11 — In-App Support / Ticket System

- New `src/modules/support/` hexagonal module (14 files)
- 2 entities: `SupportTicket` (status/priority/category/assignedTo) + `TicketMessage` (thread)
- User endpoints: `POST/GET /api/support/tickets`, `GET /api/support/tickets/:id`, `POST /api/support/tickets/:id/messages`
- Admin endpoints: `GET /api/admin/tickets`, `PATCH /api/admin/tickets/:id`
- Auto-transition: admin reply to open ticket → in_progress
- Migration `1774400100000-CreateSupportTables.ts`

### S4-13 — OpenTelemetry Distributed Tracing

- `@opentelemetry/sdk-node` + auto-instrumentations (HTTP, Express, pg)
- `src/instrumentation.ts` loaded before all other imports in `index.ts`
- Dynamic `require()` to avoid loading when disabled
- Feature-flagged: `OTEL_ENABLED=false` by default
- Complements Sentry (errors) with OTel (traces)

### S4-14 — Load Testing + Horizontal Scaling

- 3 k6 scripts: `auth-flow.k6.js` (10 VUs), `chat-flow.k6.js` (5 VUs), `concurrent-users.k6.js` (50 VUs ramp)
- Shared auth helper module
- `docs/HORIZONTAL_SCALING.md`: stateless architecture, DB pool formula, Redis requirements, Docker Swarm + K8s configs, rate limiter migration caveat
- npm scripts: `perf:auth`, `perf:chat`, `perf:load`

### S4-15 — E2E Test Suite Comprehensive

- Shared `e2e-app-harness.ts` (extracts 120 lines of common setup, all 20 migrations)
- `e2e-auth.helpers.ts` (register/login reusable functions)
- 3 new E2E test files (17 tests): `auth.e2e.test.ts` (8 tests), `chat.e2e.test.ts` (4 tests), `rbac.e2e.test.ts` (5 tests)
- All gated by `RUN_E2E=true`, use testcontainers
- Original E2E test preserved untouched

### S4-16 — Google Play Data Safety Form

- `docs/GOOGLE_PLAY_DATA_SAFETY.md`: maps all data collection, sharing, security practices
- Covers personal info, photos, audio, location, chat data, crash logs, device IDs
- Documents third-party sharing (Sentry, LLM providers, Brevo)
- Form answers quick reference for each Google Play question

### Verification

| Check | Result |
|---|---|
| Backend typecheck (`tsc --noEmit`) | OK |
| Frontend typecheck (`tsc --noEmit`) | OK |
| Backend tests (416 total: 392 pass, 24 E2E skipped) | OK |
| Frontend tests (29 pass) | OK |
| `pnpm build` | OK |
| E2E tests (24 tests, 3 new files + 1 existing) | Ready (needs `RUN_E2E=true` + Docker) |
| k6 load tests (3 scripts) | Ready (needs k6 binary) |

---

## Sprint W1 — Web Presence Foundations (2026-03-25)

**Scope**: Nouveau package `museum-web/` — Next.js 15 web platform pour musaium.com.
**Commit**: `b37ed6e`
**Stats**: 39 fichiers (37 new, 2 modified), +2898 lignes, 0 tests (scaffolding sprint).
**Mode**: /team feature — cycle complet avec Sentinelle (R5).

### Resume executif

Creation du package `museum-web/` — une application Next.js 15 avec App Router, Tailwind CSS 4, et i18n FR/EN qui servira de plateforme web complete pour musaium.com. Remplace le 444 nginx actuel par une presence web professionnelle : landing page marketing, support/FAQ, admin panel, politique de confidentialite. Pipeline de deploiement complet (Docker, GHCR, VPS SSH, nginx).

### Architecture

| Choix | Justification |
|-------|---------------|
| Next.js 15 (App Router) | SSR/SSG pour SEO landing, RSC pour performance |
| Tailwind CSS 4 | Coherence avec museum-admin existant |
| i18n path-based (`/[locale]/`) | SEO-friendly, pas de lib externe |
| pnpm | Coherence avec museum-backend |
| Port 3001 (container) | Evite conflit avec backend 3000 |
| Standalone output | Image Docker legere (~150MB) |

### Changements cles

| Domaine | Action | Fichiers |
|---------|--------|----------|
| Project setup | Next.js 15 + Tailwind 4 + TS strict | `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs` |
| i18n | Middleware + dictionnaires FR/EN | `middleware.ts`, `lib/i18n.ts`, `dictionaries/*.json` |
| Marketing | Landing page (hero, features, showcase, CTA) | `[locale]/page.tsx`, `[locale]/layout.tsx` |
| Support | FAQ accordion + formulaire contact | `[locale]/support/page.tsx`, `ContactForm.tsx` |
| Privacy | Page scaffold | `[locale]/privacy/page.tsx` |
| Admin | Layout sidebar + auth + 9 pages scaffold | `[locale]/admin/**` (11 fichiers) |
| Components | Header, Footer, LanguageSwitcher, Button | `components/shared/`, `components/ui/` |
| Auth | AuthProvider + AuthGuard + useAuth (types backend) | `lib/auth.tsx`, `lib/api.ts` |
| Docker | Multi-stage standalone build | `deploy/Dockerfile.prod` |
| CI/CD | Typecheck + build + deploy VPS | `ci-web.yml`, `deploy-web.yml` |
| Nginx | `/api/` → backend, `/` → museum-web | `musaium.conf`, `site.conf.production` |

### Nginx changes (critical path)

1. Retrait `/admin` du scanner-blocker regex (maintenant servi par Next.js)
2. Separation `location /` catch-all en `location /api/` (backend) + `location /` (museum-web)
3. Tous les endpoints existants preserves (SSE, auth rate limit, ACME)
4. Les 2 fichiers conf synchronises

### Decisions techniques

1. **Pas de lib i18n externe** — middleware + JSON dictionnaires suffisent, zero dep supplementaire
2. **Token auth en memoire** — pas de localStorage (securite), refresh token prevu pour W2
3. **Server Components par defaut** — `'use client'` uniquement pour interactivite (Header, admin layout, login, auth)
4. **Design tokens Tailwind 4** — palette primary/accent/surface coherente avec la privacy policy existante

### Sentinelle R5

| Porte | Verdict | Score |
|-------|---------|-------|
| P1 (Analyse) | GO | - |
| P3 (Dev) | GO | 7 findings (0 bloqueur) |
| Finale (Ship) | GO | En cours |

Findings corriges: F1 (auth types alignes sur backend UserRole + LoginResponse shape)
Findings deferred W2: F2 (refresh token), F3-F5 (i18n admin sidebar), F6 (public assets), F7 (gzip text/html)

### Verification

| Check | Result |
|-------|--------|
| museum-web typecheck (`tsc --noEmit`) | PASS (0 errors) |
| museum-web build (`next build`) | PASS (13 routes, 102 kB First Load JS) |
| Backend typecheck | PASS (0 regression) |
| Backend tests (941 passed) | PASS (0 regression) |
| Frontend tests (47 passed) | PASS (not impacted) |
| Nginx diff | Verified, synchronized |

### Prochaines etapes (W3-W5)

| Sprint | Focus |
|--------|-------|
| W3 | Support complet + privacy policy migration + formulaire connecte au backend |
| W4 | Admin remaining pages (analytics, reports, tickets) + production deploy |
| W5 | Polish, perf, accessibilite |

---

## Sprint W2 — Web Enrichment (2026-03-25)

**Scope**: Landing page riche + admin API wiring + W1 findings resolution.
**Commit**: `d6c77f1`
**Stats**: 25 fichiers modifies, +1886 / -364 lignes, 0 tests (frontend web — no test framework yet).
**Mode**: /team feature — Sentinelle R6, L2 streamlined gates.

### Resume executif

Sprint d'enrichissement du package `museum-web/`. Landing page transformee de scaffold minimal en page marketing riche avec 6 sections animees via Framer Motion (hero, how-it-works, feature grid, app showcase, testimonials, download CTA). Admin panel connecte aux endpoints backend API reels (/api/admin/stats, /api/admin/users, /api/admin/audit-logs). Resolution de tous les findings W1 (F2-F6): refresh token interceptor porte de museum-admin, i18n complete admin, public assets.

### Architecture

| Choix | Justification |
|-------|---------------|
| Framer Motion (scroll-triggered) | Animations legeres, tree-shakeable, +45 kB acceptable |
| Server Component admin layout | RSC pour metadata, client AdminShell pour interactivite |
| AdminDictProvider pattern | Evite prop drilling dictionnaire dans toute la sidebar |
| Refresh token interceptor | Port direct du pattern museum-admin (eprouve en prod) |
| Types admin separes (admin-types.ts) | Pas de dependance sur openapi generated types (museum-web est standalone) |

### Changements cles

| Domaine | Action | Fichiers |
|---------|--------|----------|
| Marketing | 6 sections landing page animees | `[locale]/page.tsx` |
| Composants | 5 composants marketing reusables | `components/marketing/*.tsx` |
| Admin API | Dashboard stats, users table, audit logs | `admin/page.tsx`, `admin/users/page.tsx`, `admin/audit-logs/page.tsx` |
| Admin infra | AdminShell + LoginForm extraction | `components/admin/*.tsx` |
| Auth | Refresh token interceptor + registerLogoutHandler | `lib/api.ts`, `lib/auth.tsx` |
| i18n | Admin sidebar + login + contact form | `lib/admin-dictionary.tsx`, `components/admin/*.tsx` |
| Types | Admin backend types | `lib/admin-types.ts` |
| Dictionnaires | Sections marketing + contact.success | `dictionaries/fr.json`, `dictionaries/en.json` |
| Public | robots.txt, sitemap.xml | `public/` |

### W1 Findings Resolution

| # | Sev | Description | Resolution |
|---|-----|-------------|------------|
| F2 | M | No refresh token handling | `api.ts` — 401 interceptor avec queue de requetes en attente, retry apres refresh, registerLogoutHandler pour deconnexion propre. Pattern identique a museum-admin (eprouve). |
| F3 | F | ContactForm hardcoded text | `ContactForm.tsx` — `dict.contact.success` au lieu de string hardcodee. Cle ajoutee aux 2 dictionnaires. |
| F4 | F | Admin sidebar not i18n | `AdminDictProvider` — Context React avec dictionnaire admin charge via `useAdminDict()`. AdminShell consomme le contexte. |
| F5 | F | Admin login inline locale | `LoginForm.tsx` — Composant client qui recoit le dictionnaire en props. Plus de ternaires `locale === 'fr'`. |
| F6 | F | Missing public assets | `robots.txt` (User-agent: *, Allow: /, Sitemap ref) + `sitemap.xml` (13 URLs FR+EN, lastmod 2026-03-25). |

### Decisions techniques

1. **Framer Motion over CSS animations** — Scroll-triggered `whileInView` + stagger delays = comportement riche impossible en CSS pur. Bundle impact +45 kB acceptable pour une landing page marketing.
2. **PhoneMockup parallax** — `useScroll` + `useTransform` pour effet parallax vertical sur le mockup telephone. Pas de dependance externe.
3. **Admin types manuels** — `admin-types.ts` definit les types en miroir du backend sans importer le package openapi types. museum-web reste un package standalone sans dependance vers museum-backend.
4. **AdminDictProvider vs prop drilling** — Le pattern Context evite de passer le dictionnaire a travers 3+ niveaux de composants. Le hook `useAdminDict()` est ergonomique et type-safe.
5. **Refresh token queue** — Les requetes qui echouent en 401 sont mises en queue pendant le refresh. Une fois le token rafraichi, toutes les requetes en queue sont rejouees. Pattern identique a museum-admin.

### Verification

| Check | Result |
|-------|--------|
| museum-web typecheck (`tsc --noEmit`) | PASS (0 errors) |
| museum-web build (`next build`) | PASS (13 routes, 147 kB First Load JS) |
| Backend typecheck | PASS (0 regression) |
| Backend tests (951 passed) | PASS (0 regression, +10 not from our changes) |
| Corrective loops | 0 |
| First-pass rate | 100% |

### Prochaines etapes (W3-W5)

| Sprint | Focus |
|--------|-------|
| W3 | Support complet + privacy policy content migration + formulaire connecte au backend |
| W4 | Admin remaining pages (analytics, reports, tickets) + production deploy |
| W5 | Polish, perf, accessibilite |
