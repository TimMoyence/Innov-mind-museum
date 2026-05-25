# B1 — DRY helpers sweep (PR-1→PR-16) — Architecture & Correctness review

**Reviewer:** fresh-context senior read-only (UFR-022)
**Branch/HEAD:** `dev` @ `89852f2a1`
**Scope:** 15 cluster commits (PR-1..PR-16), backend only. Judged on FINAL file state, not diffs.

---

## Note qualité : **8.0 / 10**

**Verdict :** Cluster solide, idiomatique et hexagonal-propre ; les helpers abstraient réellement leurs call-sites avec divergences honnêtement documentées — MAIS une régression de correctness réelle dans le cost circuit-breaker (PR-13) défait le plafond budget journalier $500/jour et doit être corrigée avant merge en l'état.

---

## ✅ Bien fait

1. **Discipline d'import hexagonale impeccable** — tous les helpers vivent au bon niveau (`@shared/http`, `@shared/pagination`, `@shared/audit`, `@shared/circuit-breaker`, `@shared/db`, `@modules/auth/useCase/shared`). Zéro import relatif 4-niveaux introduit (grep négatif sur tous les fichiers du cluster). Aliases `@shared/@modules` partout.

2. **Pureté / KISS exemplaires sur les primitives** — `assertPagination` (`shared/types/pagination.ts:38-53`), `paginate` (`shared/pagination/offset-paginate.ts:23-34`), `extractEmailDomain` (`shared/pii/extractEmailDomain.ts:17-26`), `shouldEarlyRefresh` (`shared/cache/probabilistic-refresh.ts:57-68`) sont pure/sync, no-I/O, `now()`/`fetchImpl` injectés pour déterminisme. `confidenceUpsert` (`shared/db/confidence-upsert.ts:53-80`) garde la pureté + délègue find/save au caller (le bon découpage : l'identity-lookup diverge par repo).

3. **`logActorAction` sécurise par construction** — `shared/audit/audit.service.ts:159-170` force `actorType:'user'` sans override possible (exclu du type `LogActorActionInput`, PR-7 R-2), null-coerce `ip`/`requestId`, et délègue à `log()` → hérite le guard `breach_*` + swallow-on-error. Wire-hash inchangé (le hash n'inclut pas actorType/ip/requestId).

4. **`ThreeStateCircuit` — extraction FSM propre via strategy pattern** — `shared/circuit-breaker/three-state-circuit.ts` : FSM domain-agnostic, prédicat de trip pluggable (`CircuitTripStrategy`), no-I/O/no-log (l'observabilité reste dans les wrappers via `onStateChange`). Les 2 strategies (`sliding-window-failure-strategy.ts`, `cost-trip-strategy.ts`) sont pures et bien séparées. Pour le breaker **latence** la sémantique de récupération est byte-identique au legacy (legacy clearait `failures=[]` sur HALF_OPEN→CLOSED, `llm-circuit-breaker.ts` legacy:67 — la nouvelle `strategy.reset()` match).

5. **Rate-limit Lua atomique correct** — `redis-rate-limit-store.ts:16-28` : `INCR`+`PEXPIRE` atomiques, plus le garde-fou `PTTL<0 → re-PEXPIRE` (ligne 22-26) qui referme la fenêtre où une clé sans TTL persisterait indéfiniment. Fail-open vers fallback in-memory documenté. `daily-chat-limit.middleware.ts` devient un thin wrapper (169→67 LOC) — la plomberie non-atomique `CacheService get+set` est bien enterrée (UFR-016).

6. **Divergences documentées plutôt que masquées (honnêteté UFR-013)** — `support.repository.pg.ts:71-77` porte un `// paginate-skip:` explicite (subquery `COUNT(m.id)+getRawAndEntities` incompatible avec `getManyAndCount`) et le sentinel `SWEPT_FILES` l'exclut. Idem `fetch-with-timeout.ts:13-16` liste les 3 adapters qui gardent le pattern inline avec raison. Pas de fausse complétude.

---

## ⚠️ À améliorer / risques

1. **[SÉVÉRITÉ HAUTE — correctness] Le cost circuit-breaker (PR-13) défait le plafond budget JOURNALIER sur récupération HALF_OPEN.**
   - `llm-cost-circuit-breaker.ts:147-149` : sur charge saine en HALF_OPEN, appelle `this.circuit.recordOutcome('success')`.
   - `three-state-circuit.ts:130-131` : `recordOutcome('success')` en HALF_OPEN fait `transitionTo('CLOSED')` **PUIS `this.strategy.reset()`**.
   - `cost-trip-strategy.ts:63-66` : `reset()` wipe `hourlyWindow=[]` **ET `dailySpend={day:'',cents:0}`**.
   - **Legacy (pré-PR13)** : la récupération HALF_OPEN→CLOSED faisait seulement `transitionTo('CLOSED')`+`probeInFlight=false` (`git show 8504b1e8d~1:…llm-cost-circuit-breaker.ts`, branche `recordCharge`) — elle NE wipe-ait PAS le spend ; `trip()` non plus. Le `dailySpend` PERSISTAIT.
   - **Impact** : après un trip sur cap journalier ($500/j) + cooldown 5 min + 1 probe-charge saine, le compteur journalier repart à 0 → le hard-cap global peut être contourné par cycles répétés trip→cooldown→probe. Le breaker LATENCE est correct (reset des failures attendu) ; **seul le breaker COÛT régresse** car son strategy.reset() englobe le compteur journalier qui, lui, ne doit pas se vider sur recovery.
   - **Aggravant** : le test `tests/unit/chat/llm-cost-circuit-breaker.test.ts:121-135` ENTÉRINE le nouveau comportement — son commentaire dit littéralement « Use a tiny daily window so the previous trip charge does not survive the recovery ». La régression est donc figée dans les tests, pas attrapée.
   - **Contredit aussi le claim PR-13** « Public API … preserved byte-identical » (`llm-cost-circuit-breaker.ts:18-19`) : la sémantique observable du daily-cap a changé.
   - **Fix suggéré** : séparer "reset hourly window" (légitime sur recovery) de "reset daily counter" (à ne PAS faire), ou ne pas router la recovery via `strategy.reset()` pour la CostTripStrategy (override `reset` pour ne vider que la fenêtre horaire, garder le `dailySpend`).

2. **[SÉVÉRITÉ FAIBLE — doc] Le commentaire "bake-prod buckets survive the cutover" du daily-chat est inexact.**
   - `daily-chat-limit.middleware.ts:43-45` affirme que la clé Redis émise est « exactement `daily-chat:<userId>:<UTC-date>` (matches … the legacy key shape, so bake-prod buckets survive the cutover) ».
   - En réalité `RedisRateLimitStore.increment` préfixe avec `keyPrefix='ratelimit:'` (`redis-rate-limit-store.ts:34,44`) → clé finale `ratelimit:daily-chat:<id>:<date>`. Le legacy passait par `RedisCacheService.set` qui écrit la clé brute SANS préfixe (`redis-cache.service.ts:61-64`).
   - **Impact réel borné** : discontinuité mid-day une seule fois (compteur reset à minuit UTC de toute façon, pas de staging, bake prod). Pas une régression runtime — juste un commentaire faux à corriger (sinon induit en erreur un futur opérateur lors d'un debug de cap).

3. **[SÉVÉRITÉ INFO] `confidenceUpsert` backfill : `data[key] !== null` laisse passer `undefined`.**
   - `confidence-upsert.ts:72` : `if (existing[key] === null && data[key] !== null)` assignerait `undefined` si la clé est absente du `Partial`.
   - **Non-régression** : le legacy faisait le check identique (`incoming !== null`, `git show 9aff378b0~1:…typeorm-artwork-knowledge.repo.ts`). Comportement byte-fidèle au legacy ; les call-sites passent des payloads complets. Noté pour exhaustivité, pas un bug introduit par le cluster.

---

## 🔧 Reste à faire

- **Corriger la régression cost-breaker (point ⚠️1)** — c'est le seul vrai blocker correctness du cluster. Implique aussi de ré-écrire le test `llm-cost-circuit-breaker.test.ts:121-135` pour ASSERTER que `dailySpend` persiste à travers une recovery HALF_OPEN (test qui DOIT fail aujourd'hui = preuve de la régression).
- **Corriger le commentaire `daily-chat-limit.middleware.ts:43-45`** — soit retirer la claim "survive the cutover", soit aligner les préfixes si la continuité est vraiment voulue (peu probable de la vouloir vu reset minuit).
- Helpers eux-mêmes : aucun call-site oublié significatif. Sweep `requireUser` au-delà des 7 chat annoncés (12 fichiers : chat+auth+review adoptés) — bonus, pas un défaut. `assertPagination`/`paginate`/`unauthorized`/`notFound`/`formatZodIssues`/`extractEmailDomain`/`single-use-email-token`/`assertPasswordReauth` : abstraction complète, divergences restantes toutes documentées.

---

### Mergeable ?
**À retoucher** avant merge : 1 blocker correctness (cost-breaker daily-cap defeat) + 1 commentaire faux. Tout le reste est mergeable en l'état et de bonne qualité.
