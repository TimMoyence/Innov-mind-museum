# Roadmap Reconstruction — Verification Tasklist

> **Statut** : plan de vérification read-only (2026-05-25). Produit par un agent fresh-context UFR-022. **Aucune vérification n'a été faite ici** — ce fichier est le plan que des vagues d'agents exécuteront. 13 jours avant le launch V1 (date launch 2026-06-07).
>
> **But** : reconstruire `docs/ROADMAP_PRODUCT.md` (§P0.A→P0.I + NOW/NEXT/LATER) en repartant de la VÉRITÉ DU CODE, pas de la doc. La roadmap a été prouvée fausse à ~1/3.

---

## Section A — Ground truth & contraintes (header partagé — CHAQUE agent d'exécution lit ceci)

### Date & doctrine

- **Date du jour** : 2026-05-25. Launch V1 : 2026-06-07 (minimum). Branche de travail courante : `dev`.
- **UFR-024 — NON-CONFIANCE DOC** : la roadmap a été prouvée fausse à ~1/3. **Tout claim DOIT résoudre en `path:line` reproductible** via `Read`/`Grep`/`git show`. Les `path:line` cités dans la doc d'origine = POINTS DE DÉPART, **pas des faits**. Si le code a bougé, le `path:line` doit être re-localisé par grep du symbole, pas supposé.
- **UFR-013 — Honnêteté absolue** : aucun verdict sans preuve. "Je n'ai pas pu vérifier" est un verdict valide (Confiance: moyenne + doute explicite). Ne jamais affirmer "fixé/shipped" sans avoir lu le code. Distinguer "le code dit X" (vérifié) de "j'attends X" (non vérifié).
- **Ladder de vérification** : memory < `Read` < `Grep` < `git show <ref>:<path>` / `git diff` / `git log`. Pour un claim "shipped sur une autre ref", la preuve MINIMALE = `git show <ref>:<path>` ou `git log <ref> --oneline -- <path>`.

### La vérité du code est ÉCLATÉE sur 3 refs git (FAIT VÉRIFIÉ par l'orchestrateur — ne pas re-dériver)

- **LOT 1 (sécurité/PII)** = TERMINÉ mais **NON MERGÉ**, vit sur **`origin/p0/security`** (commit `7c671f8d` "close P0 security/PII sweep — 12 items + ADRs 063/064/065 #293", + `7902120d` fix test audio-consent). `dev` est en avance de 43 commits sur cette branche ; la branche a 2 commits uniques. → **Les items LOT 1 (P0.A3-A9, I-SEC1/2/3/5/7/10/12, B17) se vérifient CONTRE `origin/p0/security`, PAS contre `dev`.**
- **LOT 3 (feature-gates/data)** = TERMINÉ mais **NON MERGÉ**, vit sur **`origin/p0/feature-gates`** (commit `49f16d8` "close P0 feature-gates + data-integrity #295" + `c963b188` oasdiff). `dev` en avance de 42 commits ; branche 2 commits uniques. → **Items LOT 3 (P0.C1-C9 + C4b, I-FIX1, I-FIX2) se vérifient CONTRE `origin/p0/feature-gates`.**
- **LOT 2 (GDPR), LOT 4 (stabilité/observ), LOT 5 (a11y), LOT 6 (burial/honnêteté)** = **aucune branche dédiée** → a priori NON démarrés, mais à confirmer sur **`dev`**. Exceptions à tester explicitement : (a) un PR-6 "burial 4 files" sur dev a peut-être traité une partie de LOT 6 ; (b) ADR-059 aurait fermé B1-B5/B8/B9/B11 (déjà recochés ✅ dans la doc) ; (c) TD-20 mergé 2026-05-21 (hors scope LOT 4).
- **`origin/audit/p0-night`** = ancêtre de `dev`, 0 commit unique → **MORTE, ignorer**.
- Les ~16 commits récents `PR-1..PR-16` sur `dev` = chantier **DRY refactoring** (sweep helpers), distinct des lots P0 — ne pas confondre avec une fermeture d'item P0.

### Commandes git utiles (vérifier une autre ref sans checkout)

```bash
# Lire un fichier tel qu'il est sur une branche non checkout-ée :
git show origin/p0/security:museum-backend/src/.../foo.ts
git show origin/p0/feature-gates:museum-backend/src/.../bar.ts

# Voir si un fichier a été touché sur la branche (et par quels commits) :
git log origin/p0/security --oneline -- <path>
git log origin/p0/feature-gates --oneline -- <path>

# Diff précis dev ↔ branche sur un fichier :
git diff dev origin/p0/security -- <path>
git diff dev origin/p0/feature-gates -- <path>

# Grep dans un fichier d'une autre ref (pipe) :
git show origin/p0/security:<path> | grep -n "<symbole>"

# Lister tous les fichiers touchés par la branche vs dev :
git diff --name-only dev origin/p0/security
git diff --name-only dev origin/p0/feature-gates
```

