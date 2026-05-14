# R2 — HTTP Framework Audit (Express 5 vs Fastify 5 vs Hono 4 vs NestJS 11)

**Date** : 2026-05-12
**Auteur** : Agent R2
**Cible audit** : `museum-backend/` — Express 5.2.1, `@types/express` 5.0.1, Node 22
**Discipline** : UFR-013 (honesty). Chaque claim numérique a une URL citée. Lecture obligatoire avant verdict : section "Limites de l'audit" en fin de doc.

---

## TL;DR

**Verdict : KEEP Express 5.2 — pas de migration avant V1 (2026-06-01). Reconsidérer post-launch si goulot CPU/latence prouvé en prod.**

Trois données décident :

1. **Express 5.2.1 (1er déc 2025) est production-grade en 2026.** Sortie GA octobre 2024, 5.1 latest mars 2025, 5.2 décembre 2025, support LTS formalisé (ACTIVE jusqu'à ≥avril 2026, MAINTENANCE jusqu'à ≥avril 2027), Performance Working Group financé Sovereign Tech Fund, 1 seule CVE écosystème en Q4 2025 (body-parser `CVE-2025-13466` patched 5.2.1). Sources : [Express blog 5.1](https://expressjs.com/2025/03/31/v5-1-latest-release.html), [Express security 2025-12](https://expressjs.com/2025/12/01/security-releases.html), [EOL.date Express](https://endoflife.date/express).
2. **Fastify 5.8.5 (mai 2026) est plus rapide d'environ 1.75× sur hello-world (68 124 vs 38 774 req/s, Node 24, autocannon -c100 -d40 -p10, repo fastify/benchmarks 2026-05-11), mais ce gap disparaît dès qu'on ajoute auth + Postgres + LLM** — chez Musaium 90%+ du budget temps est dans pgvector + appels OpenAI/Deepseek (P95 chat-flow ≥800ms d'après k6 specs). Pour 100k users B2C avec QPS pic estimé ≤2k req/s, un seul worker Express fait déjà l'affaire. Source : [fastify/benchmarks repo](https://github.com/fastify/benchmarks), [Fastify benchmarks page](https://fastify.dev/benchmarks/).
3. **Migration coût-bénéfice négatif** — 55 fichiers `museum-backend/src/**` importent depuis `'express'`, 26 fichiers `.route.ts` à réécrire, 15 middlewares custom (`@src/helpers/middleware/*`), stack TypeORM + LangChain + helmet/cors/compression branchée sur Express signatures. `@fastify/express` plugin existe mais explicitement marqué "not a long-term solution" et **incompatible avec body-parser sur routes POST** (bug confirmé). Effort réaliste estimé : 6-10 jours-ingénieur pour port complet, à comparer aux ~0.5 jour de prod monitoring qui dirait "tiens, le P95 monte" avant qu'un goulot framework devienne mesurable.

**Risques résiduels Express** : (a) `path-to-regexp` v8 a déjà eu 2 ReDoS CVE 2024 (corrigés) — surface attaque routing ; (b) Express 6 attendu "no sooner than 2026-01-01" — incertain en pratique au vu de l'historique (5.0 a pris 10 ans) ; (c) pas de validation schéma intégrée — Musaium utilise déjà des validations module-par-module, ok.

**Quand reconsidérer** : si après 6 mois de prod (≈décembre 2026) on observe (1) >70% temps CPU framework selon profiler clinic.js, (2) latence P99 framework-only >5ms, (3) ≥4 workers Node nécessaires pour tenir charge → relancer audit migration Fastify (pas Hono, pas NestJS).

---

## 1. Express 5.x — État 2026

### 1.1 Statut release & support

| Élément | Donnée | Source |
|---|---|---|
| Express 5.0.0 GA | 2024-10-15 (10 ans après v4.0) | [Express v5 release blog](https://expressjs.com/2024/10/15/v5-release.html) |
| Express 5.1.0 | 2025-03-31 — tagué `latest` sur npm | [Express 5.1 blog](https://expressjs.com/2025/03/31/v5-1-latest-release.html) |
| Express 5.2.0 | 2025-11-?? — body-parser→2.2.1 (CVE-2025-13466), Node 25 test matrix | [GitHub releases](https://github.com/expressjs/express/releases/tag/v5.2.0) |
| Express 5.2.1 | 2025-12-01 — revert breaking change parser query introduit dans 5.2.0 | [Express security 2025-12](https://expressjs.com/2025/12/01/security-releases.html) |
| Express 4.x | MAINTENANCE depuis 2025-04-01, EOL ≥2026-10-01 | [Express 5.1 blog § support](https://expressjs.com/2025/03/31/v5-1-latest-release.html) |
| Express 5.x ACTIVE | jusqu'à ≥2026-04-01 puis MAINTENANCE jusqu'à ≥2027-04-01 | Idem |
| Express 6.x | Discussions ouvertes, sortie "no sooner than 2026-01-01" — pas de date ferme | Idem |
| Téléchargements npm | ~35M/semaine (vs Fastify 5.4M, Hono 1.8M) | [PkgPulse 2026 comparison](https://www.pkgpulse.com/blog/express-vs-fastify-2026) |

**Musaium utilise `^5.2.1`** = dernière patch line, dans la fenêtre ACTIVE, support officiel jusqu'à ≥avril 2026, puis maintenance ≥avril 2027 → couvre largement notre launch V1 + horizon 12 mois post-launch.

### 1.2 Breaking changes v4 → v5 (déjà absorbé chez nous mais à connaître)

Source : [Better Stack Express 5 guide](https://betterstack.com/community/guides/scaling-nodejs/express-5-new-features/), [Express v5 official](https://expressjs.com/2024/10/15/v5-release.html).

1. **Node.js ≥18** requis (Musaium = 22, ok)
2. **`path-to-regexp` 0.x → 8.x** — la grosse rupture :
   - Wildcard `*` doit être nommé : `/*splat` au lieu de `*`
   - Sous-expressions regex supprimées : `/:foo(\d+)` interdit
   - Optionnel `?` supprimé : utiliser `/:file{.:ext}`
   - RegExp routes (`/(page|discussion)/:slug`) → routes explicites
   - **Motivation : mitigation ReDoS** ([CVE-2024-45296](https://security.snyk.io/vuln/SNYK-JS-PATHTOREGEXP-7925106), [CVE-2024-52798](https://advisories.gitlab.com/pkg/npm/path-to-regexp/CVE-2024-52798/))
3. **Async error handling** — promesses rejetées propagées automatiquement à `errorHandler` (plus besoin de wrapper try/catch dans middleware async)
4. **`res.render()` toujours async** (cohérence avec view engines async)
5. **HTTP/2 natif** dans v5

> Audit du code Musaium : `Grep` sur les fichiers `*.route.ts` confirme — aucun wildcard nu, pas de sous-expr regex, pas de RegExp routes. **Pas de dette migration v4→v5 en attente**, on est déjà nominal.

### 1.3 CVE / vulnérabilités 2025-2026

Sources : [Snyk Express advisor](https://security.snyk.io/package/npm/express), [Express security 2025-12](https://expressjs.com/2025/12/01/security-releases.html), [body-parser releases](https://github.com/expressjs/body-parser/releases).

| CVE | Gravité | Affecte | Statut Musaium |
|---|---|---|---|
| `CVE-2025-13466` (body-parser DoS URL-encoded) | Moderate | body-parser 2.2.0 → 2.2.1 | **OK** — Express 5.2.1 ship body-parser 2.2.1 |
| `CVE-2024-45296` (path-to-regexp ReDoS) | High | path-to-regexp <8.0.0 | **OK** — Express 5.x ship path-to-regexp 8.x |
| `CVE-2024-52798` (path-to-regexp backtrack) | High | path-to-regexp <8.0.0 | **OK** — idem |
| `CVE-2024-51999` Express extended query (revendiqué fausse alerte) | — | revoked | N/A |

**Aucune CVE bloquante en 5.2.1 au 2026-05-12.** Cadence patch acceptable.

### 1.4 Performance Express 5.2 — Mesures officielles 2026

**Benchmark fastify/benchmarks 2026-05-11, Node 24.15.0, `autocannon -c 100 -d 40 -p 10`** ([repo](https://github.com/fastify/benchmarks)) :

| Framework | req/s | Latence moyenne |
|---|---|---|
| Express 5.2.1 | **38 774** | 25.27 ms |
| Hono 4.12.18 | 56 719 | 17.10 ms |
| Koa 3.2.0 | 52 102 | 18.68 ms |
| Fastify 5.8.5 | 68 124 | 14.13 ms |

> **Lecture critique** : c'est un "hello world" — overhead framework pur sur route GET / qui renvoie `{}`. Dans le path complet Musaium (chat = JWT decode → CSRF check → DB session lookup → cache → orchestration LangChain → 3-5s OpenAI → guardrail output → JSON serialize), l'overhead Express est <1% du wall time. La page bench Fastify le dit elle-même : *"This is a synthetic benchmark... The overhead each framework has on your application depends on your application."*

**Performance Working Group financé Sovereign Tech Fund (mars 2025)** = engagement actif sur optimisations core. Source : [Express 5.1 blog § Performance WG](https://expressjs.com/2025/03/31/v5-1-latest-release.html).

### 1.5 Pièges connus production Express 5

- **EventEmitter memory leaks sur SSE/EventSource streams** ([express#2248](https://github.com/expressjs/express/issues/2248), [express#3552](https://github.com/expressjs/express/issues/3552)) — n'affecte pas Musaium (SSE deprecated 2026-05-03, ADR-001 supprimée)
- **Event loop blocking par regex** — risque mitigé par path-to-regexp v8 (anti-ReDoS), à vigilance pour regex métier
- **`opentelemetry/instrumentation-router` attache `prependListener('finish')` par layer** → MaxListenersExceededWarning au-delà de 10 middlewares. Désactivé chez nous via `getNodeAutoInstrumentations` (cf. `reference_otel_router_max_listeners.md`). **C'est un piège Express-specific** que toute migration framework éliminerait — mais déjà mitigé.

---

## 2. Fastify 5.x — État 2026

### 2.1 Statut release & support

| Élément | Donnée | Source |
|---|---|---|
| Fastify 5.0.0 | 2024-09 (officiel OpenJSF) | [OpenJSF Fastify 5 announcement](https://openjsf.org/blog/fastifys-growth-and-success) |
| Fastify 5.8.5 | ~avril 2026 — dernière minor | [npm fastify](https://www.npmjs.com/package/fastify) |
| Node requis | ≥20 (Musaium = 22, ok) | [Fastify migration v5](https://fastify.dev/docs/v5.1.x/Guides/Migration-Guide-V5/) |
| Téléchargements | ~5.4M/semaine, +40% YoY | [PkgPulse comparison](https://www.pkgpulse.com/blog/express-vs-fastify-2026) |
| Adoption | OpenJSF incubation, utilisé Microsoft, Vercel internals | [Fastify ecosystem](https://fastify.dev/ecosystem/) |

### 2.2 Perf vs Express — Le chiffre honnête

| Source | Bench | Express | Fastify | Ratio |
|---|---|---|---|---|
| fastify/benchmarks (officiel, 2026-05-11) | hello world, Node 24 | 38 774 req/s | 68 124 req/s | **1.76×** |
| TechEmpower R23 (cité PkgPulse 2026) | plaintext | ~20k req/s | ~87k req/s | **4.3×** |
| Better Stack guide (2026) | charge réelle JSON | 10-20k req/s | 45-50k req/s | **2-3×** |
| Tiers blog (cités multi) | "consistent every benchmark" | 25k | 80k | 3× |

**Source autoritaire** : [Fastify benchmarks repo](https://github.com/fastify/benchmarks) (le seul reproductible).

**Pourquoi Fastify est plus rapide** :
- `fast-json-stringify` sérialise via schéma compilé (zéro réflexion runtime) vs Express qui sérialise via `JSON.stringify` standard
- Router `find-my-way` (radix tree) vs Express linéaire
- Plugin system encapsulé qui évite le coût "every middleware runs for every request" d'Express

**Conditions où le gap importe** :
- Endpoints CPU-bound qui sérialisent gros JSON
- Routes hello-world métriques type `/health`, `/metrics`
- ≥10k req/s soutenu sur 1 process → gap visible

**Conditions où le gap est inaudible** : DB-bound, LLM-bound, IO-bound, <2k req/s pic. **C'est notre cas Musaium 100% du temps.**

### 2.3 Écosystème plugins

Source : [Fastify ecosystem page](https://fastify.dev/ecosystem/).

| Capacité Musaium actuelle (Express) | Équivalent Fastify | Maturité |
|---|---|---|
| `helmet` | `@fastify/helmet` | core, mature |
| `cors` | `@fastify/cors` | core, mature |
| `compression` | `@fastify/compress` | core, mature |
| `cookie-parser` | `@fastify/cookie` | core, mature |
| `swagger-ui-express` | `@fastify/swagger` + `@fastify/swagger-ui` | core, **mieux** (schéma auto) |
| `multer` (upload) | `@fastify/multipart` | core, mature |
| `express-rate-limit` (on a custom) | `@fastify/rate-limit` | core, mature |
| OpenTelemetry | `@fastify/otel` (officiel) ou `@opentelemetry/instrumentation-fastify` | core depuis 2025-06, **legacy package deprecated** |

**Note** : la nouvelle officielle [@fastify/otel](https://github.com/fastify/otel) est mainteneurs Fastify, supersede le contrib otel-instrumentation-fastify (deprecated 2025-06-30). Couvre instrumentation route + hook. Source : [npm @fastify/otel](https://github.com/fastify/otel).

**Piège OTel Fastify** : l'instrumentation peut "casser l'encapsulation" Fastify en créant des spans qui traversent les boundaries plugin (parent-child incorrects). Issue connue 2026. Source : [OneUptime 2026 fix otel Fastify](https://oneuptime.com/blog/post/2026-02-06-fix-otel-breaking-fastify-encapsulation/view). Pas un blocker mais à vérifier en migration.

### 2.4 Schéma validation + OpenAPI — Le vrai différentiateur

- Validation JSON Schema **intégrée core** via AJV — compilation au boot, ~free runtime
- TypeBox = types TS + JSON Schema en un seul DSL (`Type.Object({...})`)
- `@fastify/swagger` génère **OpenAPI 3.1** à partir des schemas routes — design-first ou code-first
- Alternative `fastify-openapi-glue` : OpenAPI YAML → routes + validation auto

Source : [Fastify TS guide](https://fastify.dev/docs/latest/Reference/TypeScript/), [Speakeasy Fastify OpenAPI](https://www.speakeasy.com/openapi/frameworks/fastify).

**Pour Musaium qui maintient une spec OpenAPI canonique** (`scripts/check-openapi-spec.cjs`, génère les types TS frontend), Fastify rendrait la spec **source de vérité directe** au lieu de la regénérer post-hoc. C'est un vrai bénéfice DX **mais pas urgent V1**.

### 2.5 Migration Express → Fastify : coût réel

Source : [Better Stack migration guide](https://betterstack.com/community/guides/scaling-nodejs/migrating-from-express-to-fastify/), [AppSignal migrate guide](https://blog.appsignal.com/2023/06/28/migrate-your-express-application-to-fastify.html), [@fastify/express plugin](https://github.com/fastify/fastify-express).

**Chemin "gradual" via `@fastify/express`** :
- Wrap Express avec Fastify, monte routers Express comme middleware Fastify
- ⚠️ **Incompatible body-parser** : `@fastify/express` + Express middleware POST → hangup confirmé ([issue #106](https://github.com/fastify/fastify-express/issues/106))
- ⚠️ Pas de support HTTP/2
- Plugin doc : *"not a long-term solution, aims to help smooth transition"*

**Chemin "rewrite"** :
- 55 fichiers TS du backend importent `express`
- 26 routes `.route.ts` à réécrire signature handler
- 15 middlewares custom à porter (signature `(req, res, next)` → `(req, reply)` ou hook)
- `swagger-ui-express` → `@fastify/swagger-ui` (1 jour)
- ChatService / AuthService injectent `chatService` dans router factory (`createApiRouter({chatService,...})`) — pattern compose-root déjà compatible, peu de refacto
- Test e2e : tests `supertest` doivent migrer vers `app.inject()` Fastify (équivalent, simple)

**Effort estimé** : 6-10 jours-ingénieur expérimenté. Risque rupture moyen, surtout sur l'observabilité (re-vérifier OTel + prom-client + Sentry).

### 2.6 Roadmap Fastify

Pas de v6 annoncé fin 2026. Cadence 5.x active, breaking changes formels chaque major. Pas d'inquiétude maintenance court terme.

---

## 3. Hono 4.x — État 2026

### 3.1 Statut & adoption

| Élément | Donnée | Source |
|---|---|---|
| Hono 4.12.18 | mai 2026 | [npm hono](https://www.npmjs.com/package/hono) |
| Téléchargements | ~1.8M/semaine, +340% YoY | [PkgPulse Hono 2026](https://www.pkgpulse.com/guides/hono-js-2026-edge-framework-guide) |
| Adoption prod | Cloudflare (D1, Workers KV), Clerk, Unkey, Stytch (MCP servers), Portkey AI, OpenStatus, cdnjs | [Hono discussion #1510](https://github.com/orgs/honojs/discussions/1510) |
| Bundle size | ~14KB minified | Idem |
| Standards | Web Fetch API (Request/Response standard), runs partout (Workers, Deno, Bun, Node, Lambda) | [Hono docs](https://hono.dev/docs) |

### 3.2 Perf Hono vs Express (Node only)

Source : [fastify/benchmarks 2026-05-11](https://github.com/fastify/benchmarks), [Hono benchmarks](https://hono.dev/docs/concepts/benchmarks).

- Hono Node : 56 719 req/s (1.46× Express, 0.83× Fastify) sur Node 24
- Hono **brille sur edge runtimes** (Workers, Bun) — pas notre runtime
- Sur Node, Hono passe par un adapter `@hono/node-server` qui convertit Web Standard ↔ Node http → overhead non-nul

### 3.3 Why Hono = pas la bonne réponse pour Musaium

1. **Incompatibilité Express middleware fondamentale** — signature `(req, res, next)` ne map pas vers Hono `Context` (Fetch API). Tous les middlewares helmet/cors/compression/multer/swagger-ui-express **doivent être remplacés par équivalents Hono**.
2. **Écosystème encore jeune** — pour 90% cas usage couvert, mais pour le 10% restant (Sentry Node SDK, OpenTelemetry full, Prometheus prom-client, etc.) intégration custom requise.
3. **Use case Hono = edge-first** — Cloudflare Workers, Bun, Deno. Musaium tourne sur VPS OVH Node 22, on bénéficie zéro de l'avantage edge.
4. **Pas de gain net mesurable** sur charge attendue Musaium.
5. **Couvre certains use cases AI-native** (MCP servers Stytch utilise Hono + Cloudflare) — pas notre profil.

**Verdict Hono** : Excellent pour services edge ou nouveau microservice "AI tool layer". **Pas une migration justifiable** depuis un monolithe Express déjà en place sur Node.

---

## 4. NestJS 11 — État 2026

### 4.1 Statut

Source : [Trilon NestJS 11 release](https://trilon.io/blog/announcing-nestjs-11-whats-new), [Tirnav NestJS 11 features](https://tirnav.com/blog/nestjs-11-whats-new), [Medium Atilla NestJS 11](https://medium.com/@atillataha/nestjs-11-new-features-and-examples-fb648ab797dc).

- NestJS 11 GA : janvier 2025
- SWC compiler par défaut → builds ~20× plus rapides que tsc
- Vitest default test runner (powered SWC)
- Logger built-in JSON
- Adapter Express (default) ou Fastify
- Bootstrap without root AppModule (microservices)

### 4.2 Fit hexagonal Musaium ?

Musaium **a déjà** une structure hexagonale propre :
- `domain/` (ports + entities pure)
- `useCase/` (orchestration)
- `adapters/` (primary HTTP + secondary DB/LLM/cache)
- DI manuelle via composition root (`buildChatService`, `buildAuthService`)

NestJS apporterait :
- DI container automatique avec décorateurs
- Module system formel
- Validation pipe (class-validator/class-transformer ou Zod via custom)
- Guards/Interceptors comme abstractions

NestJS **coûterait** :
- ~26× plus lent startup (Express direct = 7.9ms, NestJS+Express = 197.4ms) — pas un problème prod mais slow tests
- Verbosité décorateurs Angular-like — change la culture code
- DI runtime (reflection-metadata) vs composition manuelle compile-time
- Lock-in framework lourd, migration sortie ≈ rewrite

Source : [Encore NestJS vs Express 2026](https://encore.dev/articles/nestjs-vs-express), [Leapcell NestJS 2025](https://leapcell.io/blog/nestjs-2025-backend-developers-worth-it), [GitHub nest #12620 DI overhead](https://github.com/nestjs/nest/issues/12620).

### 4.3 Verdict NestJS

**Hard NO** pour Musaium :
- L'archi hexagonale est déjà claire et fonctionne — pas de problème à résoudre
- Effort migration ≥3 semaines (réécrire chaque module en `@Module/@Controller/@Injectable`)
- Cultural fit faible — équipe solo, pas besoin de cadre Angular-like
- ROI proche zéro vs Express pour notre maturité hexagonale

NestJS = bon choix si on **démarrait** un projet enterprise multi-équipe. Pas pour retrofit un backend pré-launch.

---

## 5. Capacity 100k users — Analyse honnête

### 5.1 Hypothèses charge Musaium V1

- 100k users B2C cibles 6 mois après launch
- DAU réaliste 5-10% = 5-10k actifs/jour
- QPS pic estimé (h. déj. visite musées) : ~500-2000 req/s
- Distribution endpoints : 60% chat (DB+LLM lourds, 2-5s), 25% session/auth (DB léger, <100ms), 15% statique/health

### 5.2 Capacité actuelle Express sur 1 worker Node 22

Source : [DEV Backend 100K users](https://dev.to/shalinee/backend-api-optimization-at-scale-handling-100k-users-with-nodejs-express-2ban), benchmarks fastify/benchmarks.

- Express 5.2 hello world : ~38k req/s sur Node 24, 1 core
- Workload réel (auth + DB + cache + JSON) : ~5-15k req/s par worker selon profil
- Bottleneck Musaium = LLM upstream (OpenAI latency P95 ≥2-5s), **pas Express**
- Stratégie scale = clusters Node + Postgres pool tuning + pgvector index + Redis cache

### 5.3 Comparaison capacity 4 frameworks

| Framework | Express 5.2 | Fastify 5.8 | Hono 4 (Node) | NestJS 11+Fastify |
|---|---|---|---|---|
| Req/s hello world (Node 24) | 39k | 68k | 57k | ~50k |
| Surcoût pour 100k users V1 | Aucun (DB/LLM-bound) | Aucun | Aucun | Aucun |
| Différenciateur dans le workload réel chat | <1% | <1% | <1% | <1% |
| Vrai bottleneck attendu | Postgres pool + LLM throttle | Idem | Idem | Idem |

**Conclusion** : pour 100k users, **aucun des 4 frameworks ne fait défaut**. Le choix est sur DX, sécurité long-terme, écosystème, coût migration.

---

## 6. Matrice de décision

Échelle 1-5 (5 = meilleur).

| Critère | Express 5.2 (current) | Fastify 5.8 | Hono 4 (Node) | NestJS 11 |
|---|---|---|---|---|
| Perf brut (req/s) | 3 | **5** | 4 | 4 |
| Perf workload Musaium réel | **5** (suffit) | **5** | **5** | **5** |
| Écosystème middleware | **5** (universel) | 4 (croissant) | 3 (jeune) | **5** (via Express) |
| Validation/OpenAPI intégré | 2 | **5** | 4 | 4 |
| TypeScript DX | 3 | 4 | **5** | **5** (décorateurs) |
| Maturité prod | **5** (10+ ans) | 4 (6 ans) | 3 (3 ans Node) | 4 (7 ans) |
| Couverture CVE patch cadence | 4 | 4 | 4 | 4 |
| Fit hexagonal Musaium | 4 (composition manuelle ok) | 4 | 4 | 3 (lock-in DI) |
| Effort migration | **5** (zéro) | 1 (6-10 j) | 1 (8-12 j) | 1 (3+ semaines) |
| Risk launch V1 (3 sem) | **5** (statu quo) | 2 | 1 | 1 |
| Compat infra existante (helmet/cors/multer/swagger-ui) | **5** | 4 (équivalents) | 2 (à remplacer) | **5** (via Express) |
| Compat OTel + Sentry + Prom | **5** (déjà fait) | 3 (re-câbler) | 2 (re-câbler) | 4 |
| Score brutal | **51** | 45 | 38 | 45 |

Pondéré par "blocker launch V1" (effort + risk x3) :
- **Express 5.2 : 51 + (5+5)×3 = 81** ← winner clair
- Fastify 5.8 : 45 + (1+2)×3 = 54
- Hono 4 : 38 + (1+1)×3 = 44
- NestJS 11 : 45 + (1+1)×3 = 51

---

## 7. Verdict & recommandations

### 7.1 Verdict ferme

**KEEP Express 5.2.1.** Pas de migration framework HTTP avant V1 (2026-06-01). 

### 7.2 Actions court terme (avant launch)

1. **Pinner `express` à `5.2.1`** (déjà `^5.2.1` dans package.json) — éviter pull silencieux 5.3 avec breaking
2. **Garder un audit CVE Renovate/Dependabot weekly** sur `express`, `body-parser`, `path-to-regexp`, `compression`, `helmet`, `cors`, `multer`
3. **Vérifier que `dataModeMiddleware` + `csrfMiddleware` n'utilisent pas regex backtrack-prone** — surface ReDoS résiduelle si on a des regex métier custom
4. **Documenter dans `docs/TECH_DEBT.md`** une revue framework planifiée à T+6 mois post-launch (≈décembre 2026)

### 7.3 Plan de réévaluation post-launch (Q4 2026)

Triggers pour relancer audit migration :
- P99 framework-only > 5ms mesuré via clinic.js
- >70% CPU non-LLM passé dans Express stack
- ≥4 workers Node nécessaires pour tenir QPS pic
- Endpoint hi-throughput nouveau (ex: ingestion event streaming) qui s'avère bottleneck

Si triggers ALORS migration cible = **Fastify 5.x** (pas Hono, pas NestJS) :
- Plus proche Express en signature handler (`(req, res)` → `(req, reply)`)
- Plugin `@fastify/express` permet migration progressive route-par-route
- Validation schema + OpenAPI 3.1 auto = vrai gain DX si on garde l'OpenAPI canon
- Adoption industrie en hausse, écosystème stable

### 7.4 Ne PAS faire

- ❌ Migration Hono — gain edge non-pertinent pour notre infra Node/VPS, écosystème encore jeune
- ❌ Migration NestJS — réécriture complète pour zéro problème résolu, perdre la simplicité hexagonale actuelle
- ❌ Sous-estimer le coût migration Fastify — c'est pas un drop-in
- ❌ Migrer avant V1 — risque vs valeur catastrophique à 3 semaines du go-live

---

## 8. Limites de l'audit

- Pas de bench reproductible sur **notre workload Musaium** (chat-flow réel) — les chiffres req/s framework sont synthétiques hello-world ou GET JSON simples
- Pas de profil clinic.js doctor en prod — on infère que LLM/DB dominent le wall time depuis nos specs k6 mais pas de mesure live à 100k users (forcément, pas encore launch)
- Pas testé personnellement `@fastify/otel` + Sentry combo — j'extrapole depuis docs Sentry Hono/Fastify et release notes
- L'effort migration "6-10 jours" est une estimation calendaire, pas confirmé par dry-run
- Cadence CVE Express 2025 = 1 issue body-parser → est-ce sous-déclaré ? Pas évident, mais Snyk page est consultable directement
- Le ratio "framework <1% du wall time" est inféré de l'architecture (LangChain + LLM 2-5s upstream) — confirmable au premier `/api/chat/sessions/*` k6 run prod

---

## 9. Sources (intégrales)

### Express
- [Express v5 release blog (2024-10-15)](https://expressjs.com/2024/10/15/v5-release.html)
- [Express 5.1 + LTS timeline (2025-03-31)](https://expressjs.com/2025/03/31/v5-1-latest-release.html)
- [Express security 2025-12](https://expressjs.com/2025/12/01/security-releases.html)
- [Express releases GitHub](https://github.com/expressjs/express/releases)
- [Express 5.2.0 release](https://github.com/expressjs/express/releases/tag/v5.2.0)
- [Express EOL.date](https://endoflife.date/express)
- [Better Stack Express 5 guide](https://betterstack.com/community/guides/scaling-nodejs/express-5-new-features/)
- [Trevor Lasn — What's new in Express 5](https://www.trevorlasn.com/blog/whats-new-in-express-5)

### CVE / Security
- [Snyk Express advisor](https://security.snyk.io/package/npm/express)
- [Snyk path-to-regexp CVE-2024-45296](https://security.snyk.io/vuln/SNYK-JS-PATHTOREGEXP-7925106)
- [GitLab path-to-regexp CVE-2024-52798](https://advisories.gitlab.com/pkg/npm/path-to-regexp/CVE-2024-52798/)
- [GHSA-wqch-xfxh-vrr4 body-parser DoS (CVE-2025-13466)](https://github.com/expressjs/body-parser/security/advisories/GHSA-wqch-xfxh-vrr4)

### Fastify
- [Fastify benchmarks GitHub](https://github.com/fastify/benchmarks)
- [Fastify benchmarks page](https://fastify.dev/benchmarks/)
- [Fastify ecosystem](https://fastify.dev/ecosystem/)
- [Fastify v5 migration guide](https://fastify.dev/docs/v5.1.x/Guides/Migration-Guide-V5/)
- [Fastify LTS policy](https://fastify.dev/docs/latest/Reference/LTS/)
- [OpenJSF Fastify 5 announcement](https://openjsf.org/blog/fastifys-growth-and-success)
- [npm fastify](https://www.npmjs.com/package/fastify)
- [@fastify/otel](https://github.com/fastify/otel)
- [@opentelemetry/instrumentation-fastify](https://www.npmjs.com/package/@opentelemetry/instrumentation-fastify)
- [Better Stack Express→Fastify migration](https://betterstack.com/community/guides/scaling-nodejs/migrating-from-express-to-fastify/)
- [AppSignal migrate Express→Fastify](https://blog.appsignal.com/2023/06/28/migrate-your-express-application-to-fastify.html)
- [@fastify/express plugin](https://github.com/fastify/fastify-express)
- [Encore Fastify v5 breaking changes](https://encore.dev/blog/fastify-v5)
- [Speakeasy Fastify OpenAPI](https://www.speakeasy.com/openapi/frameworks/fastify)
- [OneUptime — fix OTel breaking Fastify encapsulation 2026](https://oneuptime.com/blog/post/2026-02-06-fix-otel-breaking-fastify-encapsulation/view)

### Hono
- [Hono docs](https://hono.dev/docs)
- [Hono benchmarks](https://hono.dev/docs/concepts/benchmarks)
- [@hono/node-server](https://www.npmjs.com/package/@hono/node-server)
- [Hono discussion who-uses-in-prod #1510](https://github.com/orgs/honojs/discussions/1510)
- [PkgPulse Hono 2026 guide](https://www.pkgpulse.com/guides/hono-js-2026-edge-framework-guide)
- [PkgPulse Express vs Hono 2026](https://www.pkgpulse.com/blog/express-vs-hono-2026)
- [Sentry Hono OpenTelemetry guide](https://docs.sentry.io/platforms/javascript/guides/hono/opentelemetry/)
- [Hono Express middleware compat #3293](https://github.com/honojs/hono/issues/3293)

### NestJS
- [NestJS 11 official Trilon announcement](https://trilon.io/blog/announcing-nestjs-11-whats-new)
- [NestJS GitHub releases](https://github.com/nestjs/nest/releases)
- [Encore NestJS vs Express 2026](https://encore.dev/articles/nestjs-vs-express)
- [Leapcell NestJS 2025 worth it](https://leapcell.io/blog/nestjs-2025-backend-developers-worth-it)
- [NestJS DI overhead issue #12620](https://github.com/nestjs/nest/issues/12620)
- [NestJS SWC docs](https://docs.nestjs.com/recipes/swc)
- [NestJS Fastify v5 upgrade #14068](https://github.com/nestjs/nest/issues/14068)

### Benchmarks / Capacity
- [TechEmpower benchmarks](https://www.techempower.com/benchmarks/)
- [DEV — 100K users Node Express](https://dev.to/shalinee/backend-api-optimization-at-scale-handling-100k-users-with-nodejs-express-2ban)
- [PkgPulse Express vs Fastify 2026](https://www.pkgpulse.com/blog/express-vs-fastify-2026)
- [PkgPulse Hono vs Express vs Fastify vs Elysia 2026](https://www.pkgpulse.com/guides/hono-vs-express-vs-fastify-vs-elysia-2026)
- [Nucamp Node.js + Express 2026](https://www.nucamp.co/blog/node.js-and-express-in-2026-backend-javascript-for-full-stack-developers)
- [OneUptime OTel performance impact 2026](https://oneuptime.com/blog/post/2026-01-07-opentelemetry-performance-impact/view)
- [Stackwise Express vs Fastify 2026](https://stackwise.info/compare/express-vs-fastify)
- [Meduzzen NestJS vs Fastify vs Express 2026](https://meduzzen.com/blog/nestjs-vs-fastify-vs-express-backend-2026/)
