# B3 — Chat frontend cluster (2026-05-23 → 25) · ANGLE ARCHITECTURE & CORRECTNESS

Reviewer: senior read-only fresh-context (UFR-022). Branche `dev` @ HEAD `89852f2a1`.
Méthode UFR-013 : claims prouvés par lecture + repro Jest exécuté (résultat verbatim ci-dessous).

Commits jugés : `c6bf75e8e` (Composer crash fix) · `68e620648` (leading-column + outside-tap dismiss) · `134abe293` (bury SSE + sendMessageSmart always-sync) · `f94291d4e` (C1 hexagonal).

---

## Note : **5/10** · Verdict : **CHANGES_REQUESTED**

Architecture state-machine + hexagonal layering = excellent (9/10 sur ces deux axes isolés). Mais la **correctness du flux principal de chat est cassée** par la burial SSE : un message texte-seul rend une bulle assistant **vide** en prod. C'est le path le plus courant de l'app. Repro Jest exécuté ci-dessous. Le cluster ne peut pas être noté haut tant que ce P0 n'est pas corrigé.

---

## ✅ Bien fait

- **bottom-sheet-router state-machine** — reducer pur exhaustif (`bottomSheetMachine.ts:63-203`), invariants R1/R2/R6/R11/R12/R14 documentés et corrects ; `never`-exhaustiveness check (`:198-201`). Store `useSyncExternalStore` propre, side-effects (close listeners, trigger capture a11y) hors reducer (`bottomSheetStore.ts`). Séparation reducer/animation/host nette.
- **Doctrine `feedback_state_machine_react_key` RESPECTÉE** — `key={state.route}` présent (`BottomSheetRouter.tsx:155`) avec commentaire citant explicitement bug_010 chained-replace. Le remount force le re-fire de l'entrance `useEffect([])` du Container → pas de wedge `opening(queued)`. Exactement le fix attendu.
- **CTA_CLOSE vs CLOSE séparation** (`bottomSheetMachine.ts:43`, `BottomSheetRouter.tsx:116-134`) — résout proprement le bug "Accepter tout ne fonctionne pas" : backdrop/swipe/back = CLOSE (gaté par `blocking`), CTA in-sheet = CTA_CLOSE (bypass). Solide.
- **Composer crash fix robuste** (`Composer.tsx`) — retour à JSX `<View>/<Pressable>` standard, suppression totale du `createElement('View')` string qui levait "View config getter ... must be a function". Plus de double-a11y bag. Le message de commit `c6bf75e8e` est honnête sur la root cause (test red imposait une shape forçant le hack).
- **Hexagonal C1 (f94291d4e)** — migration propre vers `infrastructure/` : `consentApi.ts` (transport), `consentStorageService.ts` (AsyncStorage namespacé per-userId, GDPR Art.7), `consentScopes.ts` (pure-data domain). Sentinel anti-drift `__tests__/architecture/no-shared-api-import-outside-infra.test.ts` walke `features/**`, exclut `infrastructure/`, whitelist composition-roots (AuthContext/PaywallProvider). Enforcement post-merge réel, pas juste audit-window.
- **Audit-chain consent séquentiel** (`useAiConsent.ts:68-76`) — `for...of scopes` avec `await consentApi.grant(scope)` un-par-un, zero `Promise.all`. Conforme Apple 5.1.2(i) / hash-chain ordering. `consentApi.grant` n'expose qu'une signature single-scope (`consentApi.ts:70`) → batching structurellement impossible.
- **Doctrine `feedback_closure_cell_cancellation` RESPECTÉE** sur le hook le plus fetch-heavy — `useSessionLoader.ts:9-87` implémente `CancellationTick` (TD-REACT-01) : tick capturé par invocation, `cancelled=true` sur unmount/sessionId-change/reload, guard sur chaque setState post-await ; Sentry + cache hydration inconditionnels (correct : observability indépendante du binding UI).

---

## ⚠️ À améliorer

### 🔴 [P0 / CRITICAL — bug shippable] Message texte-seul → bulle assistant VIDE
`features/chat/application/sendStrategies/sendMessageStreaming.ts:117`

Depuis la burial SSE (`134abe293`), `sendMessageSmart` est always-sync et **ignore** les callbacks `onToken`/`onDone`/`onGuardrail` (`chatApi/send.ts:158-172` : `async (params) => deps.postMessage(params)`). Mais `sendMessageStreaming.ts` n'a **PAS** été touché par la burial (`git show 134abe293 -- .../sendMessageStreaming.ts` = vide) et garde sa logique dual-path pré-burial.

