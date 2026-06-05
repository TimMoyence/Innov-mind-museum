# Cartographie 360° — Musaium

> Audit de maturité enterprise-grade · 2026-05-31 (J-7 launch V1) · dev solo full-Claude
> Méthodologie : 8 introspections vérifiées-code + 8 benchmarks fact-checkés + gap-analysis croisée + verdict /team vs natif Anthropic.
> Tous les scores ci-dessous sont les scores **réajustés** (après démasquage des overclaims). Doctrine d'honnêteté UFR-013 appliquée : ce qui n'a pas été vérifié est signalé comme tel, les claims fact-checkés `fabricated` sont écartés.

---

## 1. Résumé exécutif

**Score de maturité global pondéré : 70 / 100.**

Musaium est de la **maturité GENUINE, pas de la façade**. C'est le constat central, et il est solide : la majorité des contre-mesures documentées résolvent réellement les modes d'échec que la littérature 2024-2026 attribue au dev solo full-IA. Chaque mode d'échec documenté par la recherche (CSRF, secrets/PII exposés, injection LLM, tests truqués, comprehension debt) a une contre-mesure **présente et vérifiée dans le code** — frozen-test sha256 anti-reward-hacking, fresh-context = vérification isomorphe externe, defense-in-depth 6 couches fail-closed, hexagone étanche 0-fuite, hash-chain audit, RGPD two-phase erasure conforme. C'est structurellement **au-dessus de la médiane enterprise** pour un dev solo.

MAIS le verdict global est tiré vers le bas par un **écart systématique entre la doctrine affichée et le câblage réel** : les garanties vedettes sont sur-claimées. Trois piliers de qualité présentés comme actifs ne le sont PAS.

### 3 messages clefs honnêtes

