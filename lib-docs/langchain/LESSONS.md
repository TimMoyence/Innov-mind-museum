# Lessons — langchain (family : @langchain/core + @langchain/openai + @langchain/google-genai)

Project-specific gotchas. Audit enterprise-grade 2026-05-18 (6 consumers audités).

## 2026-05-18 — `ChatGoogleGenerativeAI` est DÉPRÉCIÉ en v1 (PATTERNS.md §5.c)
- **Symptôme** : usage actuel fonctionne mais sur deprecation track v1.
- **Cause** : LangChain v1 retire `@langchain/google-genai` au profit de `ChatGoogle` (paquet différent, recette de migration ABSENTE du snapshot lib-docs).
- **Sites** : `museum-backend/src/modules/chat/adapters/secondary/llm/langchain-orchestrator-support.ts:1,82`, `museum-backend/src/modules/chat/useCase/guardrail/art-topic-classifier.ts:2,28`.
- **Fix** : voir TD-LC-01 dans `docs/TECH_DEBT.md`. Avant migration : doc-fetcher pass sur `ChatGoogle` upstream + update PATTERNS.md.
- **Anti-pattern à éviter** : ajouter de nouvelles dépendances sur `ChatGoogleGenerativeAI` — toute nouvelle intégration Gemini doit attendre la migration.

## 2026-05-18 — `openAIApiKey` / `modelName` sont des alias v0 — utiliser `apiKey` / `model` (v1 canonical)
- **Symptôme** : pas de bug runtime (aliases backward-compat acceptés par v1.x), mais doc-drift.
- **Cause** : v1 canonical option names = `apiKey` + `model`. Aliases v0 (`openAIApiKey`, `modelName`) toujours acceptés mais sur deprecation timeline non documentée.
- **Sites** : 4 constructors ChatOpenAI dans `langchain-orchestrator-support.ts:90-98,102-107`, `art-topic-classifier.ts:19-25,36-43`, `content-classifier.service.ts:70-74`.
- **Fix** : normaliser à `apiKey:` + `model:` everywhere lors du même refactor que TD-LC-01.
- **Anti-pattern à éviter** : copier-coller un constructor existant qui utilise les anciens noms.

## 2026-05-18 — Deepseek ChatOpenAI client doit setter `streamUsage: false` (PATTERNS.md DO #8)
- **Symptôme** : actuellement latent (orchestrator utilise `.invoke()` seul, pas `.stream()`). Deviendrait live si streaming réintroduit.
- **Cause** : endpoints OpenAI-compatible third-party (e.g. Deepseek `https://api.deepseek.com/v1`) ne supportent pas le format d'usage tokens du SSE OpenAI v1 → erreur `streamUsage` si activé.
- **Sites** : `langchain-orchestrator-support.ts:90-98`, `art-topic-classifier.ts:36-43` — constructors Deepseek SANS `streamUsage: false`.
- **Fix** : add `streamUsage: false` aux 2 constructors Deepseek (defense-in-depth avant future feature streaming).
- **Anti-pattern à éviter** : assumer que le client OpenAI v1 marche tel quel sur un endpoint third-party — toujours vérifier la doc du provider.

## 2026-05-18 — `z.record(z.string(), z.unknown())` est Gemini-incompatible (DON'T #4) ET fragile pour OpenAI strict mode
- **Symptôme** : structured-output peut échouer silencieusement ou rendre l'output non-portable cross-provider.
- **Cause** : PATTERNS.md §4 DON'T #4 explicite que Google AI API exige explicit object properties — pas de free-form dictionaries. OpenAI strict mode même contrainte ; non-strict mode souvent tolère mais comportement runtime imprévisible.
- **Sites** : `museum-backend/src/modules/knowledge-extraction/useCase/classification/content-classifier.service.ts:25-32` (6 fields : openingHours, admissionFees, collections, currentExhibitions, accessibility, contactInfo).
- **Fix** : énumérer les 6 dictionary fields avec keys explicites OU marquer `strict: false` + documenter pourquoi.
- **Anti-pattern à éviter** : utiliser `z.record(...)` dans un schema bound à un LLM via `withStructuredOutput` ou `bindTools`.

## 2026-05-18 — `withStructuredOutput` SANS `strict: true` masque les Zod-parse failures
- **Symptôme** : OpenAI peut renvoyer un output qui fail Zod parse → throw inside `structured.invoke()`. Sans `strict: true`, l'API laisse passer côté serveur ; la détection arrive trop tard (côté client).
- **Cause** : PATTERNS.md §3 DO #8 — `strict: true` enforce schema compliance côté serveur OpenAI = surface drift au layer API au lieu d'attendre Zod côté code.
- **Sites** : 3 call sites omettent `strict: true` — `langchain.orchestrator.ts:92-94,280-282`, `content-classifier.service.ts:75`.
- **Fix** : add `{ name, strict: true }` aux 3 call sites. Verify aucun path Gemini n'utilise ces schemas (Gemini structured-output a sémantique différente).
- **Anti-pattern à éviter** : compter sur Zod parse pour catch les schema mismatches — surface au plus tôt côté API.

## 2026-05-18 — Prompt isolation correctement implémentée (validation positive)
- **Status** : ✅ conforme CLAUDE.md §AI Safety.
- **Evidence** : marker `[END OF SYSTEM INSTRUCTIONS]` (llm-prompt-builder.ts:129), ordering SystemMessage → user content (lines 291-326), sanitization via `sanitizePromptInput` + `evaluateUserInputGuardrail` (lines 21-26), wrapping `<user_message>` / `<visitor_context>` / `<untrusted_content>` (lines 200-203, 248-258). `userMemoryBlock` intentionnellement NON wrappé (line 304-306) avec rationale 'own-DB derived data' = correct.
- **À surveiller** : tout nouveau path qui injecte du user-controlled content directement dans system prompt = REGRESSION CRITIQUE.

## 2026-05-18 — Gemini multimodal : 1 HumanMessage MAX (DON'T #5) — pattern correctement géré
- **Status** : ✅ conforme.
- **Evidence** : orchestrator construit au plus 1 HumanMessage par section invocation, toujours la dernière (llm-prompt-builder.ts:213-221). History messages sont TEXT-ONLY (pas de `content: [image_url]`).
- **À surveiller** : ne JAMAIS ajouter de multimodal aux history messages (chat.repository), seulement à la HumanMessage finale.
