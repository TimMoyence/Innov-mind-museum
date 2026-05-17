# Audit Musaium — 2026-05-12 — Rapport consolidé

**Mandat :** audit honnête multi-sujets piloté par 10 sous-agents (3 vagues parallèles + 1 final), zéro complaisance, UFR-013 strictement appliquée.
**Périmètre :** monorepo `museum-backend` + `museum-frontend` + `museum-web` (+ `design-system`, `packages/musaium-shared`, docs, mémoire auto).
**Méthode :** 10 sujets indépendants → 10 rapports détaillés (`details/01..10`) → synthèse exécutive. 3 248 lignes de findings vérifiés par grep / Read / WebSearch.

---

## TL;DR — Verdict en 5 lignes

1. **Le code est senior-grade.** BE et FE sont vraiment écrits par quelqu'un qui sait — typing 90+, error handling discipliné, hexagonal partiellement justifié, observability propre, 4 TODOs en 96k LOC.
2. **Mais la doctrine et le code ont divergé.** Mémoire, CLAUDE.md, ratchets, baselines : beaucoup de règles affichées sont périmées de quelques jours à plusieurs semaines. Le code dépasse souvent les docs.
3. **Trois blockers réglementaires concrets pour le launch 2026-06-01.** DPIA + ROPA en DRAFT (pas de signature DPO), aucune déclaration EAA (loi européenne accessibilité applicable depuis 2025-06-28), incohérence DeepSeek dans la politique de confidentialité.
4. **Un risque catastrophique non-réglementaire : pas de plafond OpenAI par utilisateur, pas de kill-switch global.** Une boucle abusive = facture à 6 chiffres. C'est l'unique sous-engineering vraiment dangereux.
5. **Sur le reste, le code est trop riche pour son stade.** 16 interfaces de repo BE avec une seule implémentation, 7 ports chat idem, `packages/musaium-shared` créé aujourd'hui mais consommé par 0 fichier. Coût : ~2 000 LOC de cosplay hexagonal qui ralentit chaque modif.

**Score global : 75/100.** Bon code à boundary réglementaire fragile, doctrine drift à corriger avant que le delta s'aggrave.

---

## Tableau de bord — Scores par dimension

| Dimension | BE | FE | Web | Global | Détail |
|---|---|---|---|---|---|
| Typing (any/unknown/null) | 90 | 94 | 92 | **92** | [01](details/01-typing.md) |
| Niveau de code | 84 (senior) | 80 (senior) | 76 (competent→senior) | **80** | [02](details/02-code-quality.md) |
| DRY (anti-duplication) | — | — | — | **55** | [03](details/03-dry.md) |
| KISS (over-eng, 0=minimal) | 72 | 58 | 22 | **51** | [04](details/04-kiss.md) |
| Architecture planned-vs-real | — | — | — | **78** | [05](details/05-architecture-triple.md) |
| Conformité réglementaire | — | — | — | **68** | [05](details/05-architecture-triple.md) |
| Patterns respectés | 82 | 58 | 88 | **76** | [06](details/06-architecture-organization.md) |
| Tests | 78 | 72 | 70 | **73** | [07](details/07-tests.md) |
| Santé dépendances | 78 | 74 | 86 | **79** | [08](details/08-libs.md) |
| Supply chain (0=safe) | — | — | — | **32** | [08](details/08-libs.md) |
| Signal/bruit docs | — | — | — | **72** | [09](details/09-docs.md) |
| Hygiène mémoire | — | — | — | **62** | [10](details/10-memory.md) |