Conséquence : le path primaire de remplacement du placeholder (`onDone`, lignes 81-109) est **mort** (jamais appelé). Le fallback (ligne 117) est gaté :
```
if (response && (!context.streamingIdRef.current || attempt.imageUri))
```
Pour un texte-seul : `streamingIdRef.current` est set ligne 44 et **jamais reset** (onDone ne fire pas) → truthy → `!truthy` = false ; `attempt.imageUri` = undefined → condition **false** → fallback SKIPPÉ → le placeholder garde `text: ''`.

**Repro Jest exécuté (HEAD 89852f2a1), résultat verbatim :**
```
RESULT true ASSISTANT_TEXT= "" COUNT 2
```
(send texte-seul, mock sendMessageSmart = exactement le comportement prod : DTO résolu, zero callback → la bulle assistant a `text: ""`).

Routing confirmé : `pickSendStrategy` renvoie `'streaming'` pour tout texte online (`chatSessionStrategies.pure.ts:69`) ; même la stratégie `cache` retombe sur streaming au miss (`useChatSession.ts:220`). C'est le chemin le plus courant de l'app.

Fix : adapter `sendMessageStreaming.ts` au monde always-sync (le placeholder vide n'a plus de raison d'être, OU le fallback doit remplacer le placeholder dès qu'une `response` arrive, indépendamment de `streamingIdRef`/`imageUri`). Le mieux : supprimer le placeholder de streaming et les callbacks morts puisque le streaming est enterré (UFR-016).

### 🟠 [MEDIUM] Test à fausse confiance masque le P0 ci-dessus
`__tests__/hooks/useChatSession.test.ts:773-812` ("invokes onToken and onDone to build assistant message")

Ce test **simule manuellement** `params.onToken(...)` + `params.onDone(...)` dans le mock (`:784-790`), alors que la prod ne les appelle JAMAIS. Il teste un code path mort → vert trompeur. Le seul autre test asservissant le texte de réponse (`:723-768`) passe via `imageUri` truthy (branche fallback ouverte). **Aucun test ne couvre le texte-seul always-sync.** Suite entière verte (36/36) malgré la bulle vide — exactement le piège UFR-021 ("tests Jest mockaient l'interaction qui casse → vert → régression TestFlight").

### 🟡 [LOW] Branches mortes / commentaire stale dans le flux always-sync
`sendMessageStreaming.ts:81-114` (callback `onDone` + `onGuardrail` jamais invoqués) · `:22` docstring "Streaming strategy — SSE path via sendMessageSmart" est faux (SSE enterré) · `:125-127` commentaire invariant "when SSE streaming completes via onDone" décrit un path mort. `sendStrategy.types.ts:82-87` (streamTextRef/scheduleFlush/flushStreamText/resetStreaming) + `useStreamingState.ts` entier = infra de streaming désormais inutile sur ce path. UFR-016 : enterrer.

### 🟡 [LOW] `useAiConsent` mount effect sans cancellation
`features/chat/application/useAiConsent.ts:45-59` — `consentStorageService.readAccepted().then(setShowAiConsent).finally(setConsentResolved)` sans flag de cancellation (contrairement à `useSessionLoader`). Unmount avant résolution → setState sur composant démonté (warning RN, pas de crash). Faible churn (hook vit le temps de la session chat) mais déroge à `feedback_closure_cell_cancellation`. `recheckConsent` (`:82-91`) idem.

---

## 🔧 Reste à faire

1. **[P0] Corriger `sendMessageStreaming.ts:117`** pour que le texte-seul always-sync remplace bien le placeholder par `response.message.text`. Préférer : supprimer placeholder vide + callbacks/refs de streaming morts (alignement burial UFR-016).
2. **[P0-test] Ajouter un test** asservissant que `sendMessage({text})` (sans imageUri, mock sendMessageSmart = DTO sans callbacks) produit une bulle assistant avec le texte de réponse. Sans ça la régression reviendra. Idéalement un Maestro flow happy-path chat (UFR-021).
3. **[MEDIUM] Retirer/réécrire** le test `:773-812` qui simule onToken/onDone (path mort) — il donne une fausse confiance.
4. **[LOW] Enterrer** les branches/refs/docstrings de streaming résiduelles (sendMessageStreaming, sendStrategy.types, useStreamingState).
5. **[LOW] Ajouter** un closure-cell guard à `useAiConsent` mount effect + recheckConsent.

---

### Périmètre vérifié (lu intégralement)
bottom-sheet-router/* (6 fichiers) · sendStrategies/{index,types,shared,sendMessageStreaming}.ts · chatApi/{index,send,_internals}.ts · useChatSession.ts · useSessionLoader.ts · useStreamingState.ts · chatSessionStrategies.pure.ts · Composer.tsx · useAiConsent.ts · consent{Api,StorageService,Scopes}.ts · sentinel architecture test · diffs des 4 commits.
Repro Jest dead-branch écrit, exécuté (FAIL confirme bug), supprimé.
