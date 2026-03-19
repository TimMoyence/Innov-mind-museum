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

| Test | Verifie |
|------|---------|
| S2-20a: social-only login | Erreur = `INVALID_CREDENTIALS`, pas de leak "social"/"Apple"/"Google" |
| S2-20c: comment 500 chars | Boundary: 500 accepte, 501 rejete |
| S2-20d: register response | Shape = `{ user: { id, email } }`, pas de password/names |

---

### Bilan Phase 1A

| Metrique | Avant | Apres | Delta |
|----------|-------|-------|-------|
| Tests backend | 217 | 256 | +39 |
| Tests frontend | 11 | 13 | +2 |
| Store blockers | 3 open | 0 open | -3 |
| Security items S2-20 | 4 open | 0 open | -4 |
| Bcrypt cost | 10 | 12 | Upgrade |
| Phase 1A items | 0/9 | 9/9 | Done |

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

| Metrique | Avant | Apres | Delta |
|----------|-------|-------|-------|
| Backend tests | 339 | 360 | +21 |
| Frontend tests | 13 | 22 | +9 |
| Backend suites | 38 | 41 | +3 |
| New files | - | 6 | +6 |
| Modified files (backend) | - | 10 | - |
| Modified files (frontend) | - | 6 | - |

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

| # | Severite | Corrige | Probleme | Cause | Impact |
|---|----------|---------|----------|-------|--------|
| 1 | CRITICAL | OUI | GDPR export crash: req.user manque createdAt/updatedAt | JWT ne contient que id/email/name | TypeError a chaque appel export-data |
| 2 | HIGH | OUI | TTS non gate par feature flag | featureFlagService accepte mais jamais lu dans les routes | Endpoint accessible meme si voiceMode=false |
| 3 | HIGH | OUI | TTS sans rate limit | Route manque sessionLimiter | Abus API OpenAI possible |
| 4 | HIGH | OUI | InMemoryChatRepository n'applique pas sessionUpdates | Seul version++ etait fait, pas title/museumName/visitContext | Tests integration silencieusement faux sur visit context |
| 5 | HIGH | OUI | ImagePreviewModal setState pendant render | setState directement dans le corps du composant, hors useEffect | Anti-pattern React, bug de staleness potentiel |
| 6 | HIGH | OUI | Onboarding pagingEnabled + snapToInterval conflit | pagingEnabled supersede snapToInterval sur iOS | Snapping desaligne |
| 7 | MEDIUM | OUI | Redis connection failure silencieuse | catch vide | Pas de log, pas de diagnostic |
| 8 | MEDIUM | OUI | FloatingContextMenu tint='light' en dur | Non migre vers theme | Broken en dark mode |
| 9 | MEDIUM | OUI | StatusBar non synce avec theme override | style="auto" suit l'OS, pas le theme manuel | Status bar invisible en dark mode force |
| 10 | MEDIUM | OUI | Infinite scroll double-fire | useState guard vs useRef guard | Doublons possibles dans la liste |
| 11 | MEDIUM | OUI | JSDoc "Debounced" sans debounce | Documentation trompeuse | Confusion developpeur |

### Points non verifies (a surveiller)

| Point | Raison |
|-------|--------|
| TTS base64 cache en Redis — impact memoire | Pas de maxmemory configure; 200-500KB par message cache |
| BlurView tint sur Android 13 | expo-blur a un support limite sur Android |
| GDPR export OOM sur gros utilisateurs | Eager loading de toutes les sessions+messages sans pagination |
| Cache race condition (read stale pendant invalidation) | Trade-off accepte du pattern cache-aside |
| Pas de tests pour cache, TTS, GDPR export | Couverture de tests a ajouter en priorite |
| OpenAPI spec manque TTS + GDPR export | Contract drift — endpoints existent mais non documentes |

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

