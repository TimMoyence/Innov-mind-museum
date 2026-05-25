# L18 — I-OPS1 / I-OPS2 / I-OPS3 (Stabilité KR3) — Audit fresh-context READ-ONLY

- **Branche / HEAD audité** : `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`
- **Date** : 2026-05-25
- **Principe** : aucun marqueur roadmap / `.md` de closure pré-existant n'est pris pour argent comptant. Tout re-dérivé via `Read`/`Grep`/`git`.

---

## ⚠️ STATUT GLOBAL — `LOT-P0-STABILITY-CLOSURE.md` = CLAIM CREUX (code NON sur dev)

Le fichier `audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md` prétend I-OPS2/3 (+ I-OPS4/6/7/8, I-FIX3, I-SEC8, TD-OP-01) fixés sur branche `p0/stability` (worktree `wt-p0-stability`), via 4 commits.

**Vérification git (re-dérivée from scratch) :**

| Commit claim | Existe (object store) ? | Ancêtre de `dev` HEAD ? | `git branch --contains` |
|---|---|---|---|
| `a3f717cfc` (I-SEC8) | OUI | **NON** | `<NONE — orphan>` |
| `e206b453d` (I-FIX3) | OUI | **NON** | `<NONE — orphan>` |
| `f29521e23` (I-OPS4/6/7, TD-OP-01) | OUI | **NON** | `<NONE — orphan>` |
| `83feb1f0b` (I-OPS2/3/8) | OUI | **NON** | `<NONE — orphan>` |

- Branche `p0/stability` : **introuvable** (locale + remote). Worktree supprimé → commits = objets dangling, contenus dans **AUCUN ref**.
- Preuves de l'absence sur l'arbre `dev` (cf. items ci-dessous) :
  - `infra/grafana/alerting/api-health.yml` (claim créé par `83feb1f0b`) → **n'existe pas**.
  - `museum-backend/deploy/Dockerfile.prod:101` CMD = toujours le double-run (claim : « app-only ») → **inchangé**.
  - Routing severity Alertmanager `telegram-ops-critical`/`-warning` (claim) → **absent**, single receiver `telegram-ops`.
  - `assertPgVectorAvailable` dans `run-migrations.ts` (claim I-OPS6) → **absent**.

**VERDICT closure** : **CLAIM CREUX.** Le travail a réellement été codé (commits valides, sujets cohérents) mais **jamais mergé sur `dev`** ; il vit en objets orphelins d'un worktree disparu. Pour V1 (qui ship depuis `dev`/`main`), I-OPS2/3 sont **NON RÉSOLUS**. La roadmap `docs/ROADMAP_PRODUCT.md:87` dit déjà vrai (« AUCUN code sur dev … LOT 4 reste NON DÉMARRÉ ») — confirmé.

