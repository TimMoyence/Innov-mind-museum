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

## 2026-05-20 — Refresh delta (lib-doc-curator pass)

### CVE-2025-68665 / GHSA-r399-636x-v7f6 — HIGH (CVSS 8.6) — Musaium NOT vulnerable
- **Symptôme upstream** : serialization injection via objets contenant clef `lc:` passés à `toJSON()` / `JSON.stringify` puis re-désérialisés via `loads()` → class instantiation arbitraire → fuite de secrets.
- **Affected** : `@langchain/core < 1.1.8`, `langchain < 1.2.3` (ou `< 0.3.37` en 0.x).
- **Musaium status** : `@langchain/core@1.1.45 ≥ 1.1.8` ✅, transitive `langchain@0.3.37 ==` patched floor ✅. Vérifié via `pnpm-lock.yaml:3899`.
- **Hardening permanent** : orchestrator construit les messages localement, ne fait JAMAIS `loads()` / `loadFromHub` sur du JSON externe. **Ne pas régresser** — toute future feature "import workflow JSON" passe par revue sécu.
- **Anti-pattern à éviter** : `JSON.parse(userInput)` puis `loads(obj)` en chaîne, sans filtrer les clefs `lc:*`.

### `@langchain/openai@1.4.1+` ramène la détection `ContextOverflowError` côté Deepseek
- **Symptôme actuel (1.4.2)** : un overflow Deepseek revient en 400 générique, `isRetryableError` (`langchain-orchestrator-support.ts:326-345`) ne classifie pas → orchestrator retry blindly jusqu'au budget exhausté = pure budget burn.
- **Cause upstream** : PR #10481 (2026-03-31) — `wrapOpenAIClientError` lit `maximum context length` dans le message 400 Deepseek et lève `ContextOverflowError`.
- **Fix prévu** : bump `@langchain/openai` → ≥1.4.1 (déjà couvert par bump latest 1.4.6) + ajouter classification terminal dans `isRetryableError` : `if (error.name === 'ContextOverflowError') return false;`. Voir PATTERNS.md §8.c.
- **Anti-pattern à éviter** : retry blanket sur 400 — toute classification 4xx mérite reconnaissance par type d'erreur LangChain.

### `@langchain/google` (v0.1.12) — recette de migration `ChatGoogle` maintenant disponible (TD-LC-01)
- **Statut** : la coverage warning 2026-05-18 "ChatGoogle migration recipe absent" est **résolue** (docs.langchain.com/.../chat/google publie le constructor + migration pointer).
- **Recette validée** (snapshot 2026-05-20) :
  ```ts
  // Drop-in dans langchain-orchestrator-support.ts:1, 282-293 :
  import { ChatGoogle } from '@langchain/google/node';
  return new ChatGoogle({ apiKey, model, maxOutputTokens, maxRetries });
  ```
  Mêmes options Musaium-pertinentes (`apiKey`, `model`, `maxOutputTokens`, `maxRetries`). Env var `GOOGLE_API_KEY` inchangé. **`timeout` reste typé hors-scope** sur `ChatGoogle` v0.1.12 (à vérifier au moment du bump avant migration). Bonus inattendu : `logprobs` IS supporté (lifts DON'T #8 de §4).
- **Anti-pattern à éviter** : ajouter un nouveau consumer `ChatGoogleGenerativeAI` aujourd'hui. Tout nouveau code Gemini = `ChatGoogle` from day one.

### Drift mineur — bump batch recommandé
- `@langchain/openai` 1.4.2 → 1.4.6 (4 patches), `@langchain/core` 1.1.45 → 1.1.47 (2 patches), `@langchain/google-genai` 2.1.26 → 2.1.31 (5 patches). Tous patch-only, pas de breaking.
- Notable hors du chemin Musaium actuel : `@langchain/openai@1.4.6` patch `JSON.parse` mid-stream Responses API + preserve assistant tool calls v1 (defense-in-depth, pas de bug live).
- **Anti-pattern à éviter** : skipper le bump batch sous prétexte "patches mineurs" — `wrapOpenAIClientError` ContextOverflow détection (1.4.1) est un gain net pour le chemin Deepseek.

### Audit `withStructuredOutput` strict — toujours 3 call sites NON-strict
- **Status** : ⚠️ TD-LC-05 partiellement résolu seulement.
- **Conformes** ✅ : `llm-judge-guardrail.ts:128` (`strict: true`).
- **Non-conformes** ❌ : `langchain.orchestrator.ts:159` (main chat path), `langchain.orchestrator.ts:419` (walk-tour-guide), `content-classifier.service.ts:75`.
- **Effort** : le schema `MainAssistantOutput` (`main-assistant-output.schema.ts`) est DÉJÀ strict-compliant (all-required-`nullable`, no `.default()`, no `record`). Les 2 call sites orchestrator = 1-line add chacun. `content-classifier.service.ts` exige un schema rewrite (6 × `z.record(...)` à expliciter) AVANT `strict: true`.
- **Anti-pattern à éviter** : assumer "le schema marche en non-strict, on s'en fout" — strict surface les drifts au layer API, pas au layer Zod côté client (lecture critique en cas d'incident).