| # | Item | Fichiers principaux | Detail |
|---|------|---------------------|--------|
| 1 | S2-22: Strip PII JWT | `user-jwt-payload.ts`, `authSession.service.ts`, `authenticated.middleware.ts`, `auth.route.ts`, NEW `getProfile.useCase.ts` | AccessTokenClaims: `{sub,type,jti}` only. `verifyAccessToken()` returns `{id}`. `isAuthenticated` sets `req.user={id}`. `/me` et `/export-data` migres vers DB lookup via `GetProfileUseCase`. |
| 2 | S2-08: Redis container | `docker-compose.dev.yml`, `cache.port.ts`, `redis-cache.service.ts`, `noop-cache.service.ts`, `app.ts`, `.env.local.example` | Redis 7-alpine ajoute. `setNx` sur interface CacheService + implementations. `createApp()` accepte `cacheService` optionnel. |
| 3 | S2-17: Token cleanup | NEW `tokenCleanup.service.ts`, `index.ts` | `TokenCleanupService`: lock distribue via `setNx`, batch 10K, intervalle 6h, `timer.unref()`. Wire dans `index.ts` avec shutdown propre. |
| 4 | S2-18: Change password | NEW `changePassword.useCase.ts`, `refresh-token.repository.pg.ts`, `auth.route.ts`, `useCase/index.ts` | `revokeAllForUser()` sur RefreshTokenRepositoryPg. UseCase: verify current → validate new → check not same → `updatePassword(plain-text)` → revoke all. `PUT /change-password`. Shared `RefreshTokenRepositoryPg` singleton. |
| 5 | S2-13: Email verification | `user.entity.ts`, `user.repository.interface.ts`, `user.repository.pg.ts`, `register.useCase.ts`, NEW `verifyEmail.useCase.ts`, migration `AddEmailVerification` | 3 colonnes: `email_verified`, `verification_token`, `verification_token_expires`. Index partiel. `registerSocialUser()` set `email_verified=true`. RegisterUseCase envoie email (non-bloquant, try/catch). `POST /verify-email`. |
| 6 | S2-09: OpenAPI spec | `openapi/openapi.json`, `openapi-response.contract.test.ts`, `api.postgres.e2e.test.ts` | Register 201: `{user:{id,email}}`. 5 endpoints ajoutes. Contract tests mis a jour (type `put` ajoute). E2E test register assertion corrige (ancien format `{email, password:'hidden'}`). Frontend types regeneres. |
| 7 | S2-14: GDPR checkbox | `museum-frontend/app/auth.tsx` | Checkbox avec liens Terms/Privacy en mode register. Desactive sign-up + social buttons si non coche. Apple: `pointerEvents` wrapper. Google: `disabled`. Reset `gdprAccepted` au toggle mode. Login: texte legal simple. |

### Decisions techniques

| Decision | Raison |
|----------|--------|
| `updatePassword()` recoit plain-text, pas hash | Evite double-hashing: `updatePassword` hash en interne avec `BCRYPT_ROUNDS`. Pre-hasher causerait mots de passe inverifiables. |
| Verification token stocke en clair | Risque acceptable pour email verification (inferieur aux auth tokens). Coherence avec reset_token existant. |
| Social users `email_verified=true` a la creation | Providers (Apple/Google) verifient l'email. Sans ca, tous les social users apparaitraient non-verifies. |
| Single-batch token cleanup (10K/tick) | Leger, non-bloquant. Si >10K expires, ticks suivants nettoient. Script standalone pour purge manuelle. |
| `NoopCacheService.setNx` retourne `true` | Sans Redis, le cleanup s'execute toujours (pas de lock). Correct pour dev/test. |

### Tests ajoutes

| Fichier | Tests | Couvre |
|---------|-------|-------|
| `tests/unit/auth/jwt-pii-strip.test.ts` | 5 | verifyAccessToken returns {id}, token decoded has no PII, login response has SafeUser, GetProfileUseCase |
| `tests/unit/auth/token-cleanup.test.ts` | 4 | Lock acquired → runs, lock held → skips, no cache → runs, DB error → returns 0 |
| `tests/unit/auth/change-password.test.ts` | 6 | Wrong password, same password, weak password, social-only, success + revoke, user not found |
| `tests/unit/auth/verify-email.test.ts` | 5 | Valid token, expired token, empty token, register generates token, register succeeds if email fails |

