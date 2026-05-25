# C1 — Audit E2E feature CHAT (in/out musée, voice-first)

**Auditeur** : architecte READ-ONLY fresh-context (UFR-022)
**Branche** : `dev` @ HEAD `89852f2a1`
**Date** : 2026-05-25
**Méthode** : gitnexus + Grep + Read. Tout claim cité `path:line`. `[V]` = vérifié (Read), `[S]` = supposé/inféré.

> Tous les chemins FE sont relatifs à `museum-frontend/`, les chemins BE à `museum-backend/`.

---

## 1. Diagramme du flux entrée → data

```
┌─────────────────────────────── FRONTEND (museum-frontend) ───────────────────────────────┐

 ÉCRAN
   app/(stack)/chat/[sessionId].tsx
     ├─ useChatSession(sessionId)                      [V] :16,:100
     ├─ <Composer> → inputHandlers.onSend              [V] :36,:223
     └─ <ChatMessageList messages isStreaming />        [V] :503-504

 HOOK ORCHESTRATEUR
   features/chat/application/useChatSession.ts
     sendMessage(params)                                [V] :169
       └─ pickSendStrategy(params, ctx)                 [V] :175  →  chatSessionStrategies.pure.ts:43
            • text seul / online / pas low-data-1er → 'streaming'   [V] strategies.pure:69
            • imageUri                                  → 'streaming'
            • audioUri/audioBlob                        → 'audio'    [V] strategies.pure:65
            • offline                                   → 'offline'  [V] strategies.pure:61
            • low-data + museum + 1er tour text         → 'cache'    [V] strategies.pure:51
       context.chatApi = chatApi (RÉEL)                 [V] :13,:197

 STRATÉGIES  (features/chat/application/sendStrategies/)
   ── streaming (texte / image) ──────────────────────  sendMessageStreaming.ts
       optimistic user msg                              [V] :32-38
       placeholder assistant text:''                    [V] :42-54   (streamingIdRef ← placeholderId)
       await context.chatApi.sendMessageSmart({onToken,onDone,onGuardrail})  [V] :62-114
       ⚠ onDone JAMAIS appelé en prod (voir §4)
       fallback sync   if (response && (!streamingIdRef.current || imageUri)) [V] :117
   ── audio ──────────────────────────────────────────  sendMessageAudio.ts
       gère sa réponse directement via setMessages       [V] :55-75  (NE dépend PAS de onDone)
   ── cache / offline ────────────────────────────────  cache-first puis fallthrough / enqueue

 chatApi.sendMessageSmart  (infrastructure/chatApi/)
   index.ts:27   sendMessageSmartBound = sendMessageSmart({ postMessage })   [V]
   send.ts:169   sendMessageSmart = (deps) => (params) => deps.postMessage(params)  [V]
     └─ ⚠ onToken/onDone/onGuardrail/signal IGNORÉS (commentaire :158-168)  [V]
   send.ts:81    postMessage → multipart si imageUri sinon JSON              [V] :99-141
                 POST {CHAT_BASE}/sessions/{sessionId}/messages              [V] :143
                 X-Data-Mode header si lowDataMode                           [V] :146-148

└────────────────────────────────────────────────────────────────────────────────────────┘
                                       │  HTTP POST (JSON ou multipart)
                                       ▼
┌─────────────────────────────── BACKEND (museum-backend) ─────────────────────────────────┐

 ROUTE  src/modules/chat/adapters/primary/http/routes/chat-message.route.ts
   POST /sessions/:id/messages                                              [V] :183-195
     middleware ORDRE : isAuthenticated → dailyChatLimit → userLimiter
                        → sessionLimiter → llmCostGuard → [uploadAdmission]
                        → extendTimeoutForUpload → upload.single('image')   [V] :185-193
   createPostMessageHandler → chatService.postMessage(...)                  [V] :80-92
   res.status(201).json(result)   (SYNCHRONE, pas de SSE)                   [V] :92

 FAÇADE  useCase/orchestration/chat.service.ts
   ChatService.postMessage → measureChatRequest(messages.postMessage)       [V] :216-232

 USE-CASE  useCase/message/chat-message.service.ts
   ChatMessageService.postMessage                                           [V] :237
     1. pipeline.prepare(...)                                               [V] :244
        └─ si refused (guardrail/consent) → renvoie result direct           [V] :245
     2. effectiveUserText = redactedText ?? input.text                      [V] :249
     3. sanitizedText = piiSanitizer.sanitize(...)                          [V] :250
     4. orchestratorInput = pipeline.buildOrchestratorInput(...)            [V] :251
     5. tryLlmCacheLookup → HIT → commitResponse                            [V] :266-277
     6. aiResult = orchestrator.generate(orchestratorInput)                 [V] :285  (try/finally span)
     7. tryLlmCacheStore(aiResult)                                          [V] :299
     8. commitResponse(...)                                                 [V] :304

 PIPELINE PRÉ-LLM  useCase/orchestration/prepare-message.pipeline.ts  PrepareMessagePipeline.prepare
     a. validateMessageInput (maxTextLength, text||image requis)            [V] :266,:163-170
     b. runConsentGate (third-party AI consent, fail-CLOSED anon)           [V] :268, consent-gate
     c. ensureSessionAccess (ownership 404)                                 [V] :271, session-access.ts:36-39
     d. processInputImage → EXIF strip + runOcrGuard                        [V] :274,:188-225
     e. guardrail.evaluateInput (keyword→provider→judge)                    [V] :283
        └─ block → handleInputBlock (persist user+refusal atomique)         [V] :291-302
     f. repository.persistMessage(role:'user')                              [V] :304   → chat_messages
     g. enrichAndResolveLocation (Promise.all : enrichment + location + knowledge-router) [V] :307,:418-449
     h. resolveCurrentArtwork (cartel scan → [CURRENT ARTWORK])             [V] :320,:350-364

 ORCHESTRATEUR  adapters/secondary/llm/langchain.orchestrator.ts
     buildSectionMessages → [SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]  [V] :81-83
     boundary marker  [END OF SYSTEM INSTRUCTIONS]   llm-prompt-builder.ts:173                [V]
     Spotlighting envelope (per-turn nonce, variable tail)  llm-prompt-builder.ts:380         [V]
     sanitizePromptInput sur location/artwork/memory  llm-sections.ts:284, prompt-builder:72  [V]
     → providers LLM (OpenAI/Deepseek/Google), circuit breaker, cost breaker
   (cache key = LlmCacheServiceImpl v2, museumId+userId scoping  chat-message.service.ts:433-465 [V])

 COMMIT  useCase/orchestration/message-commit.ts  commitAssistantResponse
     1. guardrail.evaluateOutput (output guardrail layer 6)                 [V] :186
     2. buildCommitPayload (text, metadata, sessionUpdates, artworkMatch)   [V] :199
     3. applyAntiHallucinationFilters (drop sources non-grounded + URL probe) [V] :209,:37-61
     4. persistAssistantMessage(role:'assistant', metadata, cacheKey)       [V] :211 → chat_messages
     5. postCommitSideEffects (cache invalidation + userMemory)             [V] :228
     6. suggestions sanitisées (sanitizePromptInput,60)                     [V] :236-239
     7. metadata.phase='done' + span 'done'                                 [V] :243-245
   RETOUR  { sessionId, message:{id,role,text,createdAt,suggestions?}, metadata }  [V] :247-257

 DATA
   chat_messages (FK sessionId → ChatSession, museumId porté par session)   [V] chatMessage.entity.ts:24-31
   S3 images : ImageProcessingService → image-storage.s3.ts                 [V] (pipeline d)
   S3 audio / TTS Opus : ChatMediaService.synthesizeSpeech                  [V] chat.service.ts:294
   embeddings pgvector : image-enrichment / siglip / replicate adapters     [S] (présents, hors path texte)

└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. ✅ Maillons solides

- **Route + middleware ordering** `chat-message.route.ts:183-195` — `[V]` rate-limit AVANT `llmCostGuard` AVANT admission ; mutating middleware après validators (conforme CLAUDE.md "Mutating middleware ordering").
- **6 layers de sécurité chat — ordonnancement conforme CLAUDE.md AI Safety** `[V]` :
  1. V1 keyword `evaluateUserInputGuardrail` runs FIRST, hard-block early-return — `guardrail-evaluation.service.ts:131-143`.
  2. Structural isolation — `[END OF SYSTEM INSTRUCTIONS]` `llm-prompt-builder.ts:173` + Spotlighting envelope `:380`.
  3. Input sanitization — `sanitizePromptInput` location `llm-sections.ts:284`, artwork title `llm-prompt-builder.ts:72`, memory `user-memory.prompt.ts:15`.
  4. V2 LLM Guard sidecar — `evaluateGuardrailProvider('input', …)` `guardrail-evaluation.service.ts:147` (en ADDITION du keyword, ADR-048).
  5. V2 LLM judge — `runLlmJudge` `:182` (sélectif inputs longs).
  6. Output guardrail — `evaluateOutput` `:186` dans commit.
  Ordre runtime input = keyword → provider → judge ; isolation/sanitize au prompt-builder (post-allow). Les 2 V2 layers indépendants. **Conforme.**
- **Consent gate GDPR fail-CLOSED** `prepare-message.pipeline.ts:268` AVANT `ensureSessionAccess` `:271` — anon refusé sans toucher la session (R9 parity).
- **Ownership scoping** `session-access.ts:36-39` — `[V]` 404 si `ownerId !== currentUserId` ; anon→owned bloqué.
- **museum_id scoping** — `[V]` messages scopés via FK `sessionId` (`chatMessage.entity.ts:24-31`) ; la session porte `museumId` ; cache key inclut `museumId` (`chat-message.service.ts:438-441`). Pas de fuite cross-musée constatée.
- **PII redaction avant LLM + cache** `chat-message.service.ts:249-250` — redactedText puis sanitize avant build orchestrator input et avant cache key (LLM02).
- **Anti-hallucination commit** `message-commit.ts:37-61` — sources non-grounded droppées AVANT persist & réponse.
- **Path AUDIO E2E intact** — `sendMessageAudio.ts:55-75` consomme `response.message.text` + `response.transcription` directement via `setMessages` ; BE `postAudioMessage` renvoie `{...response, transcription}` `chat-message.service.ts:417-420`. **Indépendant du bug onDone.**
- **Path IMAGE E2E intact** — fallback sync `sendMessageStreaming.ts:117` truthy car `attempt.imageUri` est défini → bloc :128-148 remplace le placeholder par `response.message.text`. Test `useChatSession.test.ts:723-768` couvre et asserte le texte assistant.
- **Cache key v2 discipline** — `[V]` voiceMode/audioDescriptionMode/currentArtworkKey inclus (`chat-message.service.ts:452-464`), conforme gotcha "cache key v2".

---

## 3. ⚠ Maillons faibles / ruptures

### ⚠ RUPTURE CRITIQUE — bulle assistant VIDE sur texte-seul  (sévérité : CRITICAL, V1-blocker)
- **Chaîne cassée** :
  - Prod wire `sendMessageSmart = (deps) => (params) => deps.postMessage(params)` — `send.ts:169-172` `[V]`. Les callbacks `onToken/onDone/onGuardrail` sont **explicitement ignorés** (commentaire `:158-168`). `onDone` n'est donc JAMAIS appelé.
  - Conséquence : dans `sendMessageStreaming.ts`, le bloc `onDone` (`:81-109`) qui remplace le placeholder par `streamTextRef.current` ne s'exécute pas, et `resetStreaming()` (`:83`) n'est pas appelé → `context.streamingIdRef.current` reste = `streamingPlaceholderId` (truthy).
  - Le fallback sync `:117` : `if (response && (!context.streamingIdRef.current || attempt.imageUri))`. Pour texte-seul : `!streamingIdRef.current` = **false** (ref toujours set), `attempt.imageUri` = **undefined** → condition **FALSY** → bloc `:128-148` (qui remplit `response.message.text`) **sauté**.
  - Le placeholder assistant garde `text: ''` (`:49`). `setIsStreaming(false)` (`:155`) ⇒ `ChatMessageList.tsx:182` `isItemStreaming=false` ⇒ pas de skeleton ⇒ `ChatMessageBubble.tsx:133/149` rend `message.text=''` = **bulle vide**.
- **Impact data** : le BE persiste correctement la réponse (`message-commit.ts:211`) et la renvoie dans `response.message.text` (`:247-257`) ; la perte est purement FE-rendu. Au reload de session (`useSessionLoader`) le vrai texte réapparaîtrait (réponse en DB) → bug visuel transitoire mais 100 % reproductible au 1er affichage.
- Verdict détaillé : §5.

### ⚠ Test masque le bug (UFR-021 false-confidence)  (sévérité : HIGH)
- `__tests__/hooks/useChatSession.test.ts` :
  - Test texte-seul `:214-246` `[V]` — n'asserte QUE `sendResult===true` + call args ; **n'asserte jamais** que la bulle assistant a du texte.
  - Test "streaming invokes onToken and onDone" `:773` `[V]` — utilise un **mock** `mockSendMessageSmart` qui appelle manuellement `params.onDone?.(...)` (`:786`). Or le réel `sendMessageSmart` ne l'appelle pas. Le test mocke exactement l'interaction cassée → vert en CI, rouge en prod. Cas d'école du DOB-2026-05-17 (CLAUDE.md UFR-021).
  - Aucun Maestro flow / test n'exerce le happy-path texte-seul avec le réel `sendMessageSmart`.

### ⚠ Commentaires de code stale/trompeurs autour du bug  (sévérité : MEDIUM)
- `sendMessageStreaming.ts:116-127` — commentaires décrivent un contrat SSE (`onDone` retourne `message.text===''` donc fallback skippé) qui ne tient PLUS : `onDone` ne tourne jamais, donc le fallback DEVRAIT tourner mais sa garde `:117` l'en empêche. Les commentaires « SSE deprecated, this is the live path » (`:119-124`) sont contredits par la garde elle-même pour le cas texte-seul. Source de confusion pour le prochain mainteneur.

### ⚠ `measureChatRequest` outcome toujours 'success' sur cache-hit/guardrail  (sévérité : LOW)
- `chat.service.ts:309-335` `[V]` — commentaire `:311-316` reconnaît que `cache_hit`/`guardrail_blocked` ne sont jamais émis sur la métrique (seulement via thrown errors). Observabilité dégradée, pas un bug fonctionnel.

---

## 4. 🔧 Gaps E2E

- 🔧 **Gap-1 (CRITICAL)** — texte-seul ne rend aucune réponse à l'écran (1er affichage). Fix minimal : retirer la garde morte ligne 117 (rendre `onDone` mort = consommer `response.message.text` inconditionnellement quand `response` truthy), OU restaurer un vrai appel `onDone` côté `sendMessageSmart`. À traiter en in-session (V1-blocker, pas à documenter — cf. feedback_track_not_treat_v1_blocker).
- 🔧 **Gap-2 (HIGH)** — aucun test (Jest réel ou Maestro) ne couvre le happy-path texte-seul avec le `chatApi` réel. Ajouter : (a) un test `useChatSession` qui stubbe `postMessage` (pas `sendMessageSmart`) et asserte `assistantMsg.text === '<réponse>'` ; (b) un Maestro flow `/chat/:sessionId` tap-through texte (UFR-021).
- 🔧 **Gap-3 (MEDIUM)** — nettoyer les commentaires SSE stale dans `sendMessageStreaming.ts:21-27,116-127` une fois le fix appliqué (la couche SSE est enterrée — UFR-016).
- 🔧 **Gap-4 (LOW, à confirmer)** — `[S]` chemins embeddings pgvector / TTS Opus non tracés en profondeur ici (hors path texte) ; présents dans le module mais leur E2E complet est hors scope de cet audit texte-first. À couvrir dans un sous-audit C-media si besoin.

---

## 5. Verdict bulle-vide texte-seul

**CONFIRMÉ.** `[V]` chaîne mécanique complète :

1. `send.ts:169-172` — `sendMessageSmart` réel = `(deps) => (params) => deps.postMessage(params)`, n'appelle JAMAIS `onDone` (callbacks ignorés, commentaire `:158-168`).
2. `index.ts:27` — prod wire `sendMessageSmart({ postMessage })` (le réel, pas un mock).
3. `useChatSession.ts:236-241` — texte-seul dispatché vers `sendMessageStreaming` (via `pickSendStrategy` → `'streaming'`, `chatSessionStrategies.pure.ts:69`).
4. `sendMessageStreaming.ts:81-109` — bloc `onDone` (remplacement placeholder) jamais exécuté ⇒ `resetStreaming()` `:83` non appelé ⇒ `streamingIdRef.current` reste truthy.
5. `sendMessageStreaming.ts:117` — garde `(!streamingIdRef.current || attempt.imageUri)` = `(false || undefined)` = **falsy** pour texte-seul ⇒ bloc de remplissage `:128-148` **sauté**.
6. `sendMessageStreaming.ts:49` + `useStreamingState.ts` — placeholder assistant conserve `text: ''`.
7. `ChatMessageList.tsx:182` + `ChatMessageBubble.tsx:133,149` — après `setIsStreaming(false)` (`sendMessageStreaming.ts:155`), `isItemStreaming=false` ⇒ pas de skeleton ⇒ rendu de `message.text=''` = **bulle assistant vide affichée à l'utilisateur**.

La réponse EST bien générée et persistée côté BE (`message-commit.ts:211,247-257`) ; le bug est 100 % côté rendu FE et 100 % reproductible sur le path texte-seul (le plus courant hors musée). Path image et path audio NON affectés.
