# B8b — Burial + AsyncStorage namespacing : 2e angle SÉCU / DATA / TESTS / RÉGRESSION

**Reviewer**: fresh-context senior read-only (UFR-022, aucun contexte d'un autre agent)
**Scope**: PR#299 cluster — `134abe293 0d0b2fda5 eda7a0b7d e49b75fe5 15abcc94d af2d31468`
**Branch**: `dev` @ HEAD `1fb32f5ba`
**Date**: 2026-05-25
**Méthode**: lecture diff + source live + run tests (UFR-013, tout cité path:line, exécuté)

**Verdict: 8.5/10** — cluster sain côté sécu/data. Burials honnêtes et complètes, zéro trou de guardrail, zéro perte de token/data. Deux gaps de test mineurs (best-effort error path + migration wiring de 4 consommateurs sur 5). Aucune régression sécu/data réelle introduite.

---

## 1. TD-AS-01 — Sécu / data de la migration AsyncStorage : SAFE

### 1.1 Tokens auth NON affectés — preuve

Les tokens auth vivent dans **expo-secure-store** (keychain natif), un store **totalement disjoint** d'AsyncStorage :

- `museum-frontend/features/auth/infrastructure/authTokenStore.ts:17-18` — `REFRESH_TOKEN_KEY = 'auth.refreshToken'`, `ACCESS_TOKEN_KEY = 'auth.accessToken'`.
- `authTokenStore.ts:60-64` — écriture via `secureStore.setItemAsync(key, token, { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY })` (device-bound, non-backup-migratable, TD-SEC-01).
- `authTokenStore.ts:50-53` — sur web (pas de SecureStore) fallback `storage.getItem(key)` sous la clé **`auth.*`** brute, NON renommée.

**Les 2 clés token (`auth.refreshToken`/`auth.accessToken`) ne figurent PAS dans la liste des 10 clés renommées** (theme/locale×5/resumption-banner/camera-view/saved-artworks/daily-art-dismissed). `authTokenStore.ts` n'est **pas touché par le cluster** (`git show 15abcc94d --stat` → aucune ligne auth). ⇒ **Zéro perte de token au 1er boot post-update.** `keychainAccessible` préservé (fichier intact).

### 1.2 Pas de mélange/exposition cross-user

- `storage` (`shared/infrastructure/storage.ts:1-26`) = wrapper mince pur AsyncStorage, **pas de SecureStore, pas de chiffrement**. Les 10 clés migrées sont des **préférences device-level** (thème, locale, dismiss banner, caméra, saved artworks) — même scope qu'avant le rename.
- AsyncStorage est **global par install d'app, jamais per-user** : c'était déjà le cas avant le cluster. Le logout ne purge **que les tokens** (`AuthContext` → `authStorage.clearRefreshToken()`), pas les prefs AsyncStorage — vérifié : aucun `AsyncStorage.clear()`/`multiRemove` dans le flow logout (`grep` logout → seulement `authTokenStore.clear()`).
- **Le rename ne change PAS ce comportement.** Le partage device-level de prefs entre deux users sur le même device est un état préexistant, **hors-scope du cluster, non aggravé**. Aucune nouvelle exposition introduite.

### 1.3 `migrateStorageKey` — contrat sûr, partial-failure safe

`shared/infrastructure/migrateStorageKey.ts:30-50` :
- L34-37 : si `newKey` non-null/non-vide → no-op (idempotent, **jamais d'overwrite**).
- L39-43 : si legacy absent/vide → no-op.
- L45-46 : `setItem(newKey, legacyValue)` PUIS `removeItem(legacyKey)`, **valeur copiée comme string opaque** (pas de parse/reserialize → JSON byte-for-byte, OK pour `getJSON` keys comme saved-artworks/camera).
- L47-49 : `catch {}` best-effort total.

**Analyse partial-failure (les 2 ordres possibles) :**
- `setItem` OK puis `removeItem` throw → newKey a la valeur, legacy reste. Prochain read = idempotent no-op (newKey non-vide). **Pas de perte.**
- `setItem` throw → legacy intact, newKey vide. Prochain read retente. **Pas de perte.**
⇒ Les deux chemins de panne partielle sont **safe by design**. Aucune fenêtre de perte de données.

### 1.4 Race condition same-legacy-key (`runtime.defaultLocale`) : BÉNIGNE

La MÊME clé legacy `runtime.defaultLocale` est migrée par **deux** appelants concurrents :
- `features/settings/runtimeSettings.ts:57-61` (`loadRuntimeSettings`)
- `shared/i18n/I18nContext.tsx:54-56` (mount `I18nProvider`)

Worst-case interleaving : A.get(new)=null → B.get(new)=null → A.get(legacy)='fr' → B.get(legacy)='fr' → A.set(new,'fr');A.rm(legacy) → B.set(new,'fr');B.rm(legacy). Les deux écrivent **la même valeur** (idempotent en valeur), double `removeItem` inoffensif. **Pas de corruption.** Le commentaire `I18nContext.tsx:54` ("order-safe vs runtimeSettings' migration of the same key") est exact.

---

## 2. Burial — aucun trou de sécu, aucune régression fonctionnelle introduite

### 2.1 llama-prompt-guard (`eda7a0b7d`) — VRAIMENT jamais wiré

`buildGuardrailProvider` (`museum-backend/src/modules/chat/chat-module.ts:443-515`) ne retourne **que** `MicrosoftPresidioAdapter` (L450), `LLMGuardAdapter` (L511) ou `undefined` (L457). **`LlamaPromptGuardAdapter` n'était dans aucune branche.** Sa suppression **ne peut pas créer de trou de guardrail.**

Preuve d'absence de référence résiduelle : `grep -rn llama|Llama src` → **1 seul hit**, un JSDoc *"future candidate"* dans `guardrail-provider.port.ts:4` (commentaire, pas de wiring). `grep llamaPromptGuard|LLAMA_PROMPT_GUARD src tests docker-compose*` → **0**. Les 6 couches AI-safety (ADR-015) sont intactes. Le claim du commit est **honnête**.

Réconciliations vérifiées correctes :
- `tests/unit/architecture/pr14-fetchWithTimeout-sentinel.test.ts:42` — `SWEPT_FILES` drop la clé llama supprimée, garde presidio → **2 passed** (run).
- `env.ts`/`env.types.ts:608-620` — bloc `llamaPromptGuard` retiré → `pnpm lint` (eslint + test-discipline + `tsc --noEmit`) **vert, exit 0** (run). Type-safe.

### 2.2 SSE burial (`134abe293`) + bulle-vide texte-seul (`sendMessageStreaming.ts:117`)

Post-burial : `sendMessageSmart` = `deps.postMessage(params)` direct (`chatApi/send.ts` dernière fn). Les callbacks `onToken/onDone/onGuardrail` sont **délibérément ignorés**. ⇒ Dans la stratégie LIVE `features/chat/application/sendStrategies/sendMessageStreaming.ts` (NON touchée par le cluster), `onDone` (L81-109) n'est **jamais invoqué** ; le placeholder est rempli par le **bloc fallback sync** L117-153.

**Impact bulle-vide — confirmé comme risque LATENT, PAS introduit par le cluster :**
- `sendMessageStreaming.ts:128` — `if (response.message.text)` : si le BE renvoyait `message.text === ''`, le placeholder vide (L46-54, `text:''`) **resterait vide à l'écran**.
- En pratique le contrat `isPostMessageResponseDTO` (`features/chat/domain/contracts.ts:107-110`) exige `message.text: string` ; une réponse texte normale a toujours du texte. Risque réel = réponse BE à texte vide (cas guardrail/edge).
- **Sécu** : aucune. Le guardrail reste serveur-side (chat.service.ts single source of truth). Une bulle vide est un **défaut UX**, pas une fuite. Pas de contenu non-modéré rendu.
- **Régression ?** NON — `sendMessageStreaming.ts` n'est pas modifié par le cluster ; le bloc fallback L117-153 existait déjà comme "live path" (commentaire L120 "BE today returns sync"). Le burial a juste fait du sync l'**unique** chemin. Le commentaire-invariant L125-127 documente honnêtement le contrat.

**Gap de test (réel)** : `sendMessageStreaming.ts` n'a **AUCUN test** (`find __tests__ -name '*stream*'` → seulement helpers + `useStreamingState.test.ts` qui teste le reducer, pas la stratégie). La couche `chatApi.sendMessageSmart` est bien pinnée always-sync (`chatApi.test.ts:421-470`, run vert), mais le **remplissage du placeholder via le fallback sync** (donc la bulle-vide) n'est exercé par aucun test. UFR-021 : `sendMessageStreaming` n'est pas un écran → hors scope strict du gate Maestro, mais c'est le chemin de rendu critique du chat, non couvert.

### 2.3 Suppressions `describe.skip` (`0d0b2fda5`) — PAS de perte de couverture P0

Les 3 suites supprimées étaient des `describe.skip` **littéraux** (pas de gate conditionnel), MAIS documentées comme **specs manuelles** (header `AddCriticalChatIndexesP0.spec.ts:9-20` : "Run manually... TEST_DATABASE_URL=..."). Le wording du commit "dead-on-arrival, never executed" est **imprécis** (manuelles ≠ accidentellement mortes) — nuance d'honnêteté mineure, mais la couverture effective est préservée par des équivalents LIVE :

| Supprimé | Couverture LIVE équivalente | Preuve |
|---|---|---|
| `AddCriticalChatIndexesP0.spec.ts` (idempotence up/down P0 FK index) | `tests/integration/db/migration-round-trip.test.ts:17` "every migration up→down→up cleanly" | cite `AddCriticalChatIndexesP0` + CONCURRENTLY L26-28 |
| `AddP1FKAndTokenIndexes.spec.ts` (idem P1) | idem round-trip (toutes les migrations) | `runMigrations({transaction:'none'})` |
| `art-keyword-repo-atomic-upsert.test.ts` (ON CONFLICT hitCount++) | `tests/unit/chat/artKeyword.repository.test.ts:36-82` | teste `ON CONFLICT ("keyword","locale")` + `"hitCount"+1` + normalize + no-read-modify-write |

⇒ Les 3 suppressions sont **redondantes avec des tests qui tournent réellement** (round-trip = job integration live PG ; artKeyword.repository = unit always-run). **Aucun test mort laissé, aucune perte de couverture CI réelle.** `grep 1777568348067 tests src` → seulement la migration source + le round-trip ⇒ pas de référence cassée vers un blob supprimé.

### 2.4 Artefact 18.5MB untracké (`e49b75fe5`) + docs honnêteté (`af2d31468`)

- `e49b75fe5` : `git rm --cached` de `stryker-incremental.json`, déjà couvert par `.gitignore:227`. Pas un risque sécu (build artifact, pas de secret). OK.
- `af2d31468` : docs only (ADR-036 `llm:v1`→`llm:v2`, modal rename). Hors scope sécu/data.

---

## 3. Gaps de test (à tracker, non bloquants V1)

1. **`migrateStorageKey` error-path non testé** — `migrateStorageKey.test.ts` couvre migrate/idempotent/no-op-absent/no-overwrite (4 cas, run vert) mais **0 test** sur le `catch {}` best-effort (`grep -c throw|reject|catch` = 0). Le partial-failure (setItem OK + removeItem throw) est safe-by-design mais non prouvé par test. **Sévérité : faible** (chemin défensif, analyse statique suffit).
2. **Migration wiring testé pour 1 consommateur sur 5** — seul `useDailyArt.test.ts:125-160` ajoute un vrai test carry-forward legacy→new. `runtimeSettings`/`I18nContext`/`mapCameraCache`/`useResumableSession` ont leur littéral mis à jour mais **aucun test de leur appel `migrateStorageKey`**. Le helper est testé isolément, donc le risque est faible, mais la race same-key (§1.4) et le wiring restent non-régression-testés. **Sévérité : faible-moyenne.**
3. **`sendMessageStreaming.ts` (chemin de rendu chat) non testé** — cf §2.2. Le burial a fait du fallback sync l'unique path ; ce path (et le risque bulle-vide L128) n'a aucun test. **Sévérité : moyenne** (chemin critique UX du produit core).

---

## 4. Vérifications exécutées (UFR-013)

- `npm test` (FE) → **330 suites / 3391 tests PASS** (warning worker force-exit = gotcha BullMQ/timer préexistant connu, pas une régression).
- `pnpm lint` (BE) → eslint + test-discipline + `tsc --noEmit` **exit 0**, env.ts/types.ts type-safe post-burial.
- `pnpm test --testPathPattern='pr14-fetchWithTimeout-sentinel|auth-email-...'` → **2 passed** (le "Test failed" affiché = seuil de coverage global sur run 1-fichier, pas un échec de test).
- `grep` exhaustifs : llama résiduel (1 JSDoc), token keys hors liste rename, alternative coverage des 3 deletes, race same-key.

## 5. Régressions sécu/data réelles : AUCUNE

Tokens préservés (store disjoint), aucun trou de guardrail (llama jamais wiré), aucune perte de prefs (migration carry-forward partial-failure-safe), aucune perte de couverture CI (3 deletes redondants avec tests live). Bulle-vide = défaut UX latent préexistant non aggravé sécu-wise.
