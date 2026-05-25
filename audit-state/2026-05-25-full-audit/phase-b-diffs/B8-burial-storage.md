# B8 — Burial dead-code + storage namespacing (cluster review)

**Reviewer**: senior read-only, fresh-context (UFR-022)
**Branch**: `dev` @ HEAD `89852f2a1`
**Scope**: 7 commits mergés 2026-05-25 (PR #299)
**Date**: 2026-05-25

---

## Note: **7.5 / 10** — verdict: **APPROVED WITH RESERVATIONS**

Les suppressions sont propres, complètes, byte-clean (tsc exit 0). La migration storage est correcte et bien testée (no-overwrite guard couvert). Les fixes d'honnêteté sont vérifiables et exacts. **MAIS** le cluster expose un risque runtime latent **réel et cimenté** par la burial SSE (bulle assistant vide pour les messages texte-seul), non détecté ni par les tests Jest ni par le flow Maestro — exactement l'anti-pattern UFR-021. La note est plafonnée par ce risque P0-launch potentiel.

---

## ✅ Bien fait

1. **Burial SSE — suppressions complètes, zéro orphelin** (`134abe293`).
   - `sseParser.ts` (81) + `chatApi/stream.ts` (214) + `tests/sse-parser.test.ts` (139) supprimés (vérifié `ls` → "No such file").
   - `grep` global : aucun import résiduel de `sseParser` / `postMessageStream` / `PostMessageStreamParams` / `isChatStreamingEnabled`. Le seul match `StreamingAttempt` = interface locale de la stratégie LIVE `sendMessageStreaming.ts:15` (intentionnellement gardée).
   - Façade `chatApi/index.ts:27` wire correctement `sendMessageSmart({ postMessage })` (plus de `postMessageStream` injecté). tsc exit 0.

2. **Burial llama-prompt-guard — claim "never wired" VRAI** (`eda7a0b7d`, ADR-051).
   - Vérifié `buildGuardrailProvider` (`museum-backend/src/modules/chat/chat-module.ts:443-511`) ne retourne que `MicrosoftPresidioAdapter` / `LLMGuardAdapter` / `undefined`. `LlamaPromptGuardAdapter` jamais instancié.
   - `grep` backend src+tests : **zéro** référence résiduelle à `LlamaPromptGuard` / `llamaPromptGuard` / `LLAMA_PROMPT_GUARD`. Adapter (180) + test (338) + docker-compose + branche env.ts/env.types.ts supprimés. ADR-015 6-layer defense intact.

3. **Migration storage — logique no-overwrite correcte + bien testée** (`15abcc94d`, TD-AS-01).
   - `migrateStorageKey.ts:31-51` : read newKey → si non-vide return (idempotent, no overwrite) → read legacy → si vide return → setItem+removeItem. Copie opaque string (pas de re-serialize) → JSON byte-preserved. `storage.getJSON` lit via `AsyncStorage.getItem` (string layer) → migration uniforme string ET JSON, pas de double-serialization (vérifié `storage.ts:14`).
   - Test `migrateStorageKey.test.ts` couvre les 4 cas dont le **no-overwrite** (l.87-97 : newKey "fresh" préservé, legacy "stale" laissé intact, aucun setItem/removeItem) — exactement le garde anti-perte-de-données demandé.
   - 8 clés migrées (locale/museumMode/guideLevel/resumptionBanner/savedArtworks/dismissed/lastCameraView/theme). Les 2 clés API-override (`apiBaseUrl`/`apiEnvironment`) sont **cleanup-only, NON migrées** (dev override, pas data user) — décision documentée honnêtement `runtimeSettings.ts:58-59` (design §9 D-Q4). Total 10 clés touchées = claim cohérent.
   - Double-migration `runtime.defaultLocale` (runtimeSettings.ts:61 + I18nContext.tsx:58) = **safe** car `migrateStorageKey` idempotent (race-safe).
   - `conversationsStore.migrateLegacySavedSessions` (Zustand-persist) utilise un reader bespoke gated `savedSessionIds.length > 0` — CORRECT : la clé Zustand a un envelope wrappé, le reader générique l'aurait corrompue. (Note : ce fichier n'est pas dans le diff `15abcc94d`, pré-existant.)

4. **Honnêteté ADR-036 v1→v2 — EXACTE et citation résout** (`af2d31468`).
   - `llm:v1` → `llm:v2` corrigé aux 2 occurrences. Vérifié source-of-truth : `llm-cache.service.ts:14` `KEY_VERSION = 'v2'`, l.119 JSDoc `llm:v2:...`, l.152-156 `voiceMode`+`audioDescriptionMode` foldés dans le canonical hash. La citation `:119` du commit résout exactement.
   - Commit note honnêtement ce qui n'est PAS touché (ADR-055:21 historical "before" list, TD-57) — scoping correct.

5. **AiDisclosureModal purgé** (`af2d31468`). Composant renommé `AiDisclosureSheetContent.tsx` (existe), `AiDisclosureFooter.tsx` (existe). Zéro référence code live à `AiDisclosureModal` — seul résidu = note historique docstring `AiDisclosureSheetContent.tsx:21` ("Replaces the previous `<AiDisclosureModal>`"), intentionnelle. Docs AI_DISCLOSURE×3 + AUDIT×4 mis à jour.

6. **describe.skip deletion — scoping correct** (`0d0b2fda5`). 3 suites `describe.skip(...)` inconditionnelles supprimées (238 LOC). Les `shouldRunE2E ? describe : describe.skip` conditionnels (pattern valide) préservés ; le seul `describe.skip` inconditionnel restant (`prompt-injection.test.ts:86` "KNOWN BYPASSES — TODO") est un gap documenté auditable, pas du dead-on-arrival. Distinction honnête.