### Bug fixes inclus

| Bug | Cause | Fix |
|-----|-------|-----|
| `/export-data` crash sur `createdAt`/`updatedAt` | JWT ne contenait jamais ces champs, cast incorrect | DB lookup via `GetProfileUseCase` |
| E2E test register assertion | Phase 1A changed response to `{user:{id,email}}` but test still expected `{email, password:'hidden'}` | Updated assertion |
| `request-logger.middleware.ts` ts-node error | Global Express augmentation not picked up by ts-node at runtime | Explicit type assertions |
| Frontend `expo-tracking-transparency` crash on web | Top-level import loads native module eagerly | Lazy `import()` inside Platform.OS check |

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
| Metrique | Avant (S1.5) | Apres (S3) | Delta |
|----------|-------------|------------|-------|
| Backend tests | 217 | 247 | +30 |
| Frontend tests | 11 | 13 | +2 |
| Backend test suites | 24 | 30 | +6 |
| New dependencies (BE) | 0 | 1 (ioredis) | +1 |
| New dependencies (FE) | 0 | 3 (expo-tracking-transparency, expo-image-manipulator, expo-clipboard) | +3 |
| New API endpoints | 0 | 2 (TTS, GDPR export) | +2 |
| New env vars | 0 | 13 (cache, TTS, feature flags) | +13 |
| Audit issues fixed | 0 | 19 (1 CRITICAL, 5 HIGH, 5+8 MEDIUM) | +19 |

---

## Sprint 3 Remediation — Forensic Completion (2026-03-19)

**Scope**: 4 remediation items from forensic audit, closing all deferred S3 tasks.
**Stats**: 40+ fichiers modifies/crees, 93 tests ajoutes (267→360), 1 migration generee.

### Resume executif

Cloture des 4 items identifies par les audits forensiques Sprint 3: (1) OpenAPI TTS endpoint + contract drift fix, (2) couverture tests TTS/cache/OCR/GDPR, (3) migration complete liquidColors → useTheme (15 fichiers), (4) 3 features reportees implementees (offline support, OCR guard, API key auth). Passe d'audit destructive avec 3 agents paralleles: 1 CRITICAL corrige (migration manquante), 2 HIGH corriges (async middleware, snapshot instabilite), 5 MEDIUM corriges.

### Changements cles

| Domaine | Action | Fichiers cles |
|---------|--------|---------------|
| Item 1: OpenAPI | TTS endpoint + FeatureUnavailable response + API key schemas/endpoints ajoutés au spec | `openapi/openapi.json` (24 paths, 27 ops) |
| Item 1: Frontend | `synthesizeSpeech()` API call + `responseType` support dans httpRequest | `chatApi.ts`, `services/http.ts` |
| Item 2: Tests TTS | 7 tests: audio buffer, empty text, user msg 400, ownership 404, no TTS 501, cache hit, no cache | `tests/integration/chat/chat-service-tts.test.ts` |
| Item 2: Tests Cache | 4 tests: getSession cached, listSessions cached, postMessage invalidates, createSession invalidates | `tests/integration/chat/chat-service-cache.test.ts` |
| Item 2: Tests GDPR | 3 tests: full payload, no chat data, null optional fields | `tests/unit/auth/export-user-data.test.ts` |
| Item 2: Test helpers | InMemoryCacheService, FakeTextToSpeechService, FakeOcrService + buildChatTestService overload | `tests/helpers/` |
| Item 3: Theme | 15 fichiers migres de `liquidColors` vers `useTheme()` (chat UI, screens, shared UI) | Batch A (7), B (3), C (5) |
| Item 4A: OCR Guard | OcrService port + TesseractOcrService + DisabledOcrService + fail-open integration + 4 tests | `ocr-service.ts`, `chat.service.ts`, `chat-service-ocr-guard.test.ts` |
| Item 4B: API Keys | ApiKey entity + HMAC-SHA256 hashing + timing-safe middleware + CRUD use cases + 14 tests + migration | 9 new files + auth.route.ts + authenticated.middleware.ts |
| Item 4C: Offline | ConnectivityProvider + OfflineQueue + useOfflineQueue + OfflineBanner + useChatSession integration | 5 new files + useChatSession.ts + _layout.tsx |

