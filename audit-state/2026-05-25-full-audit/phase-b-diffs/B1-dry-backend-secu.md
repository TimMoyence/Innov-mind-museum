# B1 — DRY helpers sweep (PR-1..PR-16) — angle SÉCURITÉ / TESTS / HONNÊTETÉ / PERF

Reviewer fresh-context UFR-022. Branche `dev` @ `89852f2a1`. État FINAL des fichiers lu (pas seulement diff).

## Note qualité : **8.5 / 10**

**Verdict** : cluster DRY solide et sécuritairement sain — les helpers authz/PII/token/rate-limit ferment correctement leurs contrats et la replay-protection est réelle ; les seules réserves sont des trous de *test* (atomicité Lua non exécutée, atomicité "concurrente" testée via mock) et 2 micro-incohérences de sweep, aucune n'ouvrant de bypass exploitable.

---

## ✅ Bien fait

- **Replay single-use token (PR-15) réellement étanche.** Chaque consume est un `UPDATE … SET token cols = () => 'NULL' WHERE token = :h AND expiry > NOW() RETURNING *` atomique : `user.repository.pg.ts:85` (reset), `:115` (verifyEmail), `:163` (emailChange). Replay → 0 row → `null` → `badRequest`. Le `() => 'NULL'` (pas `undefined`) est correct vs le gotcha TypeORM `.set({undefined})`. Helper `single-use-email-token.ts` = hash-only pur (sha256), aucune logique de single-use déléguée — bonne séparation.
- **`assertPasswordReauth` (PR-9) ferme l'authz aux 3 call-sites** (changeEmail/changePassword/disableMfa) avec matrice d'erreur correcte (`single-use-email-token.ts` / `assertPasswordReauth.ts:30-55`) : 404 not-found, 400 social-only **avant** tout `bcrypt.compare` (fast-fail prouvé par test `not.toHaveBeenCalled`), 401 sur mismatch. Test exerce la VRAIE logique : `assertPasswordReauth.test.ts` utilise `requireActual('bcrypt')` et ne mocke que `compare`.
- **`extractEmailDomain` (PR-12) ne leak aucune PII résiduelle.** `slice(lastIndexOf('@')+1).toLowerCase()` → jamais le local-part ; fallback `'unknown'`. Sweep COMPLET : `grep '.split("@")'` sur tout `src/` = 0 résidu. Tous les call-sites log/audit passent par le helper ; `brevo-...notifier.ts:38 email: payload.email` est le **body API Brevo** (légitime), pas un log.
- **Lua rate-limit (PR-11) atomique par construction.** `INCR_EXPIRE_LUA` (`redis-rate-limit-store.ts:16-28`) = `INCR` + `PEXPIRE` (si count==1) + re-arm si `PTTL<0`, en UN seul `eval` → pas de TOCTOU INCR/EXPIRE inter-instances. Fail-CLOSED en prod (503 `RATE_LIMIT_UNAVAILABLE`), fail-open mémoire en dev (`rate-limit.middleware.ts:136-160`). `failClosed` snapshotté sync à l'entrée (commentaire `:88-93`) — évite un vrai TOCTOU env/catch.
- **`assertPagination` (PR-5) borne le DoS large-limit.** `pagination.ts:48` : `limit` doit être entier ∈ [1, maxLimit=100]. `paginate` (`offset-paginate.ts`) reçoit toujours du validé : les 7 use-cases appellent `assertPagination` puis re-construisent `{page,limit}` validé avant de descendre au repo (`listUsers.useCase.ts:11,19`). Pas de validation décorative.
- **`requireUser` (PR-2) adopté aux sites swept** : `chat-session.route.ts:71,123`, `explanation.controller.ts` (re-check défensif = vrai garde 401, pas commentaire mort).
- **CHANGELOG riche + tests sentinelles par PR** (pr3..pr16 *-sentinel.test.ts) qui interdisent la régression (ré-inlining). Bonne discipline anti-dead-DRY.

## ⚠️ Risques sécu / tests