> Note honnêteté : le LOT 1 sécurité (#293) / LOT 2 GDPR (#294) / LOT 3 feature-gates (#295) référencés ailleurs dans la roadmap SONT bien mergés (PRs), mais c'est hors périmètre L18. Seul LOT 4 stabilité (dont OPS2/3) est l'orphelin.

---

## I-OPS1 — Sentry release/dist mobile

**Finding roadmap (`docs/ROADMAP_PRODUCT.md:243`)** : `Sentry.init` RN sans `release`/`dist` + `ci-cd-mobile.yml` zéro Sentry → KR3 crash-free non-attribuable au build. Marqueur ligne 243 = ◇. Mais réconciliation ligne 71 le re-marque « conforme (doc pessimiste — RN mappe release/dist auto) ».

**Vérifié :**
- `museum-frontend/shared/observability/sentry-init.ts:33-48` — `initSentry()` : `dsn`, `enabled`, `environment`, `tracesSampleRate: 0.2`, `tracePropagationTargets`, integrations, `sendDefaultPii:false`, scrubbers. **AUCUN `release` ni `dist` explicite.** (confirmé, lecture intégrale du fichier 49 lignes).
- `.github/workflows/ci-cd-mobile.yml` — **ZÉRO occurrence** `sentry|sourcemap|sentry-cli|@sentry` (grep -i intégral). Confirmé.
- MAIS le wiring Sentry mobile vit ailleurs, et il est présent :
  - `museum-frontend/app.config.ts:354-360` — plugin `@sentry/react-native/expo` (org/project via env).
  - `museum-frontend/ios/sentry.properties:4` + `museum-frontend/android/sentry.properties:4` — `# Using SENTRY_AUTH_TOKEN environment variable`.
  - `museum-frontend/eas.json:44,49` — `SENTRY_PROJECT` (android / apple-ios) par profil.
  - `docs/CI_CD_SECRETS.md:390` — « Le plugin `@sentry/react-native/expo` auto-upload les source maps pendant les EAS builds quand `SENTRY_AUTH_TOKEN` est dispo comme EAS secret. » + `:392` setup `eas secret:create`.
  - `@sentry/react-native: ^8.9.1` (package.json) — sur la v8, le plugin Expo installe les hooks metro/gradle/xcode qui créent la release + uploadent les sourcemaps au build ; `release` (= bundleId@version) et `dist` (= buildNumber) sont injectés par le SDK natif / les hooks build, PAS dans `Sentry.init`. C'est le comportement standard `@sentry/react-native` v8.

**VERDICT I-OPS1 : MAJORITAIREMENT RÉSOLU / faux-finding partiel.**
- Prong (a) « init sans release/dist » : techniquement vrai au niveau JS, mais **non-bloquant** — release/dist sont gérés au niveau build par le plugin Expo + SDK natif (auto). La réconciliation ligne 71 est défendable.
- Prong (b) « ci-cd-mobile.yml zéro Sentry » : vrai mais **mauvais endroit** — l'upload sourcemap/release tourne DANS `eas build` (jobs lignes 482/523/618/660…) via le secret EAS `SENTRY_AUTH_TOKEN`, pas dans le workflow GH.
- **Debt résiduelle (LOW, non-V1-blocker)** : (1) aucune assertion qu'`SENTRY_AUTH_TOKEN` est bien provisionné comme EAS secret en prod → si manquant, build n'échoue pas mais sourcemaps non uploadées (symbolication KO silencieuse). Recommandation : un check de présence du secret au build, ou un release explicite vérifiable. (2) `release`/`dist` non-explicites = on dépend du comportement implicite du SDK ; OK mais à documenter.
- **Le marqueur roadmap ligne 243 (◇ « non-mesurable ») est trop pessimiste** — à ré-aligner sur la réconciliation ligne 71.

---

## I-OPS2 — Alertes API 5xx / `up{backend}==0` / DB-down / Redis-down

**Finding roadmap (`docs/ROADMAP_PRODUCT.md:244`)** : aucune alerte 5xx / backend-up / DB-down / Redis-down ; routing = un seul Telegram, pas de severity split. Marqueur = ❌.

**Inventaire EXHAUSTIF des règles d'alerte sur `dev`** (`infra/grafana/alerting/*.yml`, 5 fichiers, tous les `alert:` listés) :
- `vps-host.yml` — `VPSDiskHigh`, `VPSDiskCritical`, `VPSMemoryHigh`, `VPSCPUHigh`, `NodeExporterDown` (`up{job="node-exporter"}==0`, :126).
- `chat-latency.yml` — `chat_e2e_p99_high`, `chat_websearch_error_rate_high`, `chat_websearch_error_rate_critical`.
- `chat-stages-latency.yml` — `chat_stt_p99_high`, `chat_llm_p99_high`, `chat_tts_p99_high`, `chat_all_stages_p99_high`.
- `llm-cost.yml` — `cache_hit_rate_too_low`, `cache_hit_rate_critical`, `llm_cost_breaker_open`, `llm_guard_breaker_open`, `guardrail_budget_redis_fail_closed` (:166, métrique `musaium_guardrail_budget_redis_fallback_total` — **indirect**, pas une sonde `redis_up`).
- `wikidata-resilience.yml` — `WikidataBreakerOpenSustained`, `WikidataSparqlErrorRateHigh`, `WikidataSparqlLatencyP95High`, `WikidataLocalDumpHotPath`.

**Recherches ciblées (confirmées) :**
- API **5xx** rate : `grep -i 'http.*5\.\.|status_code.*5|http_request.*total'` dans alerting/ → **CONFIRMÉ : aucune** alerte sur taux d'erreurs HTTP 5xx.
- **`up{job="musaium-backend"}==0`** : `grep up{...backend}` → **CONFIRMÉ : aucune**. Seul `node-exporter` a un `up==0`. Un backend qui 500/crash-loop ne page personne directement.
- **DB-down** : aucune règle `pg_up` / sonde Postgres. (Couvert seulement transitivement SI un backend-up existait — or il n'existe pas.)
- **Redis-down** : pas de sonde `redis_up` directe ; seule mention = la métrique applicative `guardrail_budget_redis_fallback` (signal indirect, ne couvre pas un Redis down hors path guardrail).
- `infra/grafana/alerting/api-health.yml` (claim du closure) : **n'existe pas**.

**Routing Alertmanager** (`infra/grafana/alertmanager.yml`) :
- `route: receiver: telegram-ops` ; receivers = un seul `telegram-ops` (webhook → bridge alertmanager-telegram:9094). **Pas de severity split** (aucun `telegram-ops-critical`/`-warning`, aucun routing par `severity`). La doc qui évoquait PagerDuty diverge.

**VERDICT I-OPS2 : NON RÉSOLU (❌ confirmé).**
- Les 4 sondes critiques V1 (5xx, backend up==0, DB-down, Redis-down direct) sont **absentes**.
- Routing = single receiver, pas de severity split.
- **Debt (HAUTE pour la prod V1)** : un crash du backend ou un pic de 5xx ne déclenche aucune page. C'est le trou d'observabilité le plus matériel des trois items. Le code qui le corrige existe (orphan `83feb1f0b` → `api-health.yml` + routing severity) mais **n'est pas sur `dev`**. À merger ou re-coder.
- **Action** (du closure, valide) : exporters `postgres_exporter`/`redis_exporter` pour de vraies sondes pg_up/redis_up = IaC, optionnel V1 ; mais au minimum 5xx + backend-up==0 sont faisables avec les métriques app/blackbox déjà scrapées.

---

## I-OPS3 — Migrations exécutées 2× par deploy

**Finding roadmap (`docs/ROADMAP_PRODUCT.md:245`)** : CI `migration:run` + boot-time CMD Dockerfile → double-run. Crash-loop conditionnel (idempotence TypeORM amortit le cas nominal ; risque sous échec réel + `restart:unless-stopped`). Marqueur = ❌, ◇◇.

**Vérifié :**
- `museum-backend/deploy/Dockerfile.prod:101` :
  ```
  CMD ["sh", "-c", "node dist/src/data/db/run-migrations.js && node dist/src/index.js"]
  ```
  → migrations rejouées à **chaque boot conteneur**. (vérifié aussi via `git show HEAD:...` = identique à l'arbre, pas d'édit non-commité.)
- CI deploy (`.github/workflows/ci-cd-backend.yml`) lance AUSSI les migrations dans un conteneur éphémère **avant** de restart :
  - prod : `:973` `node ./node_modules/typeorm/cli.js migration:run -d dist/src/data/db/data-source.js`
  - staging : `:1555` (idem, `backend-staging`).
- `museum-backend/src/data/db/run-migrations.ts` existe (le boot-time path). **Pas de garde version pgvector** dedans (`assertPgVectorAvailable`/`pg_available_extension_versions` → 0 hit) — confirme que le fix orphan `f29521e23` (I-OPS6) n'est pas sur `dev` non plus.

**VERDICT I-OPS3 : NON RÉSOLU (❌ confirmé) — double-path réel.**
- Chemin actuel sur `dev` : CI deploy `migration:run` (éphémère, AVANT restart) **+** Dockerfile CMD `run-migrations.js` (boot). = 2 exécutions par deploy.
- Sévérité : **conditionnel** (l'idempotence TypeORM rend le 2e run no-op dans le cas nominal). Le risque se matérialise sur échec réel d'une migration sous `restart:unless-stopped` → crash-loop boot. Reste à rendre single-path.
- Le closure prétend CMD = app-only via `83feb1f0b` — **faux sur `dev`** (CMD inchangé, ligne 101).
- **Debt (MOYENNE)** : rendre single-path (idéalement CMD app-only + migrations CI-only, ou inverse). Note DR : si single-path CI-only, documenter que `run-migrations.js` doit tourner manuellement avant 1er boot sur DB fraîche hors pipeline.

---

## Synthèse

| Item | Verdict re-dérivé | Preuve clé | Debt |
|---|---|---|---|
| **I-OPS1** | **Majoritairement RÉSOLU** (finding partiellement faux) | `sentry-init.ts:33-48` (no release/dist JS) MAIS `app.config.ts:354` plugin + `ios/android/sentry.properties:4` + `CI_CD_SECRETS.md:390` auto-upload EAS | LOW : vérifier secret EAS `SENTRY_AUTH_TOKEN` provisionné ; ré-aligner marqueur ligne 243 ↔ 71 |
| **I-OPS2** | **NON RÉSOLU** (❌) | `alerting/*.yml` : aucune règle 5xx / `up{backend}==0` / pg_up / redis_up direct ; `alertmanager.yml` single receiver `telegram-ops` | HAUTE V1 : crash backend / pic 5xx ne page personne. Fix = orphan `83feb1f0b`, à merger/re-coder |
| **I-OPS3** | **NON RÉSOLU** (❌) | `deploy/Dockerfile.prod:101` CMD double-run + CI `ci-cd-backend.yml:973`/`:1555` migration:run | MOYENNE : rendre single-path. Fix = orphan `83feb1f0b`/`f29521e23`, à merger/re-coder |
| **LOT-P0-STABILITY-CLOSURE.md** | **CLAIM CREUX** | 4 commits orphelins (`a3f717cfc`/`e206b453d`/`f29521e23`/`83feb1f0b`), `git branch --contains` = NONE ; fichiers/edits absents de `dev` | Aligner avec `ROADMAP_PRODUCT.md:87` (déjà honnête) ; merger les commits ou retirer le claim |

**Méthode** : tout vérifié (`git merge-base --is-ancestor`, `git branch --contains`, `Read` intégral sentry-init, `grep` exhaustif alerting + Dockerfile CMD + CI). Rien supposé.