### Audit destructif (3 agents paralleles)

| Severity | Count | Corriges | Exemples |
|----------|-------|----------|----------|
| CRITICAL | 1 | 1 | Migration `api_keys` manquante — generee |
| HIGH | 2 | 2 | async `validateApiKey` sans `.catch(next)`, `useSyncExternalStore` snapshot instabilite |
| MEDIUM | 7 | 5 | `synthesizeSpeech` 204 dead code, OCR fail-open sans logging, contract tests API keys manquants, `setNx` TTL check |
| LOW | 6 | 0 | Performance concerns (Tesseract worker-per-request, base64 cache overhead), architecture notes |

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

| Decision | Choix | Raison |
|----------|-------|--------|
| Prompts LLM | English-only + `Reply in ${language}` | Elimine 16+ ternaires FR/EN, fiable avec GPT-4o/Gemini/Deepseek |
| Frontend framework | react-i18next + expo-localization | Standard RN, useSuspense: false, bundles statiques |
| Locale propagation | Accept-Language header + context.locale body | Double canal: header global, body override par requete |
| Guardrail refusals | Dictionnaire statique 7 langues x 3 variantes | Pas de LLM call pour les refus |
| Locale storage | `runtime.defaultLocale` (cle unique) | Evite desync entre I18nContext et runtimeSettings |
| Device language detection | Seulement si aucune preference stockee | Respect du choix explicite de l'utilisateur |

### Backend — Nouveaux fichiers

| Fichier | Role |
|---------|------|
| `src/shared/i18n/locale.ts` | `resolveLocale()`, `localeToLanguageName()`, `parseAcceptLanguageHeader()`, `SUPPORTED_LOCALES` |
| `src/shared/i18n/guardrail-refusals.ts` | 21 strings statiques (7 langues x 3 variantes: insult, external_request, default) |
| `src/shared/i18n/fallback-messages.ts` | Templates de fallback LLM localises (7 langues) |
| `src/helpers/middleware/accept-language.middleware.ts` | Parse Accept-Language → `req.clientLocale` |

### Backend — Fichiers modifies

| Fichier | Changement |
|---------|-----------|
| `app.ts` | +middleware acceptLanguage, +Accept-Language dans CORS allowedHeaders |
| `llm-sections.ts` | Supprime `isFrenchLocale()` + 16 ternaires. Prompts EN-only + `Reply in ${language}`. Fallback localise via `FALLBACK_TEMPLATES[locale].defaultQuestion` |
| `art-topic-guardrail.ts` | Supprime `isFrench()`. `buildGuardrailRefusal` → lookup `GUARDRAIL_REFUSALS[resolveLocale()]`. +CJK keywords (8), +greetings multilangues. +`isCjk()` guard pour `containsKeyword` (`\b` ne marche pas avec CJK) |
| `langchain.orchestrator.ts` | `startsWith('fr') ? 'French' : 'English'` → `localeToLanguageName(resolveLocale([locale]))` |
| `chat.route.ts` | Accept-Language fallback dans messages/audio/stream/sessions handlers |
| `chat.service.ts` | Session locale update mid-conversation (normalise via `resolveLocale()` avant persistance) |
| `chat.repository.interface.ts` | +`locale?: string` dans `PersistMessageSessionUpdates` |
| `chat.repository.typeorm.ts` | Applique `sessionUpdates.locale` dans la transaction persistMessage |

### Frontend — Nouveaux fichiers