7. **stryker-incremental untrack** (`e49b75fe5`). 18.5MB / 397977 lignes untrackés ; `.gitignore:227` `museum-backend/reports/` couvre le path futur. Propre.

---

## ⚠️ À améliorer

1. **[CRITIQUE — P0 runtime] Bulle assistant VIDE pour messages texte-seul.**
   `features/chat/application/sendStrategies/sendMessageStreaming.ts:117`
   Le gate `if (response && (!context.streamingIdRef.current || attempt.imageUri))` ne se déclenche JAMAIS pour le texte-seul :
   - l.44 `streamingIdRef.current = streamingPlaceholderId` (truthy)
   - `sendMessageSmart` (post-burial, `send.ts:169-172`) **ignore** `onToken`/`onDone`/`onGuardrail` → `resetStreaming()` jamais appelé pendant l'await → `streamingIdRef.current` reste truthy.
   - texte-seul → `attempt.imageUri` undefined.
   - condition = `(!truthy || undefined)` = falsy → **bloc de remplissage skippé** → placeholder reste `text: ''` → bulle vide. Le texte de réponse (`response.message.text`) n'est jamais écrit dans le message.
   **Sévérité : haute, mais voir nuance ci-dessous (la burial ne l'a PAS introduit).**

2. **[Moyenne — test discipline] Aucun test ne couvre le remplissage de la bulle.**
   - `__tests__/hooks/useChatSession.test.ts:214-246` : mock `sendMessageSmart` retourne `{message:{text:'AI response'}}` mais n'asserte QUE `sendResult===true` + call args. Ne vérifie jamais `result.current.messages[assistant].text`. Faux-vert UFR-021.
   - `.maestro/chat-flow.yaml:67` Phase 5 commente "verify content appeared" mais asserte UNIQUEMENT `assertVisible: "Who painted the Mona Lisa?"` (= echo du message USER, pas la réponse assistant). Le e2e ne capte pas la bulle vide non plus.

3. **[Faible — doc staleness] Façade docstring obsolète.** `chatApi/index.ts:3` liste encore "five capability modules (`send`, `stream`, ...)" alors que `stream.ts` est supprimé → quatre modules. Wart cosmétique, non bloquant.

4. **[Faible — wart] Test référence un env var mort.** `chatApi.test.ts:425-426` set `EXPO_PUBLIC_CHAT_STREAMING='true'`. Défendable (regression-pin : prouve que le flag mort ne route plus vers le stream), mais référence un flag qui n'existe plus nulle part ailleurs.

---

## 🔧 Reste à faire

1. **Fixer la bulle vide texte-seul** (avant launch si bug confirmé en prod) : soit `sendMessageStreaming` appelle `context.resetStreaming()` avant le gate l.117, soit le gate devient `if (response && response.message.text)` indépendamment de `streamingIdRef`. **Vérifier d'abord en prod / sur device** que le symptôme se manifeste (cf. nuance verdict).
2. **Ajouter une assertion de contenu réponse** : Jest `expect(messages.find(m=>m.role==='assistant').text).toBe('AI response')` + Maestro `assertVisible` sur un fragment de la réponse (pas l'écho user). UFR-021.
3. Corriger docstring `chatApi/index.ts:3` (five→four modules).

---

## 🎯 Verdict EXPLICITE — risque bulle-vide SSE

**Le risque est CONFIRMÉ en lecture statique, AVEC une nuance d'honnêteté importante :**

- **CONFIRMÉ** : pour un message texte-seul (online, non-low-data, sans audio → stratégie `streaming` via `pickSendStrategy` l.69), le placeholder assistant `text:''` n'est jamais rempli. Le gate `sendMessageStreaming.ts:117` est falsy car `streamingIdRef.current` reste truthy (callbacks ignorés par le nouveau `sendMessageSmart`) et `imageUri` est undefined. Preuve : `send.ts:169-172` (façade always-sync ignore onDone) + `useStreamingState.ts:36-43` (`resetStreaming` seul reset de `streamingIdRef`) + `sendMessageStreaming.ts:81-83,117-118` (les 2 seuls call-sites de `resetStreaming` sont inatteignables pour texte-seul).

- **NUANCE (honnêteté UFR-013)** : ce bug n'a **PAS** été introduit par la burial. Avant `134abe293`, avec `EXPO_PUBLIC_CHAT_STREAMING` non-set (le défaut prod documenté, ADR-001), l'ancien `sendMessageSmart` faisait déjà `if (!isChatStreamingEnabled()) return deps.postMessage(params)` (`send.ts:178-179` pré-burial) — retour SYNC sans appeler `onDone`, comportement **identique**. Le bug pré-existait dès que le streaming était off. La burial l'a **cimenté** (supprimé l'échappatoire `streaming=true` qui, elle, remplissait via le path SSE l.81-108). `sendMessageStreaming.ts` lui-même n'a **pas** été modifié par la burial (diff vide vérifié). 

- **Conclusion** : risque réel à traiter, mais ce n'est pas une régression de ce cluster — c'est une dette latente que la burial a rendue inconditionnelle. À valider sur device avant de le classer P0 (possible que la réponse LIVE arrive par un autre rendu que je n'ai pas observé, mais la lecture statique pointe sans ambiguïté vers la bulle vide).

## Qualité migration storage

**Solide.** Logique no-overwrite correcte, opaque-string copy préserve JSON byte-for-byte, idempotente (race-safe pour la double-migration locale), 4 cas testés dont le garde anti-perte-données. Les clés dev-override exclues de la migration sont une décision documentée et honnête, pas un oubli. Aucune perte de données utilisateur au 1er boot post-update. **9/10** sur cet axe isolé.