> **Piège ref** : un item LOT 1/LOT 3 peut apparaître "OPEN" sur `dev` (parce que le fix n'est pas mergé) ET "DONE" sur sa branche. Le verdict correct est alors **`DONE-BRANCH:origin/p0/security`** (ou feature-gates), PAS `OPEN`. La preuve doit citer la ref.

---

## Section B — Schéma de sortie executor (contrat commun — format EXACT par item)

Chaque agent de vérification produit, **pour chaque item de son domaine**, exactement ce bloc (consolidable mécaniquement) :

```
- **<ID>** — Verdict: <DONE-DEV | DONE-BRANCH:<ref> | OPEN | PARTIAL | FALSE-CLAIM | DEFERRED-V1.1 | NEEDS-OPS-HUMAN>
  - Preuve: <path:line> — <ce que le code montre réellement, 1 phrase, vérifié via Read/Grep/git show, PAS supposé>
  - Ref vérifiée: <dev | origin/p0/security | origin/p0/feature-gates>
  - Action roadmap: <nouveau marqueur ✅/❌/⚠️ + note courte pour le rewrite>
  - Confiance: <haute | moyenne (préciser le doute)>
```

**Sémantique des verdicts :**

| Verdict | Quand l'utiliser |
|---|---|
| `DONE-DEV` | Le fix est présent ET mergé sur `dev`. Preuve = path:line sur dev. |
| `DONE-BRANCH:<ref>` | Le fix existe sur `origin/p0/security` ou `origin/p0/feature-gates` mais PAS sur dev. Preuve = `git show <ref>:<path>`. |
| `OPEN` | Le claim doc est vrai, le bug/le gap existe encore (vérifié sur la ref appropriée). |
| `PARTIAL` | Une partie faite, une partie ouverte. Préciser quoi/quoi. |
| `FALSE-CLAIM` | Le claim d'audit est faux/STALE — le code ne correspond pas (ex : le fix était déjà là, ou le bug décrit n'existe pas). |
| `DEFERRED-V1.1` | Item explicitement reporté (ex I-SEC11) — confirmer qu'il reste latent/non-activé, pas régressé en live. |
| `NEEDS-OPS-HUMAN` | Action hors-code (Tim) : PGP, mailbox, DPA, rotation clé, S3 IaC console. L'agent confirme l'état CODE adjacent (gate présent ? placeholder présent ?) mais ne peut pas "faire" l'ops. |

**Règles communes :**
- Si l'ID n'apparaît dans AUCUN doc source → verdict spécial `À CONFIRMER (ID introuvable dans docs)` + note.
- Toujours citer la **ref vérifiée**. Un item LOT 1/3 vérifié sur `dev` au lieu de sa branche = erreur (re-vérifier sur la branche).
- "Action roadmap" doit donner au rewriter le marqueur final ET dire si l'item migre (ex : OPEN → reste P0 ; DONE-BRANCH → reste P0 jusqu'au merge ; FALSE-CLAIM → recoche ✅ + corrige le texte ; stealth-closed → rotate vers archive).

---

## Section C — Domaines de vérification (8 domaines indépendants, auto-suffisants)

> Total items recensés : **~98** (P0.A ×9, P0.B ×19, P0.C ×10, P0.D ×5, P0.I.A ×12, P0.I.B ×8, P0.I.C ×6, P0.I.D ×3, P0.F shipped re-verif ×~16 clusters, P0.G ×8, NOW/V1.0.x échantillon ×~20, TECH_DEBT ×~14). Découpés par **affinité sous-système ET ref** pour minimiser le contexte agent.

---

### DOMAINE 1 — LOT 1 : Sécurité / PII @ `origin/p0/security`  (LOURD git)

- **Ref à vérifier** : `origin/p0/security` (fix non mergé sur dev). Pour chaque item : `git show origin/p0/security:<path>` + `git log origin/p0/security --oneline -- <path>`. Si présent → `DONE-BRANCH:origin/p0/security`. Si claim était faux → `FALSE-CLAIM`.
- **Scope fichiers** : museum-backend (majoritaire) + museum-frontend (A5) + `.env`/`.env.example` + `deploy/docker-compose.prod.yml` + `package.json` overrides.
- **Taille** : 16 items.