- **[TEST — MOYEN] Atomicité Lua jamais exécutée par un test.** `redis-rate-limit-store.test.ts:24` stub `eval: jest.fn(async () => [1,60_000])` — le **script `INCR_EXPIRE_LUA` n'est jamais run**. Les tests valident *les args passés à eval* + *le parsing du retour*, pas la correction du script (branche count==1→PEXPIRE, branche `pttl<0`→re-arm, atomicité). L'atomicité est vraie *par construction* (Redis exécute Lua atomiquement), mais la claim CHANGELOG « R4 atomic guarantee » n'est validée que par argument, pas par exécution. Aucun test integration ne touche un vrai Redis. *Reste : ajouter 1 test integration (ioredis-mock ou container) exerçant le script réel sur les 3 branches.*
- **[TEST — MOYEN] Le test "concurrent atomic" (PR-11) ne peut PAS révéler une race.** `daily-chat-limit.test.ts:355` « N=limit+5 concurrent → exactly limit allowed » utilise un mock `increment` à compteur JS séquentiel (`:69-100`) — pas de concurrence réelle, donc prouve seulement que le *middleware* compte juste *si* le store est atomique, jamais que le store l'est. Le titre du test sur-vend ("R4 atomic guarantee"). Pas un bug, mais fausse confiance.
- **[HONNÊTETÉ — FAIBLE] Message de commit PR-1 trompeur : « sweep 6 locales ».** Il ne s'agit PAS de 6 fichiers i18n mais de **6 call-sites** (authenticated.middleware, apiKey.middleware, 4 auth session services). Le corps du commit le clarifie. Wording prêtant à confusion, pas une fabrication.
- **[DEAD-DRY — FAIBLE] PR-2 « requireUser ×7 sites chat/ » incomplet vs le module.** `chat-compare.route.ts:152` lit `const ownerId = req.user?.id` brut (non swept, hors stat du commit) puis passe `ownerId` possiblement `undefined` à `verifySessionAccess`. Pas un bypass (l'ownership est revalidé downstream + `isAuthenticated` upstream), mais le sweep "chat/" laisse un site authz non migré. *Reste : migrer ou documenter l'exclusion.*
- **[DEAD-DRY — FAIBLE] Helper parallèle non consolidé.** `chat-route.helpers.ts:241 getRequestUser(req) → return req.user` est un quasi-doublon de `requireUser` SANS le garde 401 (contrat différent : retourne `undefined` vs throw). Exactement le type de duplication que le sweep cible, laissé en place.
- **[PERF — FAIBLE] `assertPagination` ne borne pas `page` par le haut.** `pagination.ts:45` accepte tout entier ≥1 → `page=1e9` ⇒ OFFSET énorme ⇒ scan lent. Endpoints admin only (auth-gated), faible exposition. Acceptable pour V1.
- **[PERF — FAIBLE] `createBackgroundRefresh` (PR-10) sans single-flight.** `probabilistic-refresh.ts:121` est fire-and-forget sans verrou in-flight : 2 requêtes franchissant le seuil dans la même fenêtre lancent 2 `refresh()` concurrents. Le roll probabiliste *réduit* mais n'*élimine* pas le thundering-herd. Le commentaire dit honnêtement « smooths » (pas « eliminates »). Trade-off standard XFetch, acceptable.

## 🔧 Reste à faire

1. **(MOYEN)** Ajouter un test exécutant le **vrai `INCR_EXPIRE_LUA`** (ioredis-mock supportant `eval`, ou container Redis) couvrant : 1er hit→PEXPIRE, hits N>1→PTTL conservé, `PTTL<0`→re-arm. Sinon l'atomicité reste affirmée mais non testée.
2. **(FAIBLE)** Migrer `chat-compare.route.ts:152` vers `requireUser` OU ajouter une note d'exclusion explicite (cohérence de la claim « sites chat/ »).
3. **(FAIBLE)** Consolider/retirer `getRequestUser` (`chat-route.helpers.ts:241`) ou documenter pourquoi il coexiste avec `requireUser`.
4. **(FAIBLE)** Renommer/qualifier le test `daily-chat-limit.test.ts:355` ("concurrent") pour ne pas laisser entendre qu'il prouve l'atomicité du store.
5. **(OPTIONNEL)** Borne supérieure soft sur `page` dans `assertPagination` (ex maxPage ou keyset au-delà d'un seuil) si un endpoint paginé devient public.

---
*Sources vérifiées par Read/Grep. Aucun `pnpm test` lancé (jugement présence/qualité via lecture, conformément au brief).* 
*Aucun vrai trou de sécurité exploitable trouvé : replay-protection, authz, PII, fail-closed sont corrects. Les réserves sont des trous de TEST (atomicité non exécutée) et de complétude de sweep, non des bypass.*