| Fichier | Role |
|---------|------|
| `shared/i18n/i18n.ts` | Init i18next avec 7 bundles statiques |
| `shared/i18n/I18nContext.tsx` | Provider React: AsyncStorage + device detection + sync i18n/httpClient/runtimeSettings |
| `shared/i18n/types.ts` | Module augmentation i18next pour type-safe keys |
| `shared/config/supportedLocales.ts` | `LANGUAGE_OPTIONS`, `toSupportedLocale()` |
| `shared/locales/{en,fr,es,de,it,ja,zh}/translation.json` | 296 cles chacun |
| `scripts/check-i18n-completeness.js` | CI: verifie toutes les cles EN existent dans chaque langue |

### Frontend — Fichiers modifies (~25 fichiers)

- `app/_layout.tsx` — mount I18nProvider (outermost)
- `shared/infrastructure/httpClient.ts` — `setLocale()`/`getLocale()` + Accept-Language interceptor
- `features/chat/infrastructure/chatApi.ts` — Accept-Language sur streaming fetch()
- `app/(stack)/preferences.tsx` — Language picker (7 boutons) remplace TextInput libre
- `features/chat/ui/WelcomeCard.tsx` — Supprime `locale` prop + `getEnSuggestions`/`getFrSuggestions`, remplace par `t()`
- ~20 autres screens/components — extraction strings `t()`

### Tests

| Suite | Avant | Apres |
|-------|-------|-------|
| Backend total | 346 (1 fail pre-existant) | 367 (40/40 suites pass) |
| Backend nouveaux | — | `locale.test.ts` (35), `guardrail-refusals.test.ts` (5), `accept-language.test.ts` (4) |
| Backend modifies | — | `llm-sections.test.ts` (+7 locales), `art-topic-guardrail.test.ts` (+4 locales) |
| Frontend | 13 | 22 |
| i18n CI check | — | 7 langues x 296 cles = PASS |

### Bugs trouves et corriges par audit

| # | Severite | Fichier | Bug | Correction |
|---|----------|---------|-----|------------|
| 1 | CRITICAL | `art-topic-guardrail.ts` | `\b` regex ne fonctionne pas avec CJK — keywords JA/ZH ne matchent jamais | `isCjk()` guard → `includes()` pour CJK |
| 2 | CRITICAL | `art-topic-guardrail.ts` | `GREETING_PATTERN` `\b` casse apres こんにちは/你好 | `\b` → `(\b\|$)` en fin de pattern |
| 3 | CRITICAL | `llm-sections.ts` | Fallback `'Artwork question.'` hardcode EN dans texte sinon localise | Utilise `FALLBACK_TEMPLATES[locale].defaultQuestion` |
| 4 | HIGH | `I18nContext.tsx` | Dual AsyncStorage keys (`app.language` vs `runtime.defaultLocale`) | Unifie: lit `runtime.defaultLocale` directement |
| 5 | HIGH | `guardrail-refusals.ts` + `fallback-messages.ts` | Diacritiques manquants FR/ES/DE/IT | Tous accents corriges |
| 6 | MEDIUM | `chat.service.ts` | `requestedLocale` brut persiste en DB | Normalise via `resolveLocale()` |
| 7 | MEDIUM | `I18nContext.tsx` | `defaults.defaultLocale = "en-US"` empeche detection device pour nouveaux users | Lit raw AsyncStorage, detecte device si null |
| 8 | MEDIUM | `chatApi.ts` | Streaming `fetch()` sans Accept-Language header | Ajoute `'Accept-Language': getLocale()` |
| 9 | LOW | `check-i18n-completeness.js` | Valeurs `null` dans JSON non detectees | Ajoute check `value === null` et `typeof !== 'string'` |

### Verification finale

- [x] Backend `tsc --noEmit`: 0 erreurs
- [x] Frontend `tsc --noEmit`: 0 erreurs nouvelles
- [x] Backend tests: 120/120 i18n tests pass, 360+ total pass
- [x] Frontend tests: 22 pass
- [x] i18n completeness: 7 langues x 296 cles PASS
- [x] Aucun `isFrenchLocale`/`isFrench`/`startsWith('fr')` residuel dans backend src/
- [x] 2 passes d'audit adversarial (4 agents x 2 = 8 audits paralleles)