| ID | Claim doc (résumé) | path:line de départ | sous-système |
|---|---|---|---|
| P0.A3 | Sentry tag URL leak + `event.tags` non scrubbé ; ajouter `code/state/email/phone` à SENSITIVE_QUERY_KEYS + scrubUrl appliqué | `sentry-scrubber.ts:23-31` + `error.middleware.ts:94,102,120` | BE observability |
| P0.A4 | Langfuse `mask:` SDK non wiré + `updateRoot:true` hazard ; wire mask + stripFreeText + sentinel PII | `langfuse.client.ts:55` + `langfuse-langchain.ts:61` | BE observability |
| P0.A5 | Version drift `app.config.ts` literal vs package.json ; dynamiser + créer sentinel `museum-frontend-version-sync.mjs` (n'existait pas) | `app.config.ts:121` + `package.json:4` | FE + sentinel |
| P0.A6 | Cost circuit breaker fail-OPEN ; `canAttempt()` jamais appelé ; wire `throw` avant invokeSection | `llm-cost-circuit-breaker.ts:107-114` | BE chat/cost |
| P0.A7 | Walk path `generateWalk` ne check pas le breaker | `langchain.orchestrator.ts:373-467` | BE chat |
| P0.A8 | Honnêteté docstrings (a) "NOT WIRED" mensonger ; (b) deleteAccount comment "chat_sessions removed first" partiellement faux | `llm-cost-circuit-breaker.ts:1-6` + `deleteAccount.useCase.ts:63-64` | BE docstrings |
| P0.A9 | OAuth callback `code`/`state` absents de SENSITIVE_QUERY_KEYS (subsumé par A3) | `sentry-scrubber.ts:23-31` | BE observability |
| I-SEC1 ◇◇ | Redis prod sans `maxmemory`/eviction → OOM bloque chat (INCRBYFLOAT fail-closed) | `deploy/docker-compose.prod.yml:358-379` | infra |
| I-SEC2 ◇◇ | Cost estimé en byte-length (`Math.ceil(payloadBytes/4)`) pas tokens → base64 image fausse la télémétrie + breaker A6 | `llm-cost-pricing.ts:65` | BE chat/cost |
| I-SEC3 ◇ | `POST /chat/art-keywords` `isAuthenticated` seul, no role/rate-limit/scope ; ajouter `requireRole(admin,moderator)` + limiter | `chat-message.route.ts:184` | BE chat route |
| I-SEC5 ◇◇ | `EXPORT_PSEUDONYM_SALT` fallback littéral committé `'musaium-admin-export-v1'`, no gate → pseudonymisation réversible | `admin-export.repository.pg.ts:21` + `exportChatSessions.useCase.ts:26` + `env.production-validation.ts` | BE admin/GDPR |
| I-SEC7 ◇ | TOTP rejouable (`markUsed` jamais relu, `window:1`) + access token non-révocable au logout | `totpService.ts:37-55` + `token-jwt.service.ts:68-94` | BE auth |
| I-SEC10 · | KE scraper `response.text()` sans guard Content-Length → OOM (≈ TD-LINK-02) | `html-scraper.ts:299,334` | BE knowledge-extraction |
| I-SEC12 ◇ | deps : override `ws@8.18.1` (GHSA-58qx-3vcg-4xpx) + `brace-expansion@5.0.5` ; 1 ligne non-breaking | `package.json` (pnpm/npm overrides) | BE deps |
| B17 | `ANTHROPIC_API_KEY` committé `.env:108`, zéro usage → retirer du `.env`+`.env.example` (rotation clé = ops Tim hors run) | `museum-backend/.env:108` + `.env.example` | BE config |

> Note : I-SEC4 (api-keys role) et I-SEC6 (login key hash) ont déjà été **re-cochés ✅ / RÉFUTÉS** dans la réconciliation 2026-05-21 → vérifier dans DOMAINE 7 (re-verif des ✅), PAS ici. I-SEC8/9 (KE cross-tenant) sont dans LOT 2 (DOMAINE 3). I-SEC11 (SSRF) = DOMAINE 4 (deferred V1.1).

---

### DOMAINE 2 — LOT 3 : Feature gates / data integrity @ `origin/p0/feature-gates`  (LOURD git + migrations)

- **Ref à vérifier** : `origin/p0/feature-gates`. Même méthode `git show`/`git log`/`git diff dev origin/p0/feature-gates`. Vérifier aussi les **migrations** ajoutées (museums.wikidata_qid, museum_id sur reviews/tickets).
- **Scope fichiers** : museum-backend (majoritaire) + museum-frontend + museum-web + migrations + `Dockerfile.prod` + `scripts/` (catalog-ingest, seed) + `.env`/`.env.production.example`.
- **Taille** : 12 items.

| ID | Claim doc (résumé) | path:line de départ | sous-système |
|---|---|---|---|
| P0.C1 | SigLIP provisioning : `fetch-models.sh` avale 404 quand SHA unset → /chat/compare 503 cold | `Dockerfile.prod:38` + `fetch-models.sh:36-40` | infra/embeddings |
| P0.C2 | SPARQL license classifier compare slugs alors que Wikidata renvoie URIs → 100% reject silent ; fixture test trompeuse | `catalog-ingest.ts:175-183` + `catalog-ingest.test.ts:108` | BE catalog |
| P0.C3 | catalog-ingest écrit `museum_id=NULL` (pas de `--museum-id`) + museums sans `wikidata_qid` ; migration + CLI flag + lookup UUID | `catalog-ingest.ts:310-317` | BE catalog + migration |
| P0.C4 | seed démo 3 musées Bordeaux sans Q-codes ; ajouter Aquitaine Q3329534 / CAPC Q2945071 / Cité du Vin Q16964634 + retirer Q-codes Paris + ajouter 1 monument (Pont de Pierre) | `seed-museums.ts:91-115` + `catalog-ingest.helpers.ts` | BE seed |
| P0.C4b | RISQUE CONTENU image-compare : count SPARQL `wdt:P195 + wdt:P18` par musée avant de promettre C3 ; Cité du Vin ≈ zéro œuvre | conséquence du seed Bordeaux | décision/contenu |
| P0.C5 | Telemetry funnel : installer PostHog/Plausible + events FE (paywall_modal_shown/cta_clicked/email_captured) + BE (quota_exceeded) + consent gate + dashboard | grep `posthog\|plausible` (doc dit =0) | FE+BE analytics |
| P0.C6 | `.env` corrections release (CORS_ORIGINS, BREVO_API_KEY, APP_VERSION, GOOGLE_OAUTH_CLIENT_ID) + drop dead vars (TTS_ENABLED, GOOGLE_CSE_*, SEARXNG_INSTANCES, SMTP_BREVO, ANTHROPIC) + mirror `.env.production.example` | `museum-backend/.env` + `.env.production.example` | BE config |
| P0.C7 | reviews + tickets + support_tickets `museum_id` MANQUANT ; migration + scope read/update + NPS true 0-10 per museum (décision user : IMPLÉMENTER, NPS per-museum gardé) | migration + entities reviews/tickets | BE multi-tenant + migration |
| P0.C8 | `/api/admin/analytics/*` + `/api/admin/stats` sans scoping museumId → admin voit tous tenants ; ajouter museumId Zod + WHERE museum_id + RBAC | admin analytics/stats routes | BE admin |
| P0.C9 | `museum_manager` absent allow-list `AdminShell.tsx` → 403 entrée ; ajouter+scope OU dropper role pre-launch | `AdminShell.tsx:195-201` | web admin |
| I-FIX1 ◇◇ | `invalidateMuseum` dead code (0 caller) ET bouton cache-purge purge mauvais namespace (`chat:llm:` au lieu de `llm:v2:`) → édits stale 24h | `llm-cache.service.ts:77` + `cache-purge.route.ts:25` | BE chat cache |
| I-FIX2 ◇◇ | `[CURRENT ARTWORK]` dans system prompt mais PAS dans cache key → 2 visiteurs œuvres ≠ partagent réponse | `llm-prompt-builder.ts:71` vs `chat-message.service.ts:373-401` (+ `llm-cache.service.ts:123`) | BE chat cache (correctness) |

> Note migration : pour C3/C7, l'agent DOIT vérifier qu'une migration existe sur la branche (`git diff --name-only dev origin/p0/feature-gates | grep migrations`) ET, si possible, noter si "run sur DB clean → generate Check vide" est documenté. Sinon Confiance: moyenne.

---

### DOMAINE 3 — LOT 2 : GDPR résiduel & consent @ `dev`

- **Ref à vérifier** : `dev` (aucune branche dédiée → a priori OPEN, confirmer). ADR-059 aurait fermé B1-B5/B8/B9/B11 → **ne PAS les re-traiter ici** (ils sont en re-verif DOMAINE 7).
- **Scope fichiers** : museum-backend + museum-frontend + museum-web + i18n (`shared/locales/*/translation.json`) + `ios/Musaium/Info.plist` + privacy policy (HTML/web/FE).
- **Taille** : 9 items.

| ID | Claim doc (résumé) | path:line de départ | sous-système |
|---|---|---|---|
| P0.B6 | 8 scopes third_party_ai non enforced au LLM call (seul location_to_llm gated) ; wire ThirdPartyAiConsentChecker dans pipeline | `location-resolver.ts:196-200` + `prepare-message.pipeline.ts` | BE chat/consent |
| P0.B7 | `POST /sessions/:id/audio` scope audio collecté FE, zéro check BE ; wire ConsentChecker(third_party_ai_audio_openai) OU retirer toggle | `AiConsentSheetContent.tsx:75-80` + chat-media route BE | BE+FE consent |
| P0.B10 | iOS `Info.plist` garde `NSLocationAlways*` alors que `app.config.ts` déclare when-in-use only → risque App Store 5.1.1(i) | `ios/Musaium/Info.plist:68-71` + `app.config.ts:316-319` | FE iOS |
| P0.B15 | Privacy policy : 14 vendors manquants sur 3 surfaces (HTML/web/FE) + créer route `/subprocessors` | HTML/web/FE privacy + Footer | web+FE+legal |
| P0.B16 | Version sync privacy (3-way drift) + corriger l'âge (HTML 16 vs correct 15 CNIL) | privacy HTML §10 / web / FE | web+FE+legal |
| P0.B18 | `/terms` route absente museum-web + cookie banner web | `Footer.tsx` | web |
| I-SEC8 ◇ | KE knowledge sans `museum_id` → `findById(currentArtworkId)` injecte knowledge d'un autre musée dans system prompt | `artwork-knowledge.entity.ts:14-67` + `prepare-message.pipeline.ts:308` | BE knowledge-extraction |
| I-SEC9 ◇ | `prepare-message.pipeline.ts` enqueue searchTerm (chat brut) jamais consommé → PII morte Redis 500 jobs ; drop le champ | `prepare-message.pipeline.ts:163,168` → `extraction.worker.ts:118` | BE knowledge-extraction |
| I-CMP2 ◇◇ | 10 clés consent GDPR manquantes en de/es/it/ja/zh/ar → banner en anglais ; check:i18n bloque déjà la CI | `shared/locales/*/translation.json` | i18n |

---

### DOMAINE 4 — LOT 4 : Stabilité / observabilité @ `dev`

- **Ref à vérifier** : `dev` (aucune branche → a priori OPEN). TD-20 déjà mergé 2026-05-21 → hors scope. Inclure I-SEC11 (DEFERRED-V1.1, confirmer qu'il reste latent).
- **Scope fichiers** : museum-backend + `infra/grafana/alerting` + `.github/workflows` + migrations + `deploy/Dockerfile.prod` + `DB_BACKUP_RESTORE.md`.
- **Taille** : 11 items (8 I-OPS + I-FIX3 + TD-OP-01 + I-SEC11).

| ID | Claim doc (résumé) | path:line de départ | sous-système |
|---|---|---|---|
| I-OPS2 ◇ | Aucune alerte API 5xx / `up{backend}==0` / DB-down / Redis-down + severity routing absent | `infra/grafana/alerting/*.yml` | infra |
| I-OPS3 ◇◇ | Migrations exécutées 2× (CI `migration:run` + CMD boot-time) → crash-loop sous restart:unless-stopped | `deploy/Dockerfile.prod:101` | infra/deploy |
| I-OPS4 ◇ | Budget timeout incohérent : LLM 10s×2 (total 25s) > REQUEST_TIMEOUT_MS=20s + 2 sidecars guardrail en série | `env.ts:164-166` + `guardrail-evaluation.service.ts:118,154` | BE chat |
| I-OPS5 ◇ | Volume uploads/media non-backupé + backups même bucket que médias (SPOF) + perte clé GPG = DR morte | `DB_BACKUP_RESTORE.md:46-47,61` | infra/DR |
| I-OPS6 ◇ | pgvector ≥0.7.0 jamais gaté (`CREATE EXTENSION vector` + halfvec sans version check) | `1778406339944-AddArtworkEmbeddings.ts:39,53` | migration |
| I-OPS7 ◇ | Indices manquants : chat-purge seq-scan (purgedAt/updatedAt), api_keys.user_id CASCADE, listSessions composite | migrations + `chat.repository.typeorm.ts:265` | migration/perf |
| I-OPS8 ◇ | CI gates théâtre : ai-tests `workflow_dispatch` (never PR), sentinel-mirror absent des required-checks, expo-doctor continue-on-error, pas de gate anti-drift migration | `.github/workflows/*` | CI |
| I-FIX3 ◇ | STT/TTS non-métrés ; cap per-user $0.002 fixe/HTTP (pas par fan-out) ; anon bypass ; judge $5/jour fail-OPEN ~1100 MAU | `llm-cost-guard.ts` + `text-to-speech.openai.ts` | BE chat/cost |
| TD-OP-01 🚨 | opossum WikidataBreakerClient sans `dispose()`/shutdown → leak handles (Stryker) | `wikidata-breaker.ts` (TECH_DEBT.md:1041) | BE chat |
| I-SEC11 ↓ DEFERRED | SSRF citation URL HEAD probe : `urlHeadProbe?` undefined au V1, gardé `if(...&&urlHeadProbe)` → confirmer reste latent non-activé | `message-commit.ts:28` | BE chat (deferred) |

---

### DOMAINE 5 — LOT 5 : a11y / compliance @ `dev`

- **Ref à vérifier** : `dev` (aucune branche → a priori OPEN). axe-core / contraste si dispo.
- **Scope fichiers** : museum-frontend (majoritaire) + museum-web + `.github/workflows` (SBOM).
- **Taille** : 4 items.

| ID | Claim doc (résumé) | path:line de départ | sous-système |
|---|---|---|---|
| I-CMP1 ◇◇ | AiDisclosureFooter `opacity:0.7` sur textSecondary → contraste 3.55-4.09:1 (<4.5 AA) ; fix 1 ligne | `AiDisclosureFooter.tsx:33-37` | FE a11y |
| I-CMP3 ◇◇ | audio-description a11y 5-7 violations : Speech.stop() zéro caller, double-playback race 2 moteurs TTS, Switch sans accessibilityLabel, pas de live region, bubble label masque texte | `useChatSession.ts:106-124` + `SettingsAccessibilityCard.tsx:32` + `ChatMessageBubble.tsx:188` | FE a11y |
| I-CMP5 ◇ | web skip-link absent (WCAG 2.4.1) + statement a11y pointe musaium.app/support@musaium.app au lieu de musaium.com | `accessibility-statement-*.md:31` | web a11y |
| I-CMP6 ◇ | SBOM généré mais non-signé (CycloneDX artifact, pas cosign attest) + web/mobile zéro SBOM ; gap CRA Art.13 (deadline 2027 → prio basse) | `ci-cd-backend.yml:99-110` | CI/SBOM |

---

### DOMAINE 6 — LOT 6 : Burial dead-code / honnêteté @ `dev`  (+ vérif PR-6 burial sur dev)

- **Ref à vérifier** : `dev`. **Piège** : PR-6 "burial 4 files" sur dev a peut-être déjà supprimé une partie de D1/D4 → vérifier l'EXISTENCE RÉELLE de chaque résidu par grep AVANT de le marquer OPEN (un fichier déjà supprimé = `DONE-DEV`/`FALSE-CLAIM` selon l'angle). Pour D5, réconcilier doc ↔ TECH_DEBT (voir aussi DOMAINE 8).
- **Scope fichiers** : museum-frontend (majoritaire) + museum-backend + docs.
- **Taille** : 6 items (D1-D5 + TD-AS-01).

| ID | Claim doc (résumé) | path:line de départ | sous-système |
|---|---|---|---|
| P0.D1 | SSE residuals FE ~619-1000 LOC dormant : `sseParser.ts`(81), `chatApi/stream.ts`(214), `sse-parser.test.ts`(139), `sendMessageStreaming.ts`(185), blocs SSE de `chatApi.test.ts`, `streaming.e2e.test.ts`(refs fichier supprimé) | `museum-frontend/features/chat/` | FE burial |
| P0.D2 | `museum-backend/reports/stryker-incremental.json` (18MB) force-tracked malgré .gitignore ; `git rm --cached` + bump .gitignore | `museum-backend/reports/stryker-incremental.json` | BE repo hygiene |
| P0.D3 | DÉCISION=DELETE V1 : supprimer `llama-prompt-guard.adapter.ts`(183 LOC) + tests(338) + stubs docker-compose/env ; MAJ ADR-051 + ROADMAP W6.1 (lock=DELETE) ; vérifier zéro wiring conditionnel cassé | `llama-prompt-guard.adapter.ts:42-183` + `chat-module.ts` | BE burial |
| P0.D4 | 3 `describe.skip` inconditionnels : art-keyword-repo-atomic-upsert, AddCriticalChatIndexesP0, AddP1FKAndTokenIndexes (~238 LOC) + streaming.e2e.test.ts | tests BE | BE tests |
| P0.D5 | Doc UFR-013 : items stealth-closed (TD-17/18/19/28/30/RN-01/RN-03/47/52 + TD-LF-02) rotate vers archive + ADR-036 §50 v1→v2 + ref obsolète AiDisclosureModal→AiDisclosureSheetContent (PURE-DOC → exemption pipeline /team possible) | `TECH_DEBT.md` + `ADR-036` + `AI_DISCLOSURE_AUDIT.md` | docs |
| TD-AS-01 🚨 | async-storage 24 keys / 11 prefixes non-namespacés → codemod `musaium.<feature>.<key>` + migration reader | TECH_DEBT.md:1251 | FE storage |

> **D5 ↔ DOMAINE 8 chevauchement** : D5 et TECH_DEBT reconciliation portent sur les MÊMES TD IDs. Coordination : **DOMAINE 8 fait l'inventaire factuel TECH_DEBT** (quel TD est ~~strikethrough~~/archivé) ; **DOMAINE 6/D5 décide l'action doc** (rotation + corrections ADR/refs). Pour éviter double travail, D5 consomme le verdict TD de DOMAINE 8.

---

### DOMAINE 7 — P0.F (shipped re-verif, zéro-hasard) + P0.G (claims falsifiés) + items réconciliés ✅ @ `dev`

- **Ref à vérifier** : `dev` (le shipped doit être sur dev — sinon c'est un faux "shipped"). **Profondeur zéro-hasard demandée par le user** : ces ✅ ne sont PAS de confiance, on les re-vérifie.
- **Scope fichiers** : museum-backend + museum-frontend + museum-web + migrations + i18n + workflows.
- **Taille** : ~16 clusters P0.F + 12 items réconciliés 2026-05-21 + 8 claims falsifiés P0.G.

**(7a) P0.F — clusters "shipped & cochés" à re-vérifier (échantillon EXHAUSTIF des clusters listés) :**

| Cluster | Claim shipped (résumé) | path:line de départ |
|---|---|---|
| C1.2 | LLM cache wired v2 key + Prom counters + Grafana panel id:4 | `llm-cache.service.ts` |
| C2.1-C2.5 | image enrichment Promise.all fan-out + Wikimedia + catalogue + Zod v2 + Prom + Langfuse | chat enrichment |
| C3.1 | SigLIP ONNX adapter normalize [-1,1] mean=std=0.5 | siglip adapter |
| C3.2 | pgvector halfvec(768) + HNSW + halfvec_ip_ops + scope museum_id | migration embeddings |
| C3.4 | chat-compare endpoint 5-stages + CompareResult + i18n 8 locales (C3.5 hook orphan → V1.0.x) | chat-compare route |
| C4.1 | KnowledgeRouter cascade KB→judge→WS via AbortSignal.any + per-leg budgets | knowledge-router |
| C4.3 | promptfoo halluc-eval CI workflow ; **MAIS assertions quoteInFacts+citeRealUrl NOT wired (dead-on-arrival)** ⚠️ — RE-VÉRIFIER le ⚠️ | promptfoo workflow |
| C4.4 | citation enforce Zod sources[] v2 + FE SourceCitation + i18n 8 | citation |
| C5.1-C5.4 | Wikidata KB cluster (breaker + WriteThrough + dump + alerts + dashboard) | wikidata KB |
| C6.1-C6.4 | paywall stub + quota + tier + admin override | paywall |
| C7.1 / C9.2-C9.17 | smoke:api e2e ; audio-desc autoplay, granular consent, AI Act badge, voiceMode, TTS Opus, cache key v2, etc. | chat C9.x |
| C10.A1-A6 + B1-B6 | chat UX refonte (composer/hero/bubble/carnet/resumption/ask-more/QR/proactive) | FE chat UX |
| W1.4-W1.6 | UX choix musée ; geofence hybrid ; QR-deeplink + [CURRENT ARTWORK] | museum |
| W2.1-W2.4 | onboarding admin web ; branding (⚠️ ZÉRO FE consumer mobile) ; stats per-museum (⚠️ bug C8) ; seed pilots script | web admin |
| W3.1-W3.4 / W4.1-W4.3 | RBAC+stats+moderation+CSV ; Landing+beta+B2B | web |
| W6.9 / W6.10 / W7.4 / Spec C voice | distributed tracing ; fairness dashboard ; STT prompt biasing ; PATCH /auth/tts-voice + VoicePreferenceSection | divers |

> Re-verif F = confirmer que le code existe ET correspond. Les ⚠️ embarqués (C4.3 dead assertions, W2.2 zéro consumer, W2.3 bug C8) sont des **gaps connus** : confirmer qu'ils sont toujours vrais (sinon FALSE-CLAIM).

**(7b) Items réconciliés 2026-05-21 (étaient ❌, recochés ✅) — RE-VÉRIFIER sur dev :**

`B1`(deleteAccount.useCase.ts:97), `B2`(brevo-beta-signup.notifier.ts:81), `B3`(exportUserData.useCase.ts:86), `B4`(image-storage.s3.ts deleteByPrefix + index.ts:128), `B5`(runS3OrphanPurge index.ts:467), `B8`(useAiConsent.ts:26 namespace + AuthContext.tsx:120), `B9`(thirdPartyAiConsent.ts:25 location_to_llm), `B11`(image-processing.service.ts:162), `I-SEC4`(auth-api-keys.route.ts:29 requireRole), `I-SEC6`(login-rate-limiter.ts:100 hash SHA-1), `I-OPS1`(sentry-init.ts:33), `I-CMP4`(tokens.semantic.ts:128-137 web OK).
Aussi : `P0.A1`(extractEmailDomain merge 71f103b35), `P0.A2`(DOB hard-throw merge 71f103b35).

**(7c) P0.G — claims falsifiés (vérifier qu'ils restent FAUX/non-retentés) :**

Sentinel S1.2 SigLIP homogeneity (n'existe pas) · C9.16 SSE résidus absent (FAUX pour FE → recoupe D1) · sentinel museum-frontend-version-sync.mjs (never existed → recoupe A5) · DPO Art.37 V1 (non applicable) · C9.13 Reranker (V1 throws RerankerUnavailableError) · Hexagonal POJO 23 entities (infaisable) · Chat éclatement 4 sous-modules / 44→22 6j (fiction) · "5 alerts manquantes" llm-cost.yml (en fait shippées).

---

### DOMAINE 8 — TECH_DEBT réconciliation + NOW/V1.0.x résiduels + cross-cutting @ `dev`

- **Ref à vérifier** : `dev`. Inventaire factuel TECH_DEBT (statut réel ~~strikethrough~~/archivé/ouvert) + échantillon représentatif NOW V1.0.x (gaps mineurs).
- **Scope fichiers** : `docs/TECH_DEBT.md` + `docs/TECH_DEBT_ARCHIVE.md` + museum-frontend + museum-web + sentinels.
- **Taille** : ~14 TD + ~20 NOW résiduels (échantillon).

**(8a) TECH_DEBT — réconcilier statut doc ↔ code (IDs cités D5) :**

| TD ID | État doc actuel (grep 2026-05-25) | À vérifier |
|---|---|---|
| TD-17/18/19/28/30 | ~~strikethrough~~ "fermé, archivé 2026-05-21" pointant TECH_DEBT_ARCHIVE.md | Confirmer que le code EST bien corrigé (stealth-closed) ET que l'archive contient l'entrée |
| TD-RN-01 / TD-RN-03 | ~~strikethrough~~ archivé 2026-05-21 | idem |
| TD-47 | **OUVERT** (re-scopé 2026-05-21 : init Sentry shippé FAUX→corrigé, résiduel = RSC happy-path `api.ts` ne forward pas trace headers) | Confirmer résiduel réel + `apiPut` local gotcha |
| TD-52 | ~~strikethrough~~ archivé 2026-05-21 | idem |
| TD-LF-02 | ~~strikethrough~~ archivé 2026-05-21 | Confirmer (D5 dit "Langfuse activation") |
| TD-20 | **RÉSOLU 2026-05-21** (run td20-langfuse-llm-paths, review APPROVED) — header §1041 | Confirmer résolu + noter TD-20a (museumId guardrail OPEN) + TD-20b (STT BYTES OPEN) |
| TD-OP-01 | **OUVERT** 🚨 (opossum dispose) — déjà dans DOMAINE 4 | cross-ref DOMAINE 4 |
| TD-AS-01 | **OUVERT** 🚨 (async-storage) — déjà dans DOMAINE 6 | cross-ref DOMAINE 6 |

> Piège honnêteté (UFR-013 / doc-anchor) : pour chaque TD marqué archivé, le lien `TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent` DOIT résoudre. Vérifier que l'ancre existe.

**(8b) NOW V1.0.x post-launch + "NEW small" + "Cluster C résiduels" — échantillon représentatif :**

V1.0.x : C3.5 useCompareImage hook orphan · C3.7 score-floor fallbackVisualThreshold jamais lu · C6.5 "503 fail-open" wording (en fait fail-CLOSED) · C7.5 device TTS smoke (NEEDS-OPS-HUMAN) · C10 ChooseAnother button `home.tsx:96-109` · C10 race expo-speech/server TTS · C10 Switch accessibilityLabel `SettingsAccessibilityCard.tsx:32` (recoupe I-CMP3) · C10 FE→BE write audioDescriptionMode · Accept-Language `fr-FR` strict-equals `chat-compare.route.ts:77-82` · Maestro audio-recording-flow.yaml cassé · reviews.userName ghost field `useReviews.ts:110-113` · TTS cache filename .mp3 post-Opus `useTextToSpeech.ts:61,169` · W2.2 branding doc fix.

NEW small : SUPPORTED_LOCALES dedup · hashEmail shared · Brevo unsubscribe UX · SwipeableConversationCard RTL borders · audit-factory-coverage.mjs orphan · metric-naming.mjs duplicate · workspace-links.mjs not in CI mirror · reportUnusedDisableDirectives · AUDIT_AUTH_LOGIN_FAILED raw email · EXPORT_PSEUDONYM_SALT mandatory (recoupe I-SEC5) · DeleteUserUseCase hard-delete · AUDIT_ACCOUNT_DELETED log AFTER cleanup · promtail PII redaction · shouldDropBreadcrumb paths.

Cluster C : C1.1 Grafana per-stage panels · C1.3 optim data-driven · C4.2 threshold tuning · C8.x VDP/CRA (NEEDS-OPS-HUMAN majoritaire) · C9.8 Presidio adapter (V1.1) · C9.18 deep-link artworkId.

> Échantillon : l'agent vérifie au minimum les items avec path:line concret (≈15) ; les "NEEDS-OPS-HUMAN" (C7.5, C8.x VDP) sont marqués sans action code.

---

## Section D — Ordonnancement en vagues (MAX 3 agents parallèles)

> Contrainte user : **MAX 3 agents en parallèle par vague**. Les 2 domaines lourds (LOT1/LOT3 sur branche, travail git `git show`/`git diff` important) sont isolés en tête pour qu'un agent ne porte qu'une seule charge git lourde.

| Vague | Domaines (≤3) | Charge | Notes |
|---|---|---|---|
| **Vague 1** | D1 (LOT1 @ p0/security) · D2 (LOT3 @ p0/feature-gates) · D3 (LOT2 GDPR @ dev) | LOURD git ×2 + dev | Les 2 lourds en parallèle d'un domaine dev léger. Chaque agent lourd ne touche qu'UNE ref. |
| **Vague 2** | D4 (LOT4 stabilité @ dev) · D5 (LOT5 a11y @ dev) · D6 (LOT6 burial @ dev) | moyen ×3 | Tous sur dev, scopes disjoints (infra/CI vs a11y vs burial). D6 attend rien de D4/D5. |
| **Vague 3** | D7 (P0.F/G re-verif @ dev) · D8 (TECH_DEBT + NOW résiduels @ dev) | LOURD (volume) ×2 | D8 produit l'inventaire TD que D5 (déjà fait en V2) consommera lors du REWRITE, pas pendant la vérif. D7 = gros volume mais grep simple. 3e slot libre OU split D7 en 7a/7b+7c. |

**Justification ordre :**
- Vague 1 démarre par le coûteux (git multi-ref) pendant que le contexte est frais.
- Vague 2 = tout sur dev, scopes physiquement disjoints → zéro contention.
- Vague 3 = re-verif (lecture confirmative), peut tourner en dernier sans bloquer le reste.
- **Dépendance unique** : D5/D6 (action doc D5) consomment le verdict TD de D8 ; comme c'est une dépendance de REWRITE (post-vérif) et non de vérif, elle n'impose pas d'ordre entre vagues. Si on veut l'ordre strict, faire D8 avant D6 (déplacer D8 en Vague 2, D6 en Vague 3).

**Domaines lourds signalés** : D1 et D2 (git multi-ref) ; D7 et D8 (volume d'items). Un seul domaine lourd-git par agent.

---

## Pièges repérés (à transmettre aux agents d'exécution)

1. **Items déjà re-classés 2026-05-21** : 12 items (B1-B5/B8/B9/B11, I-SEC4/6, I-OPS1, I-CMP4) + A1/A2 sont **déjà ✅**. Ils vont en re-verif DOMAINE 7, PAS dans leurs lots d'origine — ne pas les "rouvrir" par erreur.
2. **Doublons inter-domaines** : I-SEC8/9 sont listés dans LOT 2 (pas LOT 1) ; I-SEC11 dans LOT 4 (pas LOT 1) ; A9 ⊂ A3 ; I-FIX1/2 = cache (LOT 3) ; C9.16 SSE (P0.G) = D1 ; sentinel version-sync (P0.G) = A5 ; Switch accessibilityLabel apparaît en I-CMP3 (D5) ET NOW C10 (D8) ; EXPORT_PSEUDONYM_SALT en I-SEC5 (D1) ET NOW small (D8). Verdict unique, cross-ref l'autre occurrence.
3. **Ops-humains hors-code** (verdict `NEEDS-OPS-HUMAN`) : B12 (PGP), B13 (mailbox security@), B14 (DPA Langfuse), B19 (S3 PAB IaC), B17-rotation (clé Anthropic — le code DELETE = LOT1, la rotation = ops), C7.5 (device TTS smoke), C8.x VDP/CRA. L'agent confirme l'état CODE adjacent (placeholder/gate présent) mais ne "fait" pas l'ops.
4. **Ref ≠ dev pour LOT1/LOT3** : un item peut sembler OPEN sur dev mais être DONE sur sa branche → verdict `DONE-BRANCH`. Toujours vérifier sur la bonne ref.
5. **PR-6 burial sur dev** : une partie de D1/D4 a peut-être déjà été supprimée → grep l'existence réelle avant de marquer OPEN.
6. **TD-20 résolu mais TD-20a/20b restent OUVERTS** (museumId guardrail / STT BYTES) — ne pas marquer tout le cluster TD-20 fermé.
7. **TD-47 / TD-LF-02 / etc.** : le doc a des claims STALE corrigés en place (ex TD-47 "init Sentry FAUX→corrigé, résiduel RSC"). Lire le bloc complet, pas juste le titre.
8. **Doc-anchor** : les liens `TECH_DEBT_ARCHIVE.md#...` doivent résoudre (UFR-024 / sentinel doc-anchor) — à vérifier en D8.
9. **D3 décision lockée** = DELETE (pas wire). W6.1 dans la roadmap est déjà `[x]` lock=DELETE — cohérent, le rewrite doit refléter la suppression effective.