1. **La preuve de qualité « profonde » est désarmée.** Le mutation gate Stryker est entièrement désactivé en CI (`if: false` depuis 2026-05-09), la couche e2e Maestro est intégralement aveugle (0 shard success depuis le 27/05, jamais merge-gate, 4/4 fail quand exécutée, avec un `maestro-summary` qui remonte `success` malgré l'échec), et le frozen-test team est honor-system non câblé au harness (contournable par `lint-on-edit.sh`). **Ce qui prouve la qualité est débranché ; ce qui reste armé (coverage cliquet, sentinelles statiques) est anti-régression ou contournable.**

2. **Le gating merge/deploy est plus laxiste que le pipeline ne le laisse croire.** `deploy-prod` ne dépend QUE de `[quality, coverage-merge]` — ni `integration` ni `e2e`. `e2e` ne tourne même pas sur push `main`. `integration`, `e2e`, `coverage-merge`, `promptfoo` ne sont **pas** des required checks (vérifié via `gh api`). `enforce_admins=false`, `strict=false` → un squash-merge crée un SHA jamais gardé par integration/e2e qui peut partir en prod.

3. **Les forces sont réelles et de haut niveau** : sécurité applicative (defense-in-depth fail-closed, SAST bloquants), fiabilité du code (hexagone étanche, dette quasi-nulle, résilience pensée), et supply-chain CI/CD (cosign keyless + SLSA L3 + Trivy + verify pré-SSH + smoke éphémère + auto-rollback = banking-grade vérifié). À J-7, le risque réel n'est **pas la construction** (largement faite) mais la **stabilité au volume réel**, le **bus-factor ~1**, et la couche e2e/mutation non-armée qui laisse passer des régressions silencieuses jusqu'en prod.

---

## 2. Tableau de bord par dimension

| # | Dimension | Score réajusté | Verdict (1 ligne) |
|---|-----------|:---:|-------------------|
| 1 | Couverture de tests backend | **66** | Couverture réelle sur vraie DB (testcontainer + migrations, hash-chain, DSAR/IDOR), mais mutation gate désarmé + pipeline LLM live stubbé en e2e. |
| 2 | Tests frontend RN/Expo + Maestro e2e | **52** | Socle Jest solide (3584 verts), mais couche e2e mobile aveugle : 0 success CI depuis 27/05, jamais merge-gate, faux summary `success`, faux `covered` sur commentaires YAML. |
| 3 | Sentinelles (pre-commit/pre-push/CI-mirror) | **71** | ~17 gardes réels utiles sur 23 fichiers ; minés par `cache-key-parity` (théâtre), 2 orphelins, et un trou a11y/rate-limit/CSP. |
| 4 | Documentation, honnêteté & fraîcheur | **79** | Doctrine d'honnêteté outillée et largement exacte ; affaiblie par une ambiguïté basename (fausse PASS sentinel) et une couverture doc-last-verified étroite (6/154). |
| 5 | Fiabilité & qualité du code applicatif | **81** | Hexagone étanche, erreurs production-grade, résilience documentée (ADR-047/064), dette quasi-nulle. Quelques comptes inflatés mais l'esprit tient. |
| 6 | Sécurité & AI-Safety | **79** | Defense-in-depth réelle fail-closed, SAST bloquants, tests adversariaux, supply-chain cosign+SLSA. Affaiblie par V2 sans gate startup et erasure S3 best-effort. |
| 7 | Machinerie /team (orchestrateur 5-phase) | **49** | Gates shell réels et self-tested, reviewer produit du signal, mais les 3 garanties vedettes UFR-022 sont honor-system non câblées au harness. |
| 8 | CI/CD Pipeline (23 workflows) | **74** | Supply-chain banking-grade vérifié, commentaires honnêtes ; faille structurelle de gating (deploy-prod sans integration/e2e, required checks manquants). |

**Moyenne pondérée → 70/100** (cohérente avec `overallMaturity` de la gap-analysis croisée).

---

## 3. Introspection détaillée (par dimension)

### Dimension 1 — Couverture de tests backend · 66/100

**Forces vérifiées**
- Integration/e2e sur **vrai Postgres testcontainer** avec migrations (pas de mock-repo ni SQLite) — `tests/helpers/integration/integration-harness.ts:71` (`runMigrations transaction:none`) + reset TRUNCATE CASCADE L73-90.
- Audit hash-chain **testé comportementalement** avec re-calcul SHA-256 indépendant (kill mutants reversed-sort/+1-1/hex-base64) — `tests/unit/audit/audit-chain.test.ts:142`.
- DSAR/RGPD export **end-to-end sur DB réelle** + cas anti-IDOR (userId-param ignoré) — `tests/e2e/dsar.e2e.test.ts:36,94-121`.
- Ratio théâtre faible : 188/551 unit utilisent `jest.mock`, 10/551 sont 100% interaction-assertion et tous légitimes au spot-check.
- Sécurité multi-tenant testée sur vrai serveur Express+PG (matrices IDOR/SSRF) — `tests/integration/security/idor-matrix.test.ts:37-74`.
- `coverage-merge` nyc check 88/74/86/89 sur l'union des 4 shards = **gate réel** (pas de continue-on-error) — `ci-cd-backend.yml:344-346`.

**Faiblesses confirmées**
- **[critique]** Pipeline LLM live + guardrails V2 (sidecar, judge, output) **NON exercé en e2e** — orchestrateur synthétique stubbé : `tests/helpers/e2e/e2e-app-harness.ts:317` (`'Synthetic assistant response for e2e'`) + `OPENAI_API_KEY='e2e-fake-openai-key'`. Zone aveugle réelle, mitigée partiellement par promptfoo PR-triggered (leak-only) + ai-tests advisory.
- **[medium]** Coverage gate global = baseline figée re-pinnée aux actuals (cliquet anti-régression), pas une cible exigeante — `jest.config.ts:137`.
- **[medium]** Plancher mutation limité aux 8 hot-files ; la majorité du code n'a aucun seuil mutation — `.stryker-hot-files.json`.

**Overclaims démasqués**
- ❌ **OVERCLAIM MAJEUR** : le rapport brut présentait le mutation gate Stryker comme « gate CI réel, pas décoratif ». **RÉFUTÉ** : le job entier est `if: false` (désactivé depuis 2026-05-09) — `ci-cd-backend.yml:401-411`. Les steps `mutation:ci`/`mutation:gate` (L458-481) **ne tournent jamais**. Un des 3 piliers structurels invoqués pour justifier le score n'existe pas en CI. La logique du gate (`stryker-hot-files-gate.mjs:98-119`, `process.exit(1)`) est réelle mais **non-armée**.
- ❌ Chiffre flatteur « 28 survivors / 99.39% covered-only » provient de `stryker-incremental.json` **qui n'existe pas sur disque**. Le seul rapport présent (`mutation.json`, mtime 16 mai) montre 287 Survived + 923 NoCoverage. Chiffre historique non reproductible.
- ❌ `PHASE_HISTORY.md:36` « CI nightly continues to enforce per-hot-file thresholds » est **stale/faux** : nightly Stryker désactivé.
- ✅ Nuance corrigée : le CI promptfoo tourne bien sur PR touchant chat/guardrail (pas cron-only) — `llm-security-promptfoo.yml:36-44`.

---

### Dimension 2 — Tests frontend RN/Expo + Maestro e2e · 52/100

**Forces vérifiées**
- **3584 tests Jest réellement verts** (345 suites, 16.7s, vérifié par exécution).
- Tests d'écran **comportementaux** : mockent le transport mais rendent le vrai composant et exercent la vraie logique enable/disable — `__tests__/screens/auth.test.tsx:160-171` (register disabled until GDPR+DOB).
- Flows Maestro actifs = vrais tap-through (nav réelle + back-nav) — `auth-register-happy.yaml:64` tape `10/08/1994` DD/MM/YYYY = le cas exact du bug DOB-2026-05-17.
- Suites spéciales réelles : i18n anti copy-paste 6 locales, architecture grep FS hexagonal, RTL walk du `toJSON`.
- 43 flows runnables mappés dans `shards.json`, 0 orphelin, sentinel de sync en place.

**Faiblesses confirmées**
- **[critique]** Maestro **n'a aucun success CI depuis ≥4 nuits** : le nightly échoue au gate `quality` (Expo Doctor 3/19), prebuild + maestro-shard skipped. Tous les runs schedule 28/29/30/31 mai = failure. Dernier run vert global = 27/05.
- **[high]** Maestro **jamais merge-gate** : job conditionné à `schedule||workflow_dispatch`, exclu de `pull_request`/`push` — `ci-cd-mobile.yml:250`.
- **[high]** Sentinel screen-coverage **matche les commentaires YAML** : `tickets.tsx` et `ticket-detail.tsx` comptés `covered` alors que le commentaire dit `SKIPPED` et aucun flow ne les tape — `screen-test-coverage.mjs:170,177` (scan fichier entier, pas de strip de commentaires).
- **[medium]** 36% des écrans grandfathered (12/33), dont `chat/[sessionId]` et les 2 tabs principaux — le « 0 uncovered » est partiellement fictif.

**Overclaims démasqués**
- ❌ Le rapport brut disait « maestro-shard skipped » comme état unique. **PIRE que ça** : sur les `workflow_dispatch` du 31/05, les shards **s'exécutent et FAILENT 4/4** (HVF indisponible). Signal rouge actif, pas seulement absent.
- ❌ Non mentionné dans l'introspection : `maestro-summary` **remonte `success` alors que les 4 shards FAILENT** — faux signal vert structurel. La couche UFR-021 censée prévenir les faux verts Jest est elle-même un faux vert.
- ⚠️ Nuance : « le format FR n'est couvert QUE par Maestro » est exagéré — `__tests__/shared/lib/dateOfBirth.test.ts` existe et passe (couvre probablement le parsing FR au niveau lib). Vrai uniquement pour le test de l'écran `auth.test.tsx:167` (ISO seul).

---

### Dimension 3 — Sentinelles · 71/100

**Forces vérifiées**
- `sentry-scrubber-parity` **hash-pinné** le scrubber PII canonical + vérifie 3 wrappers — `sentry-scrubber-parity.mjs:74` + pre-push:114 + mirror P9.
- `as-any-ratchet` baseline **0/0/0 vérifiée live** (grep `as any` src = 0 en prod) — ratchet propre sans dette figée.
- `roadmap-claim-resolves` résout live 4 fichiers / 13 SHA (garde anti-mensonge UFR-024).
- `husky-lfs-integrity` ferme le trou de bypass UFR-020 via git-lfs clobber.
- Triple couche de câblage avec mirror CI re-jouant les gates pour attraper un `--no-verify`.

**Faiblesses confirmées**
- **[high]** `cache-key-parity` = **théâtre actif** : le test cible `tests/contract/cache-key-parity.test.ts` **n'existe pas**, la sentinelle SKIP-grace `exit 0` toujours mais apparaît verte au pre-push + mirror — `cache-key-parity.mjs:27`.
- **[medium]** `sbom-attest-check` et `audit-factory-coverage` **orphelins** (zéro hook/CI) ; le second n'a même aucun `process.exit(1)` (rapport, pas gate).
- **[medium]** Trous de couverture **au niveau sentinel** : aucune sentinelle a11y / rate-limit-quota / CSP / secret-rotation. (Nuance : i18n et dep-audit sont gardés ailleurs, au niveau gate CI.)
- **[low]** `doc-last-verified` et `subprocessor-ledger` sont **CI-only** (absents de `.husky/pre-push`) — « mirror » est un abus de langage, invalidable localement avant push.

**Overclaims démasqués**
- ✅ **OVERCLAIM du rapport brut RÉFUTÉ et corrigé en faveur du repo** : le rapport brut affirmait `screen-test-coverage` ORPHELIN, UFR-021 « non-enforced » (sa pire faiblesse). **FAUX** : la sentinelle EST câblée dans `.husky/pre-push:341`, `ci-cd-mobile.yml:156` ET `sentinel-mirror.yml:152`, avec `process.exit(1)` sur tout nouveau MISS. La doctrine phare EST enforcée automatiquement. C'est pour cela que le score remonte (68→71). (Limite réelle restante : 12 écrans grandfathered, et le faux `covered` via commentaire — cf. dim. 2.)
- ⚠️ « ~17 gardes » sous-compte le total réel de 23 fichiers sentinel.

---

### Dimension 4 — Documentation, honnêteté & fraîcheur · 79/100

**Forces vérifiées**
- `roadmap-claim-resolves.mjs` exécutable et **PASS** (path:line + SHA + cross-doc + workflow, 49586 fichiers indexés, 13 SHA).
- Références ADR de haute fidélité résolvant à la ligne exacte — ex `ADR-009-ota-disabled.md` → `app.config.ts:376-380`.
- `AI_SAFETY.md` drift-free, 5 couches référencent des fichiers existants.
- Aucun cimetière TODO : 1 BE (faux-positif) + 3 FE scopés.

**Faiblesses confirmées**
- **[medium]** **Ambiguïté basename → fausse PASS sentinel** : `ROADMAP_PRODUCT.md:59` cite `sentry-scrubber.ts:37-54`, mais le BE pointé (`museum-backend/src/shared/observability/sentry-scrubber.ts`) fait **29 lignes** (re-export pur) ; le vrai Set de 16 clés vit dans `packages/musaium-shared/src/observability/sentry-scrubber.ts` (256 l.). Le sentinel résout sur le shared (≥54 → PASS) alors qu'un humain suivant le path BE atterrit sur 29 lignes. Le contenu (16 clés) est exact ; seule la résolution de path est trompeuse.
- **[low]** Couverture `doc-last-verified` étroite : **6/154 docs** (AI_SAFETY + 65 ADR non gardés). Nuance : c'est by-design opt-in, donc la « fausse impression de fraîcheur » est exagérée (le sentinel ne prétend rien sur les docs non-listés).
- **[low]** Drifts de ligne mineurs : `apiPut` dit `api.ts:233`, réel `:258` ; `trace-propagation.middleware.ts` sous `observability/` pas `middleware/` ; étiquette roadmap « double » (CLAUDE.md) vs « triple » (DOCS_INDEX).
- Incohérence interne ROADMAP_PRODUCT : frontmatter `done=97` vs prose `93 livré-vérifié` (divergence de 4).

---

### Dimension 5 — Fiabilité & qualité du code applicatif · 81/100

**Forces vérifiées**
- Architecture hexagonale **réellement étanche** : `grep import adapter` dans `src/modules/*/domain/` = 0, `grep '../../../../'` = 0. Vérifié sur tous les modules.
- Middleware d'erreurs production-grade : `AppError` duck-typé pour survivre `jest.resetModules`, mapping Multer 413/400 — `error.middleware.ts:23`.
- Spans télémétrie en `try/finally` émis **hors du calcul de verdict** — un throw Langfuse ne peut pas inverser le fail-CLOSED — `llm-guard.adapter.ts:303`.
- Fail-open/fail-closed cohérents et documentés : denylist fail-OPEN (ADR-064), LLM Guard fail-CLOSED sur **tous** les chemins (breaker OPEN, overflow, non-200, non-boolean, timeout — `llm-guard.adapter.ts:266,284,385,392,403`).
- Circuit breaker 3-états FSM extraite + parsing env défensif (NaN→fallback).
- Closure-cell cancellation FE — `useSessionLoader.ts:40`.
- Dette quasi-nulle : **0 `as any` + 0 `@ts-ignore` BE**, 0 `@ts-ignore` FE.
- Hash-chain audit sérialisé par `pg_advisory_xact_lock` txn-scoped, limite throughput honnêtement documentée + ADR-054 — `audit.repository.pg.ts:72`.

**Faiblesses confirmées**
- **[medium]** Pipeline guardrails complexe (CB + sémaphore + chaos + 2 layers V2 + judge) — risque de complexité accumulée difficile à raisonner pour un solo dev.
- **[low]** Densité eslint-disable BE élevée (128, dont ~127 justifiés).
- **[low]** Hash-chain plafonne à 50-200 INSERT/s (8-30× au-dessus de la charge B2C launch — arbitrage correct).

**Overclaims démasqués**
- ❌ « FE `as any` = 1 » : **faux, c'en sont 5** (tous en tests). Production FE = 0 — l'esprit tient, le chiffre est sous-compté.
- ❌ « secondary 8+ fichiers + useCase 15+ » : **gonflé**. Réel = 5 + 10. La complexité existe mais les comptes sont inflatés.
- ⚠️ Évidence audit citée `:14` (header-comment) au lieu de `:72` (le lock SQL réel) — claim juste, citation imprécise.

---

### Dimension 6 — Sécurité & AI-Safety · 79/100

**Forces vérifiées**
- Pipeline 6 couches avec **ordering CLAUDE.md respecté** (keyword→sanitize→isolation→sidecar→judge→output) — `guardrail-evaluation.service.ts:127-186`.
- LLM Guard sidecar **fail-CLOSED sur tous les chemins** d'erreur — `llm-guard.adapter.ts:266,284,385,392,412`.
- Denylist auth fail-OPEN explicite documenté comme défense-in-depth (ADR-064).
- SAST **actifs et bloquants** : CodeQL (PR+push+cron) + Semgrep `owasp-top-ten --error`.
- Tests adversariaux réels : prompt-injection/IDOR/SSRF/XSS + promptfoo OWASP LLM07 gate 95% (`exit 1` si pass-rate < 0.95, PR-triggered).
- Supply-chain : cosign sign + SLSA L3 attest + verify inline.

**Faiblesses confirmées**
- **[medium]** Couches V2 **no-op silencieux possible** si `GUARDRAILS_V2_LLM_GUARD_URL`/budget mal déployé — **aucun gate startup ne vérifie l'activation runtime**. Nuance importante : le judge V2 est **ON par défaut** (budget default=500, pas 0), donc 5 couches tournent même sans sidecar URL ; la prod-as-configured active bien les 6.
- **[medium]** `GUARDRAILS_V2_OBSERVE_ONLY=true` downgrade tout block sidecar en allow **sans diff code** (défaut false, manifeste prod le force false, mais flip env silencieux possible).
- **[low]** Denylist fail-open : panne Redis rouvre la fenêtre de réutilisation de token révoqué jusqu'à exp JWT (accepté par design).
- **[low→medium]** Erasure S3 best-effort **sans retry durable** (contrairement à Brevo qui a un fallback) : échec S3 peut laisser des images résiduelles. Le code **admet** ne pas couvrir tous les key-layouts — `deleteAccount.useCase.ts:36-38`.
- Gate promptfoo limité aux paths `chat/**`/`shared/llm/**` : une régression guardrail hors ces chemins (env.ts, CORS) ne déclenche pas le gate sur PR.

---

### Dimension 7 — Machinerie /team · 49/100

**Forces vérifiées**
- Gates shell déterministes **réellement testés** : `pre-feature-spec-check.sh --self-test` 8/8 PASS, `post-edit-green-test-freeze.sh --self-test` 3/3 (exécutés live).
- Reviewer sémantique produit du **signal réel** : **7 runs distincts CHANGES_REQUESTED** (8 fichiers), pas 3.
- État durable + résumé légitimes pour runs longs.

**Faiblesses confirmées (les 3 garanties vedettes UFR-022 sont honor-system)**
- **[high]** Frozen-test **jamais câblé** dans un `PostToolUse` de `settings.json`/`settings.local.json` — il ne tourne que si l'orchestrateur LLM le relance à la main (`SKILL.md:301`). Honor-system confirmé.
- **[high]** **Bypass mécanique confirmé** : le seul hook `Edit|Write` câblé (`lint-on-edit.sh`) lance `prettier --write` + `eslint --fix` sur les `*.test.ts` **sans lire `red-test-manifest.json` ni vérifier le sha256** — `lint-on-edit.sh:28-35`. Un reformatage diverge le hash silencieusement. C'est exactement le gap documenté en mémoire (`feedback_bundled_red_green_frozen_test_gap`).
- **[medium]** Anti-leak fresh-context (`BRIEF-ACK` sha256, `BLOCK-CONTEXT-LEAK`) = **conventions de texte** vérifiées par le LLM lui-même ; aucun mécanisme OS/harness n'inspecte le contexte inter-phase.
- **[low]** Drift de version modèle : doctrine pin `opus-4-7`, env tourne `opus-4-8` (8× `claude-opus-4-7` dans les frontmatter agents).
- Le pipeline /team **ne tourne jamais en CI** (`sentinel-mirror.yml` couvre les hooks git UFR-020, PAS le frozen-test team).

**Overclaims démasqués (du rapport brut)**
- ❌ Sous-estimation CHANGES_REQUESTED à 3 → réel **7 runs distincts** : minimise le travail réel du reviewer.
- ❌ « lib-docs sans aucune preuve d'efficacité » exagéré : le run `sentry-otel-followups` montre des citations `PATTERNS.md` + un `doc-refresh-queue` détectant du version-drift (artefacts traçables). Nuance restante : aucun run n'a été **bloqué en dur** sur un drift (honor-system là aussi).
- ❌ Chiffre « 25/36 runs micro-refactor » inexact : 16 dirs `pr-*` le 23 mai.
- ✅ Point correctement identifié : le frozen-test « infalsifiable byte-for-byte » est un **overclaim de la DOCTRINE CLAUDE.md elle-même**, correctement debunké.

---

### Dimension 8 — CI/CD Pipeline (23 workflows) · 74/100

**Forces vérifiées**
- `deploy-prod` supply-chain **banking-grade** : Trivy `exit-code:1` + cosign sign keyless + SLSA L3 attest + cosign/gh verify **AVANT** le SSH, puis smoke éphémère (create/test/cleanup `if:always`) + **auto-rollback** sur échec deploy OU smoke — `ci-cd-backend.yml:903-1008,1386-1466`. Réel, non stub.
- `sentinel-mirror` re-joue les sentinelles côté serveur sur push `**` + PR (anti-bypass UFR-020 réel, `exit 1` explicite) ; **vérifié required check** via `gh api`.
- Cohérence services CI conforme aux gotchas : `redis:7-alpine`, `pgvector/pgvector:pg16` pinné par digest, healthchecks sur `/api/health`.
- Honnêteté des commentaires : chaque `continue-on-error`/`if:false` est justifié inline.

**Faiblesses confirmées**
- **[high]** `deploy-prod` ne `needs` QUE `[quality, coverage-merge]` — **PAS** integration ni e2e. `e2e` ne tourne **pas** sur push main (`if: PR||schedule`). Un deploy prod peut partir sans qu'integration/e2e aient gardé ce SHA — `ci-cd-backend.yml:848` vs `:489`.
- **[high]** **Required checks manquants** (vérifié `gh api branches/main/protection`) : required = `quality`, `ai-tests`, `CodeQL`, `semgrep`, `sentinel-mirror`. **Absents** : `coverage-merge` (pourtant dans le `needs` de deploy-prod !), `integration`, `e2e`, `test-coverage`, `migration-drift`, `promptfoo`. De plus `enforce_admins=false` (admin bypasse tout), `strict=false` (PR non-rebasée mergeable → SHA divergent).
- **[medium]** Maestro nightly/dispatch only, jamais sur PR — l'e2e mobile réel n'attrape une régression qu'à J+1.
- **[low]** Stryker mutation entièrement désactivé (`if: false`).
- **[low]** `cosign-sign-image.yml`/`cosign-verify-deploy.yml` (workflow_call) orphelins — gardés intentionnellement pour ops ad-hoc, pas du dead code accidentel.

**Overclaims démasqués (du rapport brut)**
- ❌ « `team-quality-regression` no-op silencieux si OPENAI_API_KEY absent » — **FAUX** : `exit 1` explicite (`:72-74`) + mock-mode par design sur PR. Faiblesse inventée.
- ❌ « `sentinel-mirror` ne bloque rien si non configuré » — **réfuté**, c'EST un required check. La vraie faille est ailleurs (integration/e2e/coverage-merge NON required + admin bypass + strict=false).

---

## 4. Benchmark / état de l'art (8 sujets)

> Verdicts fact-check : 09, 10, 11, 12, 13 = **solid** (0 fabrication). 14, 15, 16 = **mostly-solid** (claims fabriqués isolés, écartés ci-dessous).

### 9 · Fiabilité du dev assisté-IA solo full-Claude (fact-check : solid)
**SOTA** : (1) productivité IA ressentie trompeuse — RCT METR 2025 mesure **+19% de temps** alors que les devs croient gagner ~20% ; (2) DORA 2024 : corrélation négative (−1,5% throughput, −7,2% stabilité) surtout via la taille des batches ; GitClear ×8 duplication ; (3) reward hacking documenté (GPT-5 triche 76% sur ImpossibleBench, modèles réécrivent les assertions). La vérification **isomorphe/externe** prévient le reward hacking ; la vérif **extensionnelle** (juste faire passer les tests) l'induit.
**Où se situe Musaium** : EN AVANCE sur l'état des pratiques. Correspondances fortes : RED test-first, **frozen-test = anti-ImpossibleBench**, fresh-context = vérif isomorphe, UFR-021 anti-faux-verts-Jest, UFR-013 anti-gap-perception. **Mais** Musaium a construit le rempart anti-test-truqué (mutation) **puis l'a débranché**.
**Gaps** : (1) discipline taille de batch **non outillée** (gap SOTA #1 DORA) ; (2) solo = maillon faible, UFR-013 est auto-discipline ; (3) duplication non suivie ; (4) supply-chain sans vérif d'existence package.
**Sources** : METR (metr.org/blog/2025-07-10-…, arXiv:2507.09089), DORA 2024 (dora.dev/research/2024), GitClear 2025, ImpossibleBench (emergentmind.com), arXiv:2602.03557 (TDD +12-26 pts).

### 10 · Stratégie de test enterprise-grade (fact-check : solid)
**SOTA** : couverture = indicateur pas objectif (Google 60/75/90%, gate sur code nouveau) ; mutation testing = mesure la plus rigoureuse ; contract testing **consumer-driven** Pact ≠ validation schéma provider ; flaky management <2% en e2e mobile ; property-based + chaos.
**Où se situe Musaium** : au-dessus médiane — chaos testing **réel** en e2e, UFR-021/022 anti-rubber-stamp, factories DRY ESLint, Stryker scope cache-first (sur le papier).
**Gaps** : (a) `test:contract:openapi` = validation **schéma provider-side**, pas Pact consumer-driven ; (b) property-based limité à **1 fichier** (`sanitize-prompt-input.property.test.ts`) ; (c) **aucune gestion de flakiness systématique** (pas de quarantaine/re-run/flake-rate) — risque réel sur 44 flows device-dependent.
**Sources** : Google Testing Blog (coverage + flaky), Kent C. Dodds Testing Trophy, Stryker docs, Pact/Pactflow, fast-check.dev, Maestro 2025 guide.

### 11 · /team custom vs natif Anthropic (fact-check : solid) — voir §5
### 12 · Sécurité LLM production (fact-check : solid)
**SOTA** : OWASP Top 10 LLM 2025 (LLM01 injection, LLM07 leak, LLM08 embedding, LLM10 unbounded) + NIST AI RMF ; defense-in-depth multi-couches, sanitization Unicode contre IPI, fail-closed sur couches critiques ; éval adversariale promptfoo/garak/PyRIT.
**Où se situe Musaium** : tient face au SOTA et le **dépasse** sur fail-closed explicite, rate-limiting et denial-of-wallet (LLM10 partiellement couvert). Contenu d'œuvre isolé via `[CURRENT ARTWORK]` avant boundary marker + corpus `c2-enrichment.yaml`.
**Gaps** : (1) normalisation Unicode/zero-width `sanitizePromptInput` **annoncée en doc mais non confirmée dans le code lu** (gap doc/réel, UFR-013) ; (2) LLM08 retrieval poisoning non couvert (mitigé V1 : embeddings = catalogue statique sans PII) ; (3) éval mono-tour, canal voix STT + multi-turn non couverts.
**Sources** : genai.owasp.org (LLM01/LLM10), NIST-AI-600-1, arXiv:2505.06311 (instruction detection), promptfoo.dev.

### 13 · RGPD/CNIL/AI Act (fact-check : solid)
**SOTA** : majorité numérique FR = 15 ans (consentement conjoint en-deçà) ; AI Act art.50 (info « vous parlez à une IA ») dès 2 août 2026 ; notification CNIL ≤72h ; DPA art.28 + SCC/TIA hors-UE.
**Où se situe Musaium** : **nettement au-dessus de la moyenne B2C solo**. Vérifié-code : âge-15 server-side (`register.useCase.ts:18`), AI Act art.50 anticipé (AiDisclosureFooter), effacement art.17 two-phase (ADR-060, embeddings = catalogue statique sans PII donc pas de désapprentissage), DSAR art.15/20, audit hash-chain, subprocessor ledger 22 vendors + sentinelle CI, breach-72h timer.
**Gaps = ops/legal, PAS code** : TIA OpenAI non finalisé, confirmer runtime Sentry=`*.eu.sentry.io` + S3=`eu-west-3`, verrou DeepSeek prod-EU à durcir en gate, DPA TBD, DPO interne à formaliser. **Aucun blocker code RGPD pour le launch.**
**Sources** : cnil.fr (recommandations IA, recommandation 4 mineurs), artificialintelligenceact.eu/article/50, EDPB Guidelines 9/2022.

### 14 · RN/Expo production (fact-check : mostly-solid)
**Où se situe Musaium** : largement SOTA — New Arch ON (RN 0.83 + Expo 55), Sentry + scrubber + sentinel, 44 flows Maestro, offline-first TanStack + persist, tokens device-bound, cert pinning 2-pin.
**Gaps** : (1) **OTA désactivé volontairement** (ADR-009) → pas de canal hotfix JS rapide ; (2) build iOS Xcode Cloud **sans pod install**, Pods committés + patches manuels = chaîne la plus fragile (PR #258 → crash SIGABRT TestFlight) ; (3) upload dSYMs à vérifier ; (4) pas de perf budget formalisé.
> ⚠️ **Claims fabriqués écartés** (non utilisés) : « Detox flakiness la plus basse <2% » (le classement réel inverse Maestro <1% / Detox <2%) ; métriques « ~43% cold start / ~26% mémoire » non sourcées ; « ~85% packages New-Arch-compatibles » (la source dit ~83% d'**adoption**, pas compatibilité).

### 15 · Backend Node/Express/TypeORM/PG/pgvector (fact-check : mostly-solid)
**SOTA** : TypeORM 1.0.0 **sorti 2026-05-19** (pas « planned H1 2026 ») ; HNSW = défaut prod RAG ; halfvec FP16 (pgvector ≥0.7.0).
**Où se situe Musaium** : **ÉCART DOC↔CODE CRITIQUE** sur pgvector — CLAUDE.md gotcha affirme « IVFFlat + vector_cosine_ops » mais la migration `AddArtworkEmbeddings.ts` crée bien un **index HNSW `halfvec_ip_ops`** (m=16, ef_construction=64) sur `halfvec(768)`. **Le code est CONFORME au SOTA ; c'est la DOC qui ment** (violation UFR-013/UFR-018). Sentry/OTel conforme, BullMQ solide. Note CLAUDE.md « TypeORM v1.0 planned/not urgent » désormais **stale** (released, repo 0.3.x archivé).
**Non vérifié (hors repo)** : config pooling prod (PgBouncer/`prepare:false` non trouvé) et config Redis (AOF + noeviction requis pour fiabilité BullMQ).
> ⚠️ **Claims fabriqués écartés** : métriques bundle/cold-start TypeORM (~450KB/~850ms etc.) non soutenues par la source Encore ; « consensus 2026 classe TypeORM legacy » = paraphrase étirée.

### 16 · Véracité « full-Claude solo » (fact-check : mostly-solid) — voir §6
> ⚠️ **Claims fabriqués écartés** : attributions CodeRabbit/Escape.tech mal sourcées (chiffres « 65%/58% », « 1400 apps », « misconfigs +75% », « vulns ×2,74 » mal attribués). Les ordres de grandeur généraux (« ~45-65% du code IA a une faille ») restent directionnellement soutenus par Veracode/CSA mais ne sont pas cités précisément ici.

---

## 5. Verdict spécial — le skill « team » vaut-il sa complexité ?

**Verdict : HYBRID — plus-value réelle mais marginale et partiellement illusoire.**

Le skill /team a une vraie sur-couche au-dessus du natif Anthropic 2025-2026, mais cette valeur se réduit à **~1,5 mécanique non-native** (frozen-test + lib-docs versionné), et le frozen-test — son argument vedette — **n'est pas câblé au harness** : honor-system que le seul hook `Edit|Write` réellement branché (`lint-on-edit.sh`) bypasse silencieusement en reformatant les tests. **~80% du pipeline 5-phase duplique** le plugin superpowers (marketplace officiel) + la sémantique native des subagents.

### Valeur genuine à conserver
- **Frozen-test sha256 anti-self-modification** : ferme un anti-pattern **observé** (éditeur green rend ses propres tests verts), pas théorique. Aucun équivalent natif/superpowers. **MAIS valeur conditionnelle à son câblage réel** — actuellement honor-system.
- **lib-docs versionné** (~110 libs + LESSONS.md humains + INDEX.json sha256) : pas d'équivalent natif. Preuve d'efficacité partielle traçable (`sentry-otel-followups`).
- **Intégration domaine Musaium** (22 UFR, sentinelles, gates pnpm/tsc, roadmap) qu'un plugin générique ne porte pas.
- **Gates shell self-testés** (logique correcte, c'est le câblage qui manque).

### Redondances avec le natif
- Isolation fresh-context inter-phase = **sémantique NATIVE des subagents** (chaque subagent = contexte propre, seul l'output final remonte). La réinventer en `BRIEF-ACK`/`BLOCK-CONTEXT-LEAK` est redondant **et plus faible** (honor-system vs garantie harness).
- spec→plan→red→green→review = **~80% couvert par superpowers** (TDD, subagent-driven-development two-stage, verification-before-completion).
- Hooks PreToolUse/PostToolUse/Stop/SubagentStop = 100% natif.
- Agents `doc-fetcher`/`doc-curator`/`learning-curator` = sur-découpage. `verifier`/`security` chevauchent le two-stage review.

### Recommandations
1. **P0 — CÂBLER le frozen-test avant de le créditer** : ajouter `post-edit-green-test-freeze.sh` en hook `SubagentStop` (ou `PostToolUse Edit|Write`) dans `settings.json`, ET patcher `lint-on-edit.sh:28-35` pour skip les fichiers du manifest. Sans ce fix, « frozen-test infalsifiable » est un **overclaim de la doctrine CLAUDE.md elle-même**. C'est LE point de bascule keep-vs-théâtre.
2. **P1 — Adopter superpowers** pour les ~80% redondants, garder en custom QUE frozen-test (câblé) + lib-docs. L'isolation fresh-context devient native.
3. **P2 — Élaguer** les agents redondants ; aligner le drift modèle opus-4-7→4-8.

---

## 6. Faisabilité « full-Claude solo » — verdict honnête adossé à la littérature

**La littérature 2024-2026 penche CONTRE la sur-confiance, mais ne déclare PAS l'entreprise impossible.** METR borne explicitement son +19% de ralentissement (pas de preuve pour greenfield / devs moins expérimentés, forts effets d'apprentissage possibles). DORA 2025 : l'IA est passée throughput-positive mais **reste stabilité-négative**, et n'aide QUE si des **control systems robustes existent** — l'IA amplifie l'excellence ou la friction préexistantes.

**Verdict : MATURITÉ GENUINE, PAS FAÇADE.** Signaux repo mesurés (commandes, pas estimations) : 688 fichiers tests BE, 361 tests FE, 44 flows Maestro, 26 sentinelles, 65 ADR, 23 workflows CI, 0 TODO dans `museum-backend/src`, dette eslint sous gouvernance. **Chaque mode d'échec documenté a une contre-mesure présente** : CSRF centralisé, audit hash-chain + gate DB_SYNCHRONIZE, defense-in-depth 6 couches fail-closed, frozen-test sha256. Ce sont **exactement les control systems que DORA 2025 pose comme condition** pour que l'IA amplifie positivement, et l'antidote structurel au biais-perception METR (un hook prouve, on ne croit pas).

**Réserves honnêtes (non couvertes par les gates)** :
- **Bus-factor ~1** : 1542 commits, un seul humain → comprehension debt résiduelle. Mode d'échec n°1 du solo-IA.
- **Discipline récente** (UFR-022, mai 2026) **non éprouvée en maintenance long-terme** — la fenêtre où METR mesure le ralentissement.
- **Volume de tests ≠ preuve de couverture** (la mémoire repo note 845 fails integration en mode `forceExit=false`).

**Gap concret** : le scope est faisable et largement bâti ; le risque réel est la **STABILITÉ au volume réel** (non résolu par la vitesse) et la **SOUTENABILITÉ maintenance**, pas la construction.

---

## 7. Roadmap LEVEL-UP enterprise-grade

| Priorité | Effort | Action | Rationale (dimension/source) |
|:---:|:---:|--------|------------------------------|
| **P0** | M | **Réarmer le mutation gate Stryker** (régénérer le cache incrémental offline puis retirer `if:false`) OU le requalifier explicitement « désactivé » partout — pas de garde fantôme. | Le filet anti-test-truqué le mieux documenté (reward hacking, benchmark 09) est présent mais débranché. Statu quo = faux sentiment de sécurité sur le pilier #1. (dim. 1+8) |
| **P0** | S | **Câbler `post-edit-green-test-freeze.sh`** en `PostToolUse Edit\|Write` (avant `lint-on-edit.sh`) + skip-explicite des `*.test.*` du prettier/eslint `--fix`. | La garantie vedette UFR-022 est aujourd'hui contournée par le seul hook câblé. Fix de quelques lignes. (dim. 7, verdict /team) |
| **P0** | S | **Épingler integration/e2e/coverage-merge/promptfoo/migration-drift** comme required checks + `enforce_admins=true` + `strict=true` ; faire dépendre `deploy-prod` d'integration. | `deploy-prod` peut partir sur un SHA jamais gardé (squash-merge + admin bypass). Faille de gating la plus directe entre « CI vert » et « prod cassée ». Coût = config GitHub. (dim. 8) |
| **P0** | M | **Rendre l'e2e mobile non-aveugle** : (a) `maestro-summary` remonte `failure` quand un shard fail, (b) corriger le gate Expo Doctor (3/19) qui bloque le nightly, (c) strip les commentaires YAML du sentinel screen-coverage. | 0 exécution e2e mobile réussie depuis 4 nuits + faux `success` + faux `covered` = la couche UFR-021 anti-faux-verts est elle-même un faux vert. Launch mobile J-7. (dim. 2) |
| **P0** | M | **Gater le go-live sur des critères de stabilité observables** (crash-free rate, error budget, smoke prod 7j, dSYMs) plutôt que la date ; vérifier runtime Sentry=`*.eu.sentry.io` + S3=`eu-west-3` + finaliser TIA OpenAI. | DORA 2025 : l'IA dégrade la stabilité, pas le throughput. Lever les transferts hors-UE non couverts (exposition art.44-49). (benchmark 13+16) |
| **P1** | S | **Corriger les écarts doc↔code (UFR-013)** : CLAUDE.md gotcha pgvector IVFFlat→HNSW `halfvec_ip_ops`, note TypeORM v1.0 released, confirmer/forcer normalisation Unicode+zero-width. | La doctrine d'honnêteté ne peut tolérer un gotcha qui décrit un index inexistant (risque erreur opérateur au rebuild). (benchmark 15+12) |
| **P1** | L | **Réduire le bus-factor ~1** : extraire la comprehension debt critique (auth, RGPD erasure, pipeline guardrails, migrations) en runbooks exécutables + diagrammes ; prouver qu'un tiers peut débugger sans l'auteur. | Comprehension debt = mode d'échec n°1 du solo-IA. Risque existentiel post-launch non couvert par les gates. (benchmark 09+16) |
| **P1** | S | **Nettoyer le théâtre de gardes** : réparer/supprimer `cache-key-parity`, câbler ou supprimer `sbom-attest-check`+`audit-factory-coverage`, passer `doc-last-verified`/`subprocessor-ledger` aussi en pre-push. | Un « tout vert » qui inclut des gardes ne testant rien érode la valeur probante du rempart anti-vibe-coding. Bas coût. (dim. 3) |
| **P1** | M | **Sentinelle de taille de batch/changeset** + métrique de duplication (copy-paste ratio) comme gate informatif. | Batch-size = mécanisme dominant de la dégradation stabilité DORA 2024 ; duplication ×8 GitClear. Deux angles morts directs non couverts. (benchmark 09) |
| **P1** | P1/S | **Quarantaine Maestro + suivi flake-rate** (re-run auto 2-3×, label non-bloquant, cible <2%). | Aucune gestion de flakiness systématique ; 44 flows device-dependent à l'approche launch. (benchmark 10) |
| **P2** | L | **Aligner /team sur superpowers** (TDD, subagent-driven-development, verification, code-review), garder custom QUE frozen-test câblé + lib-docs ; élaguer verifier/security ; fusionner drift modèle. | ~80% du pipeline duplique le plugin officiel. Réduit la dette sans perte fonctionnelle. (benchmark 11) |
| **P2** | M | **Étendre property-based** (fast-check) à LocationResolver/geo, jsonb drift, DOB/i18n, guardrail keyword ; étendre promptfoo au canal voix STT + multi-turn. | fast-check excelle sur surfaces déterministes (rappel DOB-2026-05-17) ; corpus mono-tour laisse la surface voix non couverte. Outils déjà en place. (benchmark 10+12) |
| **P2** | M | **Durcir le verrou DeepSeek prod-EU** en gate env-validation + proxy tuiles CARTO EU + gate startup vérifiant l'activation runtime des couches V2. | DeepSeek=Chine sans adéquation ; CARTO seul vendor exposant l'IP client ; V2 no-op silencieux possible. (dim. 6, benchmark 13) |
| **P2** | M | **Audit sécurité externe différé T+3/T+6** ciblant patterns vibe-coding (SSRF, secrets, PII, headers) + revue adversariale humaine sur chemins critiques (auth, paiement, RGPD, guardrails). | La dette IA se paie en différé (hangover 6-12 mois) ; UFR-013 = auto-discipline structurellement insuffisante pour la vérif adversariale. (benchmark 09+16) |
| **P2** | S | **Gate de cohérence Pods/Xcode Cloud** (Podfile.lock ↔ Pods committés ↔ ExpoModulesProvider) avant toute soumission iOS ; vérifier upload dSYMs. | Chaîne la plus fragile du repo (PR #258 → crash SIGABRT TestFlight). (benchmark 14) |

---

## 8. Conclusion

### 3 forces à capitaliser
1. **Sécurité applicative & supply-chain de niveau enterprise** — defense-in-depth 6 couches fail-closed (ordering respecté, vérifié in-code), SAST bloquants, et chaîne deploy-prod banking-grade (cosign keyless + SLSA L3 + verify pré-SSH + smoke éphémère + auto-rollback). C'est rare pour un solo et c'est réel.
2. **Fiabilité du code applicatif** — hexagone étanche 0-fuite, dette quasi-nulle (0 `as any`/`@ts-ignore` prod), résilience pensée et documentée (ADR-047/064, circuit breaker FSM, spans hors-verdict). La base est saine.
3. **Doctrine d'honnêteté réellement outillée** — `roadmap-claim-resolves` PASS, RGPD conforme-code au-dessus de la moyenne B2C, et une culture de vérification (UFR-013) qui a permis à cet audit de **démasquer ses propres overclaims**. C'est l'antidote structurel au biais-perception METR.

### 3 risques à fermer avant/après launch
1. **[AVANT] La preuve de qualité profonde est désarmée** — mutation gate `if:false`, e2e mobile aveugle avec faux `success`, frozen-test honor-system contournable, required checks manquants. Trois P0 (réarmer Stryker, câbler frozen-test, épingler les gates) ferment la majorité de l'exposition « régression silencieuse jusqu'en prod ».
2. **[AVANT] Transferts hors-UE non couverts + écarts doc↔code** — TIA OpenAI non finalisé, runtime Sentry/S3 EU à confirmer, gotcha pgvector qui décrit un index inexistant. Exposition juridique (art.44-49) + risque opérateur. Action ops/legal + doc, pas de refonte.
3. **[APRÈS] Bus-factor ~1 & soutenabilité maintenance** — comprehension debt dans une seule tête, discipline UFR-022 non éprouvée en maintenance long-terme, stabilité au volume réel non prouvée. Gater le go-live sur des critères de stabilité observables (pas la date), extraire les runbooks critiques, et programmer un audit externe différé.

**Le scope est faisable et largement bâti. Le travail restant n'est pas de construire — c'est d'ARMER ce qui prouve la qualité, de fermer les transferts hors-UE, et de rendre soutenable une codebase aujourd'hui portée par un seul cerveau.**

---

*Cartographie 360° — 8 dimensions introspectées + 8 sujets benchmarkés · scores réajustés post-overclaim · UFR-013 appliquée.*