**Lecture :** typing/code = vraiment senior. KISS Web = excellent (peu d'abstraction). KISS BE = trop riche. DRY = sous-DRY, pas sur-DRY. Patterns FE = doctrine barrel 25:1 violée. Conformité régulatoire = 3 blockers, sinon bonne base. Mémoire/docs = drift accumulé, doit être lavé.

---

## P0 — Bloqueurs launch 2026-06-01

À fixer **avant** le 1er juin. Ordre = effort/risque.

| # | Finding | Source | Effort | Risque si non fixé |
|---|---|---|---|---|
| **P0-1** | DPIA + ROPA en DRAFT, pas de signature DPO | 05 | 1 sem (counsel) | RGPD Art 35 — sanction CNIL + retrait App Store |
| **P0-2** | Aucune déclaration EAA / accessibilité, EAA enforceable depuis 2025-06-28 | 05 | 1 sem (WCAG 2.1 AA review) | Sanction nationale FR/DE/IT post-launch |
| **P0-3** | DeepSeek listé "active sub-processor" dans privacy FR/EN mais SUBPROCESSORS/DPIA dit "disabled in EU prod" | 05 | 30 min édito | RGPD Art 13 — inconsistance user-facing |
| **P0-4** | Aucun plafond OpenAI par utilisateur + aucun kill-switch global | 04 | 1 jour | **Boucle abusive = facture catastrophique**. C'est le sous-engineering le plus dangereux. |
| **P0-5** | `SUPPORTED_LOCALES` diverge BE(7) / FE(8 avec `ar`) / Web(2) ; Zod auth BE bloque `['fr','en']` → utilisateurs AR FE reçoivent **HTTP 400 en signup** | 03 | 1 h | Bug silencieux production immédiat |
| **P0-6** ✅ RESOLVED 2026-05-14 | `museum-web/src/lib/admin-types.ts:UserRole` super_admin / RBAC silencieux. Re-vérifié au commit du fix : `admin-types.ts:86` contenait déjà `super_admin` au moment de l'audit ; le bug résiduel était dans `auth.tsx:RoleGuard.includes()` qui ne promouvait pas implicitement `super_admin` malgré le JSDoc contract + BE `requireRole` middleware. /team run `2026-05-14-admin-user-detail-page` corrige `RoleGuard` (`auth.tsx:272`) + ajoute test de régression Vitest (`admin-auth.test.tsx`: `RoleGuard allowedRoles={['admin']}` + super_admin user → children rendered). Co-traité avec F4 Claim 1. ADR-050. | 03 | 30 min | Mauvaise vérification rôle admin Web |
| **P0-7** ✅ RESOLVED 2026-05-16 | Zombie no-op exports `setTokens` / `clearTokens` / `getAccessToken` dans `museum-web/src/lib/api.ts:38-56` — viole `feedback_bury_dead_code.md` et trompe les callers → resolved 2026-05-16 : zombie exports supprimés ; `api.ts` actuel contient `registerLogoutHandler` (l.34) + `readCsrfToken` (l.41) + `STATE_CHANGING_METHODS` (l.48), aucun `setTokens`/`clearTokens`/`getAccessToken`. Lignes ont migré (38-56 → 34-48 — décalage de la suppression des zombies eux-mêmes). | 02 | 30 min | Faux sentiment de sécurité auth Web |
| **P0-8** | `JwksResponse` + `GoogleTokenResponse` cast `as X` sans validation Zod à `social-token-verifier.ts:56` / `google-token-exchange.ts:80` — paths auth critiques font confiance à la shape externe | 01 | 2 h | Crash runtime ou bypass auth si tier change shape |

**Effort total P0 : ~10-12 jours** distribués entre code + counsel + édito. Tenable avant 2026-06-01 si attaqué cette semaine.

---

## P1 — À traiter pendant le sprint launch ou immédiatement après

| # | Finding | Source | Action |
|---|---|---|---|
| P1-1 ✅ RESOLVED 2026-05-16 | `sentry-scrubber.ts` triplicé (~170 L × 3 BE/FE/Web) avec commentaires "kept in sync" et **aucun gate CI** — dérive PII attendue → resolved 2026-05-16 : sentry-scrubber centralisé dans `packages/musaium-shared/src/observability/sentry-scrubber.ts`. BE/FE/Web re-exportent via `@musaium/shared` / `@musaium/shared/observability`. Parité gardée par `scripts/sentinels/sentry-scrubber-parity.mjs`. | 03 | Extraire vers `packages/musaium-shared` + CI hash-equal gate |
| P1-2 | `packages/musaium-shared/` créé 2026-05-12 (commit 58b12c6b) mais **consommé par 0 fichier** — phantom. "live or revert" doctrine | 03 | Wirer cette semaine OU rollback du scaffold |
| P1-3 | 16 interfaces de repo BE + 7 ports chat avec **une seule** implémentation chacun (`chat-module.ts` admet la fake-split anti-`max-lines:400`) | 04 | Inliner les 23 et garder uniquement `WebSearchProvider` + `KnowledgeBaseProvider` (vrais polymorphes) |
| P1-4 | 10 `FEATURE_FLAG_*` env vars morts, violent `feedback_no_feature_flags_prelaunch.md` | 04 | Supprimer en 1 commit |
| P1-5 | 253 LOC SSE-dormant restants alors qu'ADR-001 a été supprimée (`chat-message.sse-dormant.ts`) — viole `feedback_bury_dead_code.md` | 06 | Delete |
| P1-6 | FE doctrine barrel : chaque `features/*/index.ts` docblock dit "cross-feature MUST go through barrel" — réalité : **203 imports profonds vs 8 imports barrel** (25:1) | 06 | Soit aligner le code (codemod), soit retirer la doctrine de la docblock (mais : choisir, pas laisser mentir) |
| P1-7 ✅ RESOLVED 2026-05-13 | `langfuse@v3` deprecated, aucun patch sécurité futur — resolved 2026-05-13 : ADR-050 accept-EOL daté 2026-05-13, sunset 2026-09-01, tilde-pin + Renovate (cf. audit-360 S1 T1.1 reflag 2026-05-16) | 08 | Migrer v3→v5 OU ADR accept-EOL daté |
| P1-8 | ESLint major drift : BE 10.2.0 vs FE/Web 9.39.4 — **deux systèmes de config en parallèle** | 08 | Aligner les 3 sur v10 |
| P1-9 | Inline factory ratchet baseline `{ "baseline": [] }` mais 7 violations existent en BE — ESLint ne couvre pas `tests/integration/` | 07 | Étendre coverage ESLint + reset baseline |
| P1-10 | Stryker gate : `killRatio = killed / (killed+survived+nocoverage+timeout)` exclut Timeout des kills → **19,8% affiché vs 82,3% réel**. Métrique trompeuse, échantillon 20 mutants nécessaire | 07 | Recalibrer ou documenter |
| P1-11 | `TypeORM { id } as ChatMessage` partial-entity casts (5-6 sites chat repo) | 01 | Créer `makeChatMessageStub()` ou utiliser builder |
| P1-12 | CLAUDE.md ment : dit que `docs/ARCHITECTURE.md` / `docs/TEST_FACTORIES.md` / `docs/LINT_DISCIPLINE.md` sont "not yet extracted" — **les 3 existent depuis 2026-05-07** (5 jours stale) | 09, 10 | Edit CLAUDE.md |
| P1-13 | `docs/TECH_DEBT.md` a **deux entrées TD-5** (ID dupliqué) — scripts de clôture seront ambigus | 09 | Renommer une des deux |
| P1-14 | `feedback_process_env_local_vs_ci.md` triple-contradiction : memory dit `as string`, MEMORY.md dit "keep `String()`", code utilise `typeofString()` à `app.config.ts:52` | 10 | Edit memory pour refléter `typeofString()` |
| P1-15 | `project_ios26_crash_investigation.md` "DIAGNOSTIC PENDING" depuis 37 jours | 10 | Re-vérifier ou archiver |
| P1-16 | GitNexus block dupliqué dans CLAUDE.md + AGENTS.md = ~1 500 tokens × chaque session | 10 | Garder dans CLAUDE.md uniquement, retirer d'AGENTS.md |

---

## P2 — Cosmétique / dette long-terme

| # | Finding | Source |
|---|---|---|
| P2-1 | `museum-backend/src/helpers/` et `src/shared/` coexistent ; `app.ts` importe des middlewares depuis les deux | 06 |
| P2-2 | 22 dossiers single-file BE (premature categorization) | 06 |
| P2-3 | FE feature shape inconsistant : seules 5/13 features suivent la forme 4-folder de référence | 06 |
| P2-4 | 24 fichiers Stryker config + 4 stacks observability (Sentry + OTel + Prom + Langfuse) — beaucoup d'orchestration | 04 |
| P2-5 | Test `user-memory-entity.test.ts` teste les décorateurs TypeORM `@Column` via `getMetadataArgsStorage()` — **tautologie**, à supprimer | 07 |
| P2-6 ✅ RESOLVED 2026-05-16 | 2 packages "extraneous" dans `museum-frontend/node_modules` (`react-native-confetti-cannon`, `@react-native-google-signin/google-signin`) — supprimés de package.json mais pas du store → resolved 2026-05-16 : validé par S1 dryskiss § 5.5 (`npm ls` FE = empty, extraneous partis). À re-confirmer par user au green-code-time. | 08 |
| P2-7 ❌ INCORRECT (re-checked 2026-05-16) | Web tsconfig sans `noUncheckedIndexedAccess` (BE+FE l'ont) → re-checked 2026-05-16 : `museum-web/tsconfig.json:8` = `"noUncheckedIndexedAccess": true`. L'audit 05-12 a été erroné sur ce point — Web l'a depuis au moins 2026-05-16 (git blame pas exécuté, hors scope T1.8). | 01 |
| P2-8 | README.md référence ADR-001 supprimée + multi-tenancy déférée (ADR-044) | 09 |
| P2-9 | `museum-frontend/README.md` liens vers `QUALITY_GUIDE.md` et `ARCHITECTURE_MAP.md` supprimés aujourd'hui | 09 |
| P2-10 | CLAUDE.md dit "34 migrations" — réalité 56 ; mentionne `.env.local.example` (n'existe pas, c'est `.env.example`) ; mentionne `.claude/tasks/` (n'existe pas) | 10 |

---

## Top 5 patterns transversaux (apparaissent dans ≥ 3 audits)

### 1. Doctrine drift (apparu dans 02, 04, 06, 09, 10)

Le projet a accumulé énormément de règles textuelles (memory, CLAUDE.md, AGENTS.md, feedback files, ADRs). Le code dépasse souvent ces docs : feature flags supprimés mais env vars restantes, factories adoptées mais ratchet vide, fichiers extraits mais CLAUDE.md dit "not yet". **Le code est plus discipliné que la docs.** Inverse du pattern habituel.

**Action :** une session "vérité de chantier" hebdo : 30 min, mise à jour de CLAUDE.md/memory/ratchets contre le code réel.

### 2. Hexagonal cosplay localisé (02, 04, 06)

L'hexagonal BE est **vrai** dans `WebSearchProvider` (7 impls), `KnowledgeBaseProvider` (4 impls + breaker), `MuseumRepository` (in-memory vs typeorm pour les tests). Il est **cosplay** dans 16 autres ports/repos avec une seule impl. AGENT-04 a chiffré : ~2 000 LOC de surface inutile dont `chat-module.ts:716` qui admet la fake-split anti-`max-lines:400`.

**Action :** garder le pattern où il sert (multi-provider, swap test/prod), inliner partout ailleurs.

### 3. Sous-engineering AI cost control (04, 05)

C'est le seul axe où le code est **dangereusement light** vs un product B2C freemium pré-launch. Pas de plafond per-user. Pas de kill-switch. Pas de quota mensuel. Avec OpenAI + Deepseek + Google + DALL-E + TTS dans le pipeline, une boucle abusive = facture imprévisible.

**Action P0-4 :** middleware cost-limit + Redis counter + kill flag avant 2026-06-01.

### 4. Sous-DRY cross-app (03, 06)

3 fichiers triplicent du PII redaction (sentry-scrubber). `SUPPORTED_LOCALES` diverge 3 fois. `UserRole` ne s'accorde pas avec son consommateur. Le `packages/musaium-shared/` créé aujourd'hui était la bonne idée — il faut le wirer ou le supprimer.

**Action :** ce sprint, déplacer 3-5 modules cross-app vers `packages/musaium-shared` + workspace pnpm root + CI gate "hash égal".

### 5. Tests de qualité variable, mais discipline visible (07)

3 948 tests passent (ratchet 3 805 — sain). 0 `.only` / `fit` / `expect(true)` checked in. Maestro shards documentés et alignés. **Mais** : ratchet inline factory vide alors que 7 violations existent (ESLint coverage gap), Stryker gate optimisé pour paraître pire qu'il n'est, et 1 test tautologique. **La discipline est là, l'exécution a quelques trous.**

---

## Synergies entre findings (à fixer ensemble pour économie d'effort)

- **Bundle 1 (P0, ~2 jours)** : P0-4 (cost ceiling) + P0-5 (locales) + P0-6 (UserRole) + P0-7 (zombie exports) — tous BE/Web courts, déclenchables en un sprint code.
- **Bundle 2 (P0, ~1 semaine)** : P0-1 + P0-2 + P0-3 — tous regulatory, nécessitent counsel + édito + accessibility review. Synchroniser avec le DPO pendulaire.
- **Bundle 3 (P1, ~3 jours)** : P1-2 + P1-1 + P1-14 — `musaium-shared/` doit être wiré ; le wirer **avec** la migration sentry-scrubber dedans = un seul PR justifie l'existence du package.
- **Bundle 4 (P1, ~2 jours)** : P1-3 + P1-4 + P1-5 — cull massif (delete-only). 16 ports inutiles + 10 feature flags morts + 253 LOC SSE-dormant = un commit de "burial".
- **Bundle 5 (P1, ~1 h)** : P1-12 + P1-13 + P1-15 + P1-16 — doctrine cleanup en une passe de docs/memory.

---

## Surprises / strengths à conserver

Pas que des findings négatifs. Plusieurs éléments **rares** pour un solo-dev pré-launch :

- 4 TODOs sur 96 000 LOC ; 0 FIXME / XXX / HACK. C'est de la discipline brute.
- Sentry + OTel + Prometheus + Langfuse propre-ment intégrés, dédup résolue (cf. commits récents).
- Structured logging + correlation IDs propagés sur **193 sites**.
- AbortController + timeouts sur les network calls — pas une omission.
- Hexagonal **vraiment justifié** sur `WebSearchProvider` (7 impls) et `KnowledgeBaseProvider` (4 impls + breaker).
- OpenAPI auto-générée → types FE générés — vraie chaîne de typing cross-app.
- Renovate config exemplaire (vuln fast-track, 3-7d cool-down par stack-risk, group rules surgicales).
- pnpm `overrides` actifs sur les 3 apps (kill transitif des bad packages).
- ESLint plugin maison `eslint-plugin-musaium-test-discipline` (preuve d'investissement long-terme).
- Stryker mutation testing en place (rare en pré-launch solo).
- Maestro 4-shards + iOS nightly cron — testing mobile sérieux.
- 0 cast `as any` en code applicatif (uniquement en mocks) + ratchet à 0.

**Lecture honnête :** ce n'est pas un proof-of-concept. C'est un produit pré-launch tenu par un senior. Les findings ci-dessus sont des **bavures sur une base saine**, pas des fondations à reprendre.

---

## Méthodologie & limites

- **10 sous-agents indépendants** lancés en 3 vagues de 3 + 1 vague de 1 (parallélisation respectée).
- Chaque agent a reçu un prompt isolé, UFR-013 explicite, format de rapport strict, contrainte READ-ONLY, budget temps + LOC cap.
- **Vérifications croisées** : agents 01, 02, 04, 06 ont indépendamment confirmé le même finding sur `museum-web/src/lib/api.ts` zombie + sur le sur-engineering ports/repos BE → triangulation valide.
- **Limites :**
  - Pas de couverture coverage code (Istanbul %) — AGENT-07 a noté mais pas mesuré finement.
  - WebSearch sur réglementaire daté du jour ; le DPO doit valider.
  - Pas de scan SAST/DAST live (Semgrep / CodeQL existent en CI — assumés OK).
  - Pas de mesure de bundle FE/Web — AGENT-08 a inspecté package.json, pas le bundle final.
- **Reproductibilité :** chaque rapport listé sa méthode (grep patterns, fichiers échantillonnés, queries WebSearch). Tout est auditable.

---

## Index des rapports détaillés

| Fichier | Sujet | Lignes |
|---|---|---|
| [01-typing.md](details/01-typing.md) | any / unknown / null / typing faible | 159 |
| [02-code-quality.md](details/02-code-quality.md) | Niveau (junior / mid / senior / enterprise) | 233 |
| [03-dry.md](details/03-dry.md) | Duplication intra + cross-app | 378 |
| [04-kiss.md](details/04-kiss.md) | Over- et under-engineering | 510 |
| [05-architecture-triple.md](details/05-architecture-triple.md) | Planifié / réel / réglementaire (URLs cités) | 416 |
| [06-architecture-organization.md](details/06-architecture-organization.md) | Rangement + patterns respectés | 368 |
| [07-tests.md](details/07-tests.md) | inline / mocks / e2e / Stryker | 358 |
| [08-libs.md](details/08-libs.md) | Dépendances + CVEs + supply chain | 300 |
| [09-docs.md](details/09-docs.md) | .md inutiles + drift docs ↔ code | 271 |
| [10-memory.md](details/10-memory.md) | auto-memory + CLAUDE.md/AGENTS.md weight | 255 |

**Total** : 3 248 lignes de findings vérifiés.

---

## Recommandation au tech lead

1. **Cette semaine** — bundle 1 (P0 code court) + commencer counsel/édito sur bundle 2 (regulatory).
2. **Sprint launch** — finir bundle 2, exécuter bundle 4 (cull dead code), wirer `packages/musaium-shared` (bundle 3).
3. **Post-launch** — bundle 5 (doctrine cleanup) + P2 progressif.
4. **Process** — instaurer la session hebdo "vérité de chantier" (30 min) pour éviter que le drift CLAUDE.md/memory/ratchets se reforme. La doctrine doit suivre le code, pas l'inverse.

Le produit est bon. La trajectoire est bonne. Trois fenêtres réglementaires + un risque OpenAI = les seuls vrais obstacles à un 2026-06-01 propre.
