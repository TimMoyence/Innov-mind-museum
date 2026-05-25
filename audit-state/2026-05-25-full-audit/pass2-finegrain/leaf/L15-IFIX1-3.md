# L15 — I-FIX1 / I-FIX2 / I-FIX3 (P0.I.D Correctness/coût)

**Audit READ-ONLY fresh-context (UFR-022).** Tree: `dev` @ HEAD `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`.
Principe : re-dérivé from scratch, confirmé par le code (path:line). Aucune confiance aux marqueurs antérieurs.

---

## I-FIX1 — Cache invalidation `invalidateMuseum` namespace `llm:v2:museum-mode:`

**VERDICT : ✅ CONFIRMÉ (DONE-DEV, présent à HEAD).**

Le bouton admin "purge museum cache" délègue au bon namespace v2.

- `museum-backend/src/modules/admin/adapters/primary/http/routes/cache-purge.route.ts:35` — `new LlmCacheServiceImpl(cache)` construit dans le composition-root du router à partir du `CacheService` injecté.
- `cache-purge.route.ts:60` — `await llmCacheService.invalidateMuseum(museumIdInt)` (route `POST /museums/:id/cache/purge`, gated `isAuthenticated`+`requireRole('admin')`).
- `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:93-110` — `invalidateMuseum` itère `['museum-mode','personalized']` et appelle `delByPrefix` sur `${KEY_PREFIX}:${KEY_VERSION}:${ctxClass}:${museumId}:` ⇒ purge **`llm:v2:museum-mode:{id}:`** ET **`llm:v2:personalized:{id}:`** (`:96-100`).
- Layout de clé cohérent : `buildKey` (`:126-131`) produit `llm:v2:{ctxClass}:{museumId}:{userId}:{hash}` — museumId AVANT userId ⇒ `delByPrefix` cross-user fonctionne.
- Le router est monté : `museum-backend/src/shared/routers/api.router.ts:394` `router.use('/admin', createCachePurgeRouter(resolvedCache))`.
- Validation defence-in-depth `museumId` entier positif (`cache-purge.route.ts:49-56`) évite `delByPrefix('llm:v2:museum-mode:NaN:')`.
- Dead-code résolu (UFR-016) : `invalidateMuseum` a maintenant un caller réel.
- Ancien namespace cassé `chat:llm:{museumId}:` : aucune occurrence en code source de prod (seulement commentaires historiques + `chat:llm:popular:` qui est un usage ztop distinct dans `low-data-pack.service.ts:40`, sans rapport).
- Tests : `tests/integration/admin/cache-purge.namespace.test.ts` (R-IFIX1a regression guard que `chat:llm:42:` n'est JAMAIS appelé, `:222-239`), `tests/unit/routes/cache-purge.route.test.ts:42-53` (2 delByPrefix attendus).

**Divergence vs roadmap** : roadmap cite `cache-purge.route.ts:31` pour le call ; le call réel est `:60` (`:31` = ligne de commentaire JSDoc). Cite aussi `llm-cache.service.ts:93` (= signature `invalidateMuseum`, correct). Anchors quasi-corrects, mécanisme conforme. **AUCUNE divergence fonctionnelle.**

**Debt** : néant.

---

## I-FIX2 — Cross-artwork cache key inclut `currentArtworkKey`

**VERDICT : ✅ CONFIRMÉ (DONE-DEV, présent à HEAD).** 2 œuvres = clés distinctes.

- `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:164-166` — `if (input.currentArtworkKey) { canonical.currentArtworkKey = input.currentArtworkKey; }` ⇒ folded dans le JSON canonique haché (`sha256OfCanonicalInput`).
- Truthy-only emit (`:164`) : `undefined`/`''` ⇒ champ exclu ⇒ hash byte-identique aux entrées legacy pré-I-FIX2 (pas de bump KEY_VERSION nécessaire, contrat mirroir imageContentHash R8/AC6).
- `LlmCacheKeyInput.currentArtworkKey?: string` déclaré : `museum-backend/src/modules/chat/useCase/llm/llm-cache.types.ts:45`.
- Câblage call-site (lookup ET store via le même builder) : `museum-backend/src/modules/chat/useCase/message/chat-message.service.ts:464` — `currentArtworkKey: prep.session.currentArtworkId ?? prep.currentArtwork?.title ?? undefined`.
  - `buildLlmCacheInput` (`:427-466`) consommé par `tryLlmCacheLookup` (`:322`) ET `tryLlmCacheStore` (`:350`) ET `computeKey` stamping (`:328`,`:356`) ⇒ dérivation pure unique, lookup/store cohérents.
- Le `[CURRENT ARTWORK]` est bien rendu dans le system prompt : `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:75` `return \`[CURRENT ARTWORK]\ntitle: ${sanitisedTitle}${roomLine}\n[END OF CURRENT ARTWORK]\``. Le bug original (titre dans le prompt mais pas dans la clé) est donc fermé : 2 visiteurs même musée / même prompt / œuvres distinctes ⇒ `currentArtworkId` (UUID) ou titre distinct ⇒ hash distinct.
- Tests : `tests/unit/chat/llm-cache.service.artwork-key.test.ts` (Test1 deux inputs ne différant QUE par currentArtworkKey ⇒ clés différentes `:143`; Test2 undefined ⇒ hash byte-identique legacy `:156`; Test3 `''` ⇒ identique undefined `:173`).

**Divergence vs roadmap (mineure, NON bloquante)** :
1. Anchors roadmap : `llm-cache.service.ts:164-165` (✅ exact) + `chat-message.service.ts:328`. Le `:328` est le stamping `computeKey` (correct mais c'est `:464` qui SET le champ ; `:328`/`:356` le réutilisent). Anchor légèrement imprécis, pas faux.
2. **Lacune de partition `roomId`** : le system prompt rend `title` ET `roomId` (`llm-prompt-builder.ts:75`), mais `currentArtworkKey` ne folde que `currentArtworkId ?? title` — **pas `roomId`**. Cas-bord théorique : même artworkId/titre rendu avec un `roomId` différent ⇒ prompts différents mais clé identique. En pratique inoffensif (un même `currentArtworkId` implique normalement un même room ; et la priorité va à l'UUID stable). Le claim principal (« 2 œuvres = clés distinctes ») reste VRAI.

**Debt** : edge `roomId` non-folded = TD-LOW potentiel (cohérence prompt↔clé). Non-bloquant V1.

---

## I-FIX3 — STT/TTS metering + cap fan-out + anon bypass + judge fail-OPEN

**VERDICT : ❌ CONFIRMÉ NON-FIXÉ à HEAD** (roadmap ❌ correct). Les 4 sous-claims décrivent l'état réel du code à `1fb32f5ba`.

> **Note honnêteté (UFR-013)** : un commit `34bf280fc` "fix(P0): lot stabilité & observabilité + I-SEC8 (9 items) (#300)" titre explicitement « I-FIX3 (cost-guard fan-out metering + judge degrade telemetry) » et modifie `llm-judge-guardrail.ts` (+100), `llm-cost-guard.ts` (+24), `llm-cost-guard.middleware.ts` (+78). **MAIS `git merge-base --is-ancestor 34bf280fc HEAD` ⇒ NON-ancêtre.** La remédiation I-FIX3 n'est donc PAS sur l'arbre audité. Tout ci-dessous reflète l'état pré-fix présent à HEAD.

### Sous-claim 1 — « STT/TTS totalement non-métrés (zéro cost recording) »
**⚠️ PARTIELLEMENT INFIRMÉ / STALE.**
- VRAI : STT et TTS ne touchent JAMAIS le `LlmCostGuard` counter. `counter.increment` n'est appelé que depuis `LlmCostGuard.assertAllowed` (`museum-backend/src/shared/llm-cost-guard/llm-cost-guard.ts:136`), lui-même appelé uniquement par le middleware (`llm-cost-guard.middleware.ts:70`). Aucun call STT/TTS contre le cap.
- FAUX (« zéro cost recording ») : les DEUX émettent des Langfuse `generation` d'attribution coût (TD-20) :
  - TTS : `text-to-speech.openai.ts:107-108` `usage: { input: text.length, unit: 'CHARACTERS' }` + `usageDetails`.
  - STT : `audio-transcriber.openai.ts:230-240` `stt.transcribe.generation`, `usage: { input: byteLength }`, `unit: 'BYTES'`.
- **Formulation exacte** : STT/TTS ne sont **pas comptés contre le cap coût** (`LlmCostGuard`), mais ont bien un **cost recording observability** (Langfuse). Le « zéro cost recording » de la roadmap est obsolète post-TD-20.

### Sous-claim 2 — « cap = $0.002 fixe/requête HTTP (pas par call fan-out) »
**✅ CONFIRMÉ (mécanique), avec correction de chiffre.**
- Le middleware charge UN flat `FLAT_COST_PER_CALL_USD = 0.002` (`llm-cost-guard.middleware.ts:14`) une seule fois par requête HTTP (`:70` `assertAllowed(userId, FLAT_COST_PER_CALL_USD)`), monté en amont des routes (chat-message `:190`, chat-describe `:40`, chat-media audio `:248` + TTS `:277`).
- Fan-out réel non-compté : ex `/sessions/:id/audio` (`chat-media.route.ts:242`) ⇒ `postAudioMessage` fait STT puis `postMessage` (LLM orchestrator) + éventuellement le judge — tout pour 1 seul $0.002.
- **Correction de chiffre (divergence roadmap)** : le **CAP** per-user n'est PAS $0.002 — c'est `userDailyCapUsd` default **$0.5/jour** (`museum-backend/src/config/env.ts:188`, `OPENAI_USER_DAILY_USD_CAP` def 0.5). Le $0.002 est le **montant consommé PAR requête** contre ce cap (~250 req/j/user avant blocage). La roadmap conflate « charge par appel » et « cap ». La SUBSTANCE (charge flat per-HTTP-request, jamais multipliée par le fan-out) est exacte.

### Sous-claim 3 — « anon bypass le cap per-user »
**✅ CONFIRMÉ.**
- `llm-cost-guard.ts:103-105` — `if (userId === null) { return; }` AVANT toute lecture compteur ⇒ les requêtes anonymes ne sont jamais soumises au cap per-user (kill-switch s'applique encore, `:94-101`).
- Le middleware résout `userId = req.user?.id !== undefined ? String(...) : null` (`llm-cost-guard.middleware.ts:67`) ⇒ tout call non-authentifié = `null` = bypass.
- Documenté comme volontaire (« HTTP rate-limit enforces volume ») mais c'est bien le comportement décrit par la roadmap.

### Sous-claim 4 — « judge $5/jour s'épuise puis fail-OPEN (régression sécu) »
**✅ CONFIRMÉ (mécanique + montant). MAU exact non-dérivable.**
- Cap = `budgetCentsPerDay` default **500 cents = $5.00** (`env.ts:407`, `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY` def 500). ✅ $5/jour.
- Coût/call judge = `ESTIMATED_COST_CENTS_PER_CALL = 1` cent (`llm-judge-guardrail.ts:88`) ⇒ épuisement à **500 invocations judge/jour**.
- Épuisement ⇒ fail-OPEN : `getBudgetExhausted()` (`guardrail-budget.ts:196-201`, `cumulative >= cap`) ⇒ `judgeWithLlm` retourne `null` (`llm-judge-guardrail.ts:117-122`) ⇒ port adapter mappe `null → { decision:'review', confidence:0 }` (`:261-262`) ⇒ caller retombe sur la décision keyword V1. Comme le judge ne tourne QUE sur des « uncertain allows » V1, le message passe sans la couche judge. ⇒ la défense LLM-judge s'éteint silencieusement une fois le budget brûlé = **régression sécu déguisée en cap coût**. Confirmé.
- **Chiffre « ~1100 MAU » NON vérifiable depuis le code** : c'est une extrapolation (calls-judge/MAU) non dérivable des constantes. Le MÉCANISME (500 calls/j ⇒ exhaust ⇒ fail-OPEN) est confirmé ; le « 1100 MAU » est une estimation à traiter comme supposée, pas vérifiée.

**Debt I-FIX3 (présent à HEAD)** : (a) STT/TTS hors du cap coût ; (b) cap per-HTTP-request flat $0.002 ⇒ fan-out (STT+LLM+TTS+judge) sous-facturé ; (c) anon non-cappé ; (d) judge fail-OPEN à budget épuisé sans alerting de dégradation sécu. Remédiation existe sur `34bf280fc`/#300 mais **non mergée vers HEAD** ⇒ à merger ou re-traiter.

---

## Synthèse anchors vérifiés
| Item | Roadmap anchor | Réalité | Statut |
|---|---|---|---|
| I-FIX1 | `llm-cache.service.ts:93` + `cache-purge.route.ts:31` | `:93` ok (sig), call réel `:60` (`:31`=JSDoc) | ✅ fonctionnel |
| I-FIX2 | `llm-cache.service.ts:164` + `chat-message.service.ts:328` | `:164` ok, set du champ `:464` (`:328`=stamping) | ✅ fonctionnel |
| I-FIX3 | `llm-cost-guard.ts` + `text-to-speech.openai.ts` | état pré-fix présent à HEAD ; remédiation `34bf280fc` non-ancêtre | ❌ non-fixé (roadmap ❌ correct) |
