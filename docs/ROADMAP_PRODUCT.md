# Roadmap Produit — Musaium

> **Source de vérité unique.** Vivante, réécrite à chaque sprint (4 semaines). Snapshots précédents = git history.
> **Sprint courant :** 2026-05-03 → 2026-06-01 (launch day).
> **Horizon :** 1 mois NOW + 1 trimestre NEXT/LATER.
>
> **📑 Audit chat backend 360° (2026-05-16)** — `.claude/skills/team/team-reports/2026-05-16-chat-backend-audit-360/roadmap/NORTHSTAR.md` (8 agents read-only). Items consolidés ci-dessous dans **C9** (NOW chat hardening), **W6+W7** (NEXT V1.1), **Moonshot V1.2+** (LATER).
>
> **🔬 Audit fresh-context 50 sous-agents (2026-05-20)** — voir §"P0 Launch Readiness" ci-dessous. A retiré 4 documents satellites obsolètes (`ROADMAP_REMEDIATION_*`, `AUDIT_FINDINGS_*`) en consolidant tout ici. Inflation x6-x8 détectée vs les claims audit antérieurs ; 22 claims P0 falsifiés vérifiés en code. Cette roadmap = source unique post-consolidation.

---

## North Star (re-cadré 2026-05-20)

**Musaium V1 (launch 2026-06-01) = AI Art Companion intra-musée + carnet de visite.**

- **Intra-musée** : géoloc/QR détecte le musée (W1.5 shipped) → chat AI conversationnel sur les œuvres en photographiant + voice-first + multi-musées (W1.4 shipped, 3 pilots Bordeaux seedés) + audio description WCAG (C9.2 shipped) + transitions suggérées entre œuvres via prompt `suggestions[]` (W1.1 partiel) + carnet post-visite (C10.B1 shipped).
- Hors-musée = mode dégradé (chat sur photos d'œuvres déjà visitées + recommandations basées sur carnet).

**Musaium V2 = "Assistant balade culturelle hors-musée"** = walking guide pro-actif multi-POI avec chemin GPS + audio guide streaming (W1.2/W1.3 deferred — `features/walk/` n'existe pas, `museum_pois`/`walk_routes` tables absentes, infra multi-POI à construire).

Pourquoi le re-cadrage (audit finding E4) : la position commerciale "assistant balade culturelle" pré-V1 était mensongère puisque `features/walk/` n'existe pas. V1 honnête = "art companion intra-musée intelligent multi-musées". V2 = la vision balade hors-musée originale, post-launch 6-10 sem si signaux KR2 positifs.

- Multi-musées (pas une app par musée)
- Voice-first (mains libres pendant la visite)
- AI conversationnel contextuel (œuvres, lieux, histoire)

## Audience cible

| Segment | Modèle | État |
|---|---|---|
| **B2C visiteur** | Freemium (3 sessions/mois free, abonnement Premium illimité) | Hypothèse — soft-paywall stub V1 (C6) pour valider data-driven |
| **B2B musée** | Licence annuelle + co-branding optionnel | 3 pilots Bordeaux contractés (Musée d'Aquitaine + CAPC + Cité du Vin) |
| **Institutionnel** | Subvention culture / appel à projets | Backlog 2026 H2 |

---

## OKR Q2-2026 (Mai-Juin) — re-cadré 2026-05-20

**Objective :** Lancer Musaium V1 le 1er juin 2026 avec une expérience AI Art Companion intra-musée multi-musées qui donne envie de revenir + un pitch B2B prêt (image-compare + co-branding).

| KR | Cible | Mesure |
|---|---|---|
| **KR1 — Pilotes B2B** | ≥3 musées contractés (LOI signée) avant 1er juin | 3 pilots Bordeaux seedés (confirmer LOI signature) |
| **KR2 — Companion NPS** *(re-cadré : était "Walk V1 NPS", Walk hors-musée = V2)* | NPS post-session art companion ≥7/10 sur 50 sessions test | Survey in-app, mesurable via `review.rating` + Brevo follow-up |
| **KR3 — Stabilité** | Crash-free ≥99.5% + chat p99 <5s + 0 P0 bug | Sentry + Langfuse + Grafana |
| **KR4 — Adoption** | 100 visiteurs B2C inscrits semaine 1 post-launch | SQL `users` + telemetry funnel C6.5 (P0 à wirer) |

---

## P0 Launch Readiness (audit fresh-context 2026-05-20)

> **Consolidation** : ce bloc remplace `docs/ROADMAP_REMEDIATION_*.md` (4 fichiers supprimés). Issu d'un audit 50 sous-agents fresh-context × 5 vagues (Wave A P0 launch / Wave B C9 shipped / Wave C cleanup / Wave D refactor / Wave E produit/légal) qui a challengé chaque claim du précédent remediation roadmap contre le code réel. Inflation systémique x6-x8 détectée. 22 claims P0 falsifiés. 7 items déjà shippés jamais cochés.
>
> **Cumul P0 honnête** : ~16-25h dev + ~3h30 Tim ops. Pas 100+ items "20/20 transversal".

### P0.A — Bugs sécurité (dev ~6-8h)

| ID | Item | Preuve code (audit) | Effort |
|---|---|---|---|
| [x] **P0.A1** | **forgotPassword + login-handler emails clair-texte** (Sentry/Loki/Langfuse ingest) — créer `@shared/pii/extractEmailDomain.ts` + patcher 5 sites | `auth/useCase/forgotPassword.useCase.ts:33,53,60` + `login-handler.helpers.ts:65,75` (finding A1) | 45-60 min |
| [x] **P0.A2** | **DOB bypass exploitable curl direct** — drop `.optional()` + drop fallback `if (!dateOfBirth) return` + fix test qui enshrine le bug | `auth/adapters/.../auth.schemas.ts:15` + `register.useCase.ts:106` + `auth.route.test.ts:421-430` (finding A2) | 2-3 h (incl. ADR + OpenAPI regen + Maestro flow updated) |
| [ ] **P0.A3** | **Sentry tag URL leak via `req.originalUrl`** — utiliser `scrubUrl` depuis `@musaium/shared` (helper canonique, PAS `redactQueryString` comme prétendu). Patcher 3 sites + ajouter `code` au `SENSITIVE_QUERY_KEYS` pour OAuth callback | `shared/middleware/error.middleware.ts:94,102,120` (finding A3) | 45-60 min |
| [ ] **P0.A4** | **Langfuse leak via LangChain CallbackHandler `updateRoot:true`** — `LANGFUSE_ENABLED=true` en prod + payload brut emis. Utiliser `LangfuseCoreOptions.mask` SDK option native 3.38.20 → `mask: ({data}) => stripFreeText(data)` blacklist `data.input.messages[]`/`data.output.text`. **Pas subclass 4-8h comme prétendu** — `mask` native = ~50 LOC + tests | `shared/observability/langfuse-langchain.ts:61` + `langfuse.client.ts:55-61` (finding A4) | 30-60 min |
| [ ] **P0.A5** | **Version drift Android** : `app.config.ts:121` literal `'1.2.3'` vs `package.json:4` `1.2.4` (propagé `Info.plist:24`, `build.gradle:98`). Dynamiser `version: require('./package.json').version as string` + sentinel `museum-frontend-version-sync.mjs` | finding A7 | 30-45 min |
| [ ] **P0.A6** | **C9.4 cost circuit breaker fail-CLOSE wiring** : `LlmCostCircuitBreaker.canAttempt()` JAMAIS appelé (telemetry+gauge OK mais fail-OPEN). Wire `if (!await costBreaker.canAttempt()) throw` avant `invokeSection` dans `langchain.orchestrator.ts`. Update header docstring stale. **OU** documenter explicit "telemetry-only V1, fail-CLOSE V1.1" dans ADR-047 si pas le temps | `llm-cost-circuit-breaker.ts:5-7,107-114` + `langchain.orchestrator.ts:104-124,212` (finding B2) | 2-3 h |

### P0.B — Ops Tim launch (~3h30 cumul)

> **Honesty UFR-013** : aucun DPO (Délégué Protection Données) n'a été déclaré à la CNIL pour Musaium. L'audit légal (finding E3) conclut que l'**obligation RGPD Art.37 ne s'applique pas** au volume V1 (100 visiteurs S1 ≠ "large scale" au sens WP243). Donc rien à signer — auto-déclaration défensive reportée V1.1+ si pivot scale.
> Distincts : **DPA = Data Processing Agreement** (contrat sub-processor Art.28.3) — ceux-là sont **obligatoires V1** dès qu'un sous-traitant reçoit du PII (Langfuse Cloud actif en prod). Tableau ci-dessous ne mélange pas DPO et DPA.

| ID | Item | Effort |
|---|---|---|
| [ ] **P0.T1** | **PGP key réelle** Ed25519 2y → `museum-web/public/.well-known/pgp-key.txt` (remplace token `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP`). Runbook prêt : `docs/operations/PGP_KEY_GENERATION.md`. + CI grep gate dans `ci-cd-web.yml` (sentinel n'existe pas malgré claim antérieur) | 30 min Tim + 5 min CI |
| [ ] **P0.T2** | **Mailbox `security@musaium.com`** : alias OVH → Gmail Tim, smoke test mail entrant (RFC 9116 §2.5.3 Contact: MUST réel) | 10-30 min Tim |
| [ ] **P0.T3** | **DPA Langfuse Cloud signature** + ajouter Langfuse à `docs/compliance/SUBPROCESSORS.md` (actuellement absent). C9.0 a shippé avec `LANGFUSE_ENABLED=true` en prod → DPA Art.28.3 obligatoire | 30-60 min Tim |
| [ ] **P0.T4** | **DPA autres vendors** : OpenAI Trust Portal + Sentry PDF + Brevo + AWS console + OVH + Google Cloud (si activé). Tous self-serve. Archive PDFs dans `docs/legal/dpa-signed/` (à créer) | ~65 min sign + 45 min archive |
| [ ] **P0.T5** | **C7.5 device TTS test backgrounded iPhone** : ouvrir chat → AI répond TTS → lock screen → audio continue ? Rappel : PR #258 a déjà shipped crash SIGABRT non testé device | 5-10 min Tim |
| [ ] **P0.T6** | **CERT-FR vault 1Password** (volontaire, trust signal) | 15 min Tim |
| [ ] **P0.T7** | **Renewal calendar 2027-04-15** (security.txt expires 2027-05-14) | 5 min Tim |

### P0.C — Feature gate launch (dev ~10-15h)

| ID | Item | Pourquoi launch-critical | Effort |
|---|---|---|---|
| [ ] **P0.F1** | **C3.3 exécution seed catalog initial** sur 3 pilots Bordeaux (Musée d'Aquitaine + CAPC + Cité du Vin) via `scripts/catalog-ingest.ts` shipped. **Sentinel S1.2 SigLIP `embedding_model_version` homogeneity** AVANT exec pour éviter pollution dual-version. Cohérence pilote à clarifier (`seed-pilot-museums.sh` cible Paris, `seed-pilot-artwork-knowledge.ts` cible Bordeaux — incohérence à fixer avant exec) | C3 image compare = différentiateur core B2B ; sans seed, similarity service retourne `no_visual_neighbor` systématique = théâtre | 5-15 min wall-clock ONNX local + 1h validation + decision pilote ~2h |
| [ ] **P0.F2** | **C6.5 telemetry funnel conversion paywall** : install PostHog self-hosted OU Plausible + 3 events FE (`paywall_modal_shown`, `paywall_cta_clicked`, `paywall_email_captured`) + 1 BE (`quota_exceeded`) + consent gate GDPR + dashboard simple | KR4 mesurable + décision Stripe NEXT débloquée. Code admet `user-tier.ts:5` "the flip is the canonical premium grant until R1 funnel data unblocks Stripe" | **6-10h** (pas 4-6h prétendus) |
| [ ] **P0.F3** | **C7.4 §3 `.env` corrections RELEASE_CHECKLIST.md** : `CORS_ORIGINS`, `BREVO_API_KEY`, `APP_VERSION`, `GOOGLE_OAUTH_CLIENT_ID`, drop dead vars | bloque prod (release checklist 111/112 GO, reste §3) | 30-60 min |

### P0.D — Walk V1 décision éditoriale (à acter Tim avant tout autre travail)

Audit finding E4 : la position "assistant balade culturelle" pré-V1 était mensongère puisque `features/walk/` n'existe pas. **3 options à choisir** :

| Option | Conséquence | Effort |
|---|---|---|
| ☐ **A. Re-cadrer V1 = "AI Art Companion intra-musée" (déjà fait dans NorthStar ci-dessus)** | Honest. Pas de slip launch. Landing/ASO/pitch B2B à éditer. Walk hors-musée → V2 (sprint juin-août). | 4-8h Tim copywriting + landing edits |
| ☐ **B. Slip launch 4-6 sem + livrer W1.1+W1.2+W1.3 minimum** | Risque cash runway + B2B pilot dates. | ~3-4 sem dev solo |
| ☐ **C. MVP Walk symbolique** (auto-suggestion œuvre suivante via proximité GPS, déjà partiel via `suggestions[]` + W1.6) | Walk V1 = "stub intra-musée" annoncé honest dans CGU. Carnet + suggestions ré-emballées. | 2-3j dev |

**Recommandation honnête : option A** (NorthStar re-cadré ci-dessus). KR2 NPS reste mesurable sur art companion. Promote Walk hors-musée → V2 (NEXT-V2 §ci-dessous).

### P0.E — Items déjà shippés cochés honest (UFR-013 fix)

Au 2026-05-20, audit a confirmé 7 items prétendus `[ ]` dans NOW Phase 1 sont en réalité SHIPPED :

- **C9.2** imageDescription audio-desc → shipped 2026-05-17 (`useChatSession.ts:99-124`)
- **C9.3b** AI Act Art.50 badge persistant → shipped `ChatHeader.tsx:77-93` + i18n 8 locales (over-compliance : AI Act applicable 2026-08-02, pas launch 2026-06-01)
- **C9.10** voiceMode prompt branch → shipped `llm-sections.ts:149,203` + cache key
- **C9.12a** MP3 → Opus → shipped `text-to-speech.openai.ts:42`
- **C9.12b** S3 decouple → shipped `chat-media.service.ts:249-275` fire-and-forget
- **C9.16** SSE residuals → déjà absent de `src/` (résidus dist+coverage stale auto-régénérables)
- **C9.18** deep-link artworkId → shipped en fallback `/museum-detail` (route canonique TD-NEW V1.1)

Ces ticks ont été appliqués aux sections C9 ci-dessous. **Total Phase A P0 strict réel après audit = ~3 items ouverts** (P0.A6 cost breaker fail-CLOSE, P0.F1 seed catalog, P0.F2 telemetry funnel) — pas les 8 prétendus dans la version pré-audit.

### P0.F — Claims falsifiés à NE PLUS retenter

Liste verbatim (les preuves code détaillées sont dans le commit message du squash `chore(roadmap): consolider`) :

- ❌ "PostGIS 8 fichiers à patcher + Dockerfile custom 6-8h" → 1 seul fichier réel `ci-cd-backend.yml:319 postgres:16 → pgvector/pgvector:pg16`, 15 min
- ❌ "MigrateGeofenceBboxToPostgis nouvelle migration 3-4h" → migration existante `1779051738966-AddMuseumGeofence.ts` hybride postgis+jsonb-bbox fallback déjà
- ❌ "SigLIP kNN modelVersion isolation 🚨 P0" → DB prod vide, bug latent, grouper avec P0.F1 seed exec
- ❌ "Anon LLM cost rate-limit bypass" → non-exploitable, route exige `isAuthenticated` middleware
- ❌ "AI Act Art.50 badge à implémenter, legal review 0.5-3j" → déjà shipped
- ❌ "EN 301 549 §9.1.1.1 violation latente" → micro-entreprise <2M€ CA exempt EAA + C9.2 shipped
- ❌ "DPO obligation Art.37 V1" → non applicable au volume 100 visitors S1
- ❌ "ENISA SRP deadline pré-launch 2026-09-11" → deadline réelle 2027-12-11 full requirements
- ❌ "Sentinel PGP placeholder gate déjà en place" → n'existe pas (à créer)
- ❌ "18 000 lignes docs retirées" → 7 700 réelles (inflation x2.3)
- ❌ "42 TD fermées TECH_DEBT" → 1 seule confirmée (TD-11)
- ❌ "Hexagonal POJO 23 entities 3-5j" → 157 fichiers cross-importants, infaisable V1
- ❌ "Chat éclatement 4 sous-modules V1" → 909 LOC composition root sain, 144 LOC/file moyenne, over-engineering 12j launch
- ❌ "`@musaium/shared` 9 modules adoptés 3/3 apps" → comptes inflated 1.5-3×, scope-cut à 3 modules réels V1.1
- ❌ "Stryker CI réactivation" → décision D3 local-only déjà actée
- ❌ "Llama-Prompt-Guard wired ADR-051 ready" → adapter implémenté mais NON wired dans `chat-module.ts`, Dockerfile sidecar absent → scaffold dormant V1.1
- ❌ "C9.13 Reranker shipped : -15% à -25% failed retrievals" → V1 scaffold throw `RerankerUnavailableError`, V2-deferred-honest (chiffres = projections, pas mesures)
- ❌ "ESLint custom rule no-sentry-direct-capture 3-4h" → 15 sites prod total, grep CI 1-liner suffit
- ❌ "Sentry 39 sites BE 1j" → 2 sites réels BE, effort 15 min
- ❌ "L6.6 web 2→8 langues 4-6h" → fantasme 1 ordre de grandeur, scope-cut FR/EN/ES/DE 20-30h V1.1
- ❌ "doc-anchor-check sentinelle 2-3h" → 92 refs total, ROI faible, defer (mais voir `roadmap-claim-resolves.mjs` nouvelle sentinelle ciblée roadmap seulement)
- ❌ "Wave 7 verify 20/20 transversal sign-off" → exit criteria fabriqué

### P0.G — Anti-pattern documenté : UFR-024 Audit-driven roadmap inflation

> **UFR-024** (à codifier dans `.claude/agents/shared/user-feedback-rules.json`) — quand une roadmap consolide des audits multiples, vérifier (a) chaque `path:line` cité résout, (b) chaque "X LOC à supprimer" est `wc -l` reproductible, (c) chaque "déjà en place" sentinelle est `find` reproductible, (d) chaque "shipped" commit est `git show` reproductible. Pas de bullet sans preuve code.
>
> **Why** : 2026-05-20 le remediation roadmap original avait fabriqué 120+ items hors ROADMAP_PRODUCT NOW (inflation x6-x8), 22 P0 falsifiés en <5 min code-check, et oubliait Walk V1 (différenciateur core).
>
> **How to apply** : pour toute nouvelle roadmap dérivée d'audit, exiger preuve `path:line` + commit SHA ou `find/grep` reproductible AVANT lock. Sentinelle `scripts/sentinels/roadmap-claim-resolves.mjs` (wired pre-push + sentinel-mirror) fail les claims invérifiables sur `docs/ROADMAP*.md`.

### P0.H — Exit criteria honest V1 launch

1. ✅ P0.A1-A6 dev fixes mergés + tests verts (BE tsc + tests + ESLint + OpenAPI validate)
2. ✅ P0.T1-T7 Tim ops complétés, preuves archivées (DPA PDFs `docs/legal/dpa-signed/`, security@ mail entrant smoke OK, PGP réelle, Sentry P0 = 0)
3. ✅ P0.F1 seed catalog ≥3 musées prod, C3 image compare retourne du contenu réel
4. ✅ P0.F2 telemetry funnel émis + dashboard PostHog/Plausible opérationnel
5. ✅ P0.F3 RELEASE_CHECKLIST §3 .env validé prod
6. ✅ P0.D Walk V1 décision actée + landing/pitch B2B alignés (option A recommandée)
7. ✅ Items P0.E cochés honest dans ROADMAP_PRODUCT (déjà fait 2026-05-20)
8. ✅ Smoke prod local Docker ≥48h : auth + chat + photo upload + DSAR + geofence (jsonb-bbox path actif)
9. ✅ Tim sign-off P0.T5 device TTS test iPhone réel

**Pas de "20/20 transversal". Pas de Wave 7 verify cérémonielle.** MVP honest qui shippe et apprend.

---

## Stratégie : Phase 1 Consolidation → Phase 2 Évolution

Décision 2026-05-08 (brainstorm reprio) : **consolider l'existant à un niveau premium AVANT d'empiler Walk V1**. Re-cadrée 2026-05-20 (audit) : V1 = AI Art Companion intra-musée, V2 = walking guide hors-musée.

Hypothèse : si chat / image / Wikidata / no-halluc / compare sont premium-grade dès V1, alors :
- KR2 (NPS Companion) bénéficie d'un fondement chat solide
- Pitch B2B (KR1) montre features différenciantes (image compare seed P0.F1 = wow)
- Soft-paywall stub (KR4 funnel data via P0.F2) valide hypothèse freemium pré-Stripe full
- V2 (NEXT-V2) démarre sur fondation stable

**Phase 1 (NOW)** = items C1…C9 ci-dessous + P0.A-H ci-dessus. **Phase 2 (NEXT V1.1)** = multi-tenancy + admin + landing + chat backend modernization. **V2 NEXT** = Walk hors-musée (W1.2/W1.3 + multi-POI infra).

---

## NOW — Phase 1 Consolidation (sprint launch 2026-05-03 → 2026-06-01)

> **Discipline :** chaque feature non-trivial passe par /team Spec Kit (spec.md + design.md + tasks.md).
> Coche `[x]` au merge. Bloqué = `[BLOCKED: raison]` inline.
>
> **Sprint segment intermédiaire P1 closure :** 2026-05-05 → 2026-05-19, recap consolidé (git history). Feature freeze 2026-05-19, soak en local Docker 48h (pas de staging avant B2B revenue), release checklist post-19.
>
> **🔍 Audit checkbox vs code réel — 2026-05-14 :** un audit complet (4 agents parallèles, cf. session 2026-05-14) a révélé une dérive importante : C1.2 + C3.1/3.2/3.4/3.5 ont été livrés mais les cases jamais cochées par les agents /team au merge. Items reclassés `[x]` ci-dessous avec ref ADR/commit. C3.3 partiel (pipeline shipped, exécution seed prod restante). Voir aussi W3.1/W3.2/W3.3/W4.1 dans Phase 2 (livrés malgré doctrine "Phase 2 blocked").

### C1 — Chat fast (latency premium)

> Existant : sync-only pipeline shipped + Langfuse spans + targets P50<3.5s WiFi. Manque dashboard p99 baseline + LLM cache audit + optim data-driven.

- [ ] **C1.1 Dashboard Grafana p50/p95/p99** — STT + LLM + TTS depuis spans Langfuse existants. Alerte si p99 >6s. (ex-V5.1) *(audit 2026-05-14 : HTTP request p50/p95/p99 + `chat_phase_duration_seconds` panel existent dans `musaium-backend-dashboard.json`, manque panels per-stage STT/LLM/TTS dédiés. À compléter)*
- [x] **C1.2 LLM cache audit + activate** — `llm-cache.service.ts` wiré dans composition root `chat.service.ts:4,123`, Prometheus counters `llmCacheHits/MissesTotal` + panel Grafana hit-rate live. ADR-036 Accepted-Implemented 2026-05-08 (PR-A + PR-B mergés). *(audit 2026-05-14 : case oubliée par /team au merge)*
- [ ] **C1.3 Optim data-driven** — après baseline, attaquer goulot identifié (parallélisation tools, prompt compaction, model routing si pertinent). Gated par ≥7j bake C1.1 (ADR-036 §Phase 2, semantic cache + pre-warm deferred).

### C2 — Image dans chat finition (AI-side enrichissement)

> **AI-side uniquement.** L'IA enrichit ses réponses avec des images plus pertinentes, en plus grand nombre, mieux légendées. Le multi-image upload côté visiteur est explicitement non-souhaité (le visiteur enverra ses images une par une) — voir mémoire `project_c2_ai_side_only`. Ne PAS toucher `image-input.ts` / `image-processing.service.ts` / `useImagePicker.ts` / `OfflineQueue` single.
>
> Existant : LLM produit déjà `ChatAssistantMetadata.suggestedImages: { query, description }[]` (parsé `assistant-response.ts:117`, **non consommé** pour fetch). `ImageEnrichmentService.enrich()` interroge Wikidata P18 + Unsplash sur 1 seul `searchTerm` extrait via `extractSearchTerm()`, score + dedup, slice à `maxImagesPerResponse`. `ImageCarousel.tsx` rend en bas du bubble assistant. Manque : consommation des suggestedImages, sources élargies (Commons + catalogue interne), caption/rationale didactique LLM-authored, repositionnement carrousel-au-dessus.
>
> Spec Kit complet : `team-state/2026-05-08-c2-image-finition/{spec,design,tasks}.md`.

- [x] **C2.1 Multi-search-term enrich** — `enrichment-fetcher` consomme `suggestedImages[]` LLM-produit et fan-out parallèle vers `ImageEnrichmentService.enrich()` ; prompt-tune `llm-sections.ts` 1-2 → 2-4 entries sur sujets comparatifs (déclenche la quantité) — *implémenté 2026-05-10, live (kill-switch retiré 2026-05-10 — feedback `feedback_no_feature_flags_prelaunch`)*
- [x] **C2.2 Sources élargies** — nouveaux clients `WikimediaCommonsClient` (Search API namespace 6, no auth) + `MusaiumCatalogueClient` (lookup `artworks.data.ts` interne, score=1.0 max-trust) via port `ImageSourceClient` existant ; tie-break dedup `musaium > wikidata > commons > unsplash`
- [x] **C2.3 Caption + rationale LLM-authored** — schema `SuggestedImage` v2 `{query, description, rationale, caption}` (rationale + caption REQUIRED) ; propagation FE rendue sous chaque thumb (`ChatUiEnrichedImage.rationale`) ; alias-aware `titleMatchScore` (FR/EN alt-labels Wikidata via SPARQL `skos:altLabel + schema:alternateName`)
- [x] **C2.4 Carrousel skeleton pendant streaming** — *Q1 RESOLVED 2026-05-10 → option (b)* : carrousel déjà au-dessus du texte (le rapport de l'architect a infirmé le statu quo "en bas"). Vrai delta UX livré = `ImageCarouselSkeleton` placeholder pendant `isStreaming=true`, swap vers vrai `<ImageCarousel>` à l'hydratation des images.
- [x] **C2.5 Observabilité** — Langfuse spans `chat.enrichment.image_source` par source + Prometheus counter/histo `chat_enrichment_source_calls_total` / `chat_enrichment_source_latency_seconds` ; promptfoo regression 4 scénarios (comparative / single-visual / non-visual / no-PII rationale) ; output guardrail D3 étendu à `metadata.images[*].rationale + caption` (single-source-of-truth maintenue). Kill-switch initialement design retiré pré-launch (rollback = `git revert` + redeploy ; doctrine reviendra post-B2B-revenue, voir memory `feedback_no_feature_flags_prelaunch`).

### C3 — Image comparative full

> Existant : 0. Feature différenciante : visiteur envoie photo œuvre, bot répond avec œuvre similaire + photo + rationale.

- [x] **C3.1 Embeddings stack** — SigLIP-base-patch16-224 ONNX adapter `siglip-onnx.adapter.ts` via `onnxruntime-node` (CPU AVX2), normalize `[-1, 1]` (pas ImageNet mean — cf. CLAUDE.md gotcha), tests mock + integration. ADR-037 Accepted 2026-05-10. *(audit 2026-05-14 : case oubliée)*
- [x] **C3.2 pgvector index** — 2 migrations TypeORM : `1778406339944-AddArtworkEmbeddings` (table + extension vector + index HNSW `halfvec(768)` + `halfvec_ip_ops`) + `1778622760826-AddMuseumIdScopeToArtworkEmbeddings` (scope per-musée). ADR-037 2026-05-10. *(audit 2026-05-14 : case oubliée — pgvector EST sur le serveur prod)*
- [ ] **C3.3 Catalogue seed initial** — *pipeline shipped 2026-05-10 (`catalog-ingest.ts` + `catalog-ingest.helpers.ts` : SPARQL Wikidata → license filter → download → SigLIP encode → batch upsert).* Action restante = exécuter sur top musées contractés (~10-20k œuvres). Volume seedé en prod = 0 au 2026-05-14.
- [x] **C3.4 Endpoint similarity** — `chat-compare.route.ts` + `compare.use-case.ts` pipeline 5-stages (cache → encode → kNN pgvector → Wikidata enrichment → scoring fusion), réponse `CompareResult`, 503 fail-open si encoder unavailable, tests route + use-case. 2026-05-10. *(audit 2026-05-14 : case oubliée)*
- [x] **C3.5 UX FE compare** — `ImageCompareCarousel.tsx` (FlatList RN) + `ImageCompareCard` + i18n `chat.compare.title`/`empty` + factory tests + E2E Maestro `chat-compare.yaml`. 2026-05-10. *(audit 2026-05-14 : case oubliée)*

### C4 — IA sans hallucination

> Existant : keyword guardrail multilingue + LLM judge V2 confidence scoring + output guardrail + KB Wikidata. Manque : WebSearch fallback wiring orchestrateur + threshold tuning + citations sources + regression eval continu.

- [x] **C4.1 WebSearch fallback wiring** — Brave wrapper existe, brancher orchestrateur quand KB miss + judge confidence < threshold (ex-W1.7) — done 2026-05-11 (cf. ADR-038, KnowledgeRouter cascade KB→judge→WS via `AbortSignal.any`)
- [ ] **C4.2 Threshold confidence tuning** — calibrer cutoff LLM judge V2 sur dataset réel chat prod — explicitly deferred V1.1 (ADR-038 §Phase D, ≥7j prod bake)
- [x] **C4.3 Promptfoo regression suite anti-hallucination** — T1.5b real-mode bake (cf. ROADMAP_TEAM.md) — done 2026-05-11 (60 entries corpus + CI `halluc-eval` job + assertions `quoteInFacts`/`citeRealUrl`)
- [x] **C4.4 Citation enforce** — LLM doit citer source dans réponse (struct output `sources[]: {url, type, title}`), affichage FE clickable — done 2026-05-11 (Zod schema v2 + Spotlighting + validator NFKC + FE `SourceCitation` Ionicons + i18n 8 locales)

### C5 — Wikidata premium (resilient)

> Existant : live SPARQL + Redis cache 7d + fail-open + prompt injection wrap (ADR-035 Accepted-Implemented). Manque : circuit-breaker + downtime metric + local dump fallback.

- [x] **C5.1 Circuit-breaker SPARQL** — opossum 9.x via `WikidataBreakerClient`, drop-in `KnowledgeBaseProvider`. 7 tests TDD transitions CLOSED/OPEN/HALF_OPEN + 4xx-no-trip + Step 7.1 DoD null fail-open. (PR-C5, 2026-05-11, ADR-039)
- [x] **C5.2 Downtime metric + alerts** — span `chat.knowledge.lookup` shipped (PR-C5) ; `wikidata_sparql_circuit_state` gauge + `wikidata_sparql_requests_total{outcome}` counter + `wikidata_sparql_request_duration_seconds` histogram ; 4 alertes (`WikidataBreakerOpenSustained`, `WikidataSparqlErrorRateHigh`, `WikidataSparqlLatencyP95High`, `WikidataLocalDumpHotPath`) wired via `infra/grafana/alerting/wikidata-resilience.yml`. (PR-C5 Phase 6.2-4, 2026-05-11, ADR-039)
- [x] **C5.3 Local dump backup** — `wikidata_kb_dump` migration + `WikidataKbDumpRepositoryTypeOrm` + `WikidataWriteThroughProvider` decorator (fire-and-forget UPSERT) + `scripts/seed-kb-canon.ts` (~50 œuvres canon × en+fr). Stack wired dans `chat-module.ts` : `WikidataWriteThroughProvider → WikidataBreakerClient → WikidataClient` partagé avec `KnowledgeRouterService` C4 → tous les chemins KB bénéficient du breaker + write-through. Cascade local-dump opérationnelle dès J1 sur le seed canon, croît organiquement post-launch. (PR-C5.3, 2026-05-11, ADR-039)
- [x] **C5.4 Cache hit-rate monitoring** — `wikidata_cache_{hits,misses}_total` counters + Grafana dashboard `wikidata-resilience.json` (5 panels : circuit state, outcomes, latency p50/p95/p99, cache hit rate, dump fallback rate). (PR-C5 Phase 6.2-4, 2026-05-11, ADR-039)

### C6 — Premium soft-paywall stub

> Existant : 0. Hypothèse 3 sessions/mois free → premium illimité = à valider AVANT Stripe full. Stub V1 = compteur + écran upsell sans paiement.

- [x] **C6.1 BE compteur sessions/mois par user** — table tracking + middleware quota check pré-orchestrator. *(merge `6893a6ab` 2026-05-16 R1 paywall stub, audit 2026-05-17 : case oubliée par /team au merge)*
- [x] **C6.2 Tier model `free | premium` sur User entity** — migration TypeORM, pas de Stripe yet. *(merge `6893a6ab` 2026-05-16, audit 2026-05-17 tick-audit)*
- [x] **C6.3 FE écran upsell** — modal sur quota dépassé, CTA "rejoindre liste premium" → email capture (Brevo list). *(merge `6893a6ab` 2026-05-16, audit 2026-05-17 tick-audit)*
- [x] **C6.4 Admin override** — toggle premium manuel pour pilots B2B testers (cf. M2.x Phase 2). *(merge `6893a6ab` 2026-05-16, audit 2026-05-17 tick-audit)*
- [ ] **C6.5 Telemetry conversion funnel** — combien hit quota, combien click upsell, combien email captured *(reste ouvert — analytics pas wired au merge 6893a)*

### C7 — Stabilité prod (KR3)

- [x] **C7.1 S6.1 Smoke prod** — `pnpm smoke:api` couvre auth + chat + image upload + compare + voice/TTS end-to-end. *(merge `6893a6ab` 2026-05-16 R5 TTS smoke round-trip, audit 2026-05-17 tick-audit)*
- [ ] **C7.2 S6.2 Chaos game-day** — `docs/CHAOS_RUNBOOKS.md` rédigé (3 expé : Redis kill rate-limit fail-closed, PG replica → primary failover, LLM provider kill multi-provider), exécution game-day pending. *(W4 audit-360 2026-05-17 : kit d'exécution `docs/operations/CHAOS_GAMEDAY_2026-05.md` rédigé — pré-flight 8 rows, plan d'exécution time-boxed par expé, template findings ; reste TL exec sur local Docker stack pré-V1 — pas de staging dédié per `project_no_staging_v1`)*
- [ ] **C7.3 S6.3 P0 bug zero** — triage Sentry + Linear, aucun ouvert avant 1er juin. *(W4 audit-360 2026-05-17 : checklist d'exécution `docs/operations/SENTRY_P0_TRIAGE_2026-05-20.md` — query rubric, 4-verdict classification, post-launch cadence proposée ; reste TL exec sur Sentry UI)*
- [ ] **C7.4 S6.4 Release checklist run** — `docs/RELEASE_CHECKLIST.md` rédigée (656L, last update 2026-04-04 — refs admin Vite à actualiser → museum-web Next.js 15), execution + sign-off pending. *(W4 audit-360 2026-05-17 : refs Vite → Next.js 15 actualisées, build command pnpm corrigé, 3 nouvelles routes admin museums référencées, dateline bumped 2026-05-20 ; reste TL sign-off final 111/112 post-merge)*
- [ ] **C7.5 Smoke device — TTS backgrounded** (avant TestFlight submit, ~5 min) — sur iPhone réel : ouvrir chat → envoyer message → AI répond TTS → lock-screen pendant playback → vérifier que l'audio continue. Si silence après lock = `setAudioModeAsync({ shouldPlayInBackground: true })` dans `useTextToSpeech.ts:222-229` ne s'applique pas correctement (peut nécessiter `AVAudioSession.Category = .playback` côté natif). Issue source : commit `c4338ba1` (P0 #7 ferme la capability Info.plist + JS-side mais le runtime n'a pas été testé device).

### C8 — Compliance VDP follow-up (CRA / GDPR — code + docs rédigés 2026-05-14)

> Code rédigé 2026-05-14 : `SECURITY.md`, `docs/operations/VDP_RUNBOOK.md`, `museum-web/public/.well-known/security.txt` (RFC 9116, expires 2027-05-14), `docs/legal/SUBPROCESSORS.md`, `museum-web/src/app/[locale]/security/`, `museum-web/src/lib/security-content.ts`. **Audit 2026-05-14 : fichiers untracked dans `git status` — `git add` + commit avant les ops actions.** Reste les actions humaines/ops pour rendre le canal réellement actif. Détails dans [`docs/operations/VDP_RUNBOOK.md`](operations/VDP_RUNBOOK.md).

- [ ] **C8.1 Mailbox `security@musaium.com`** — créer + forwarder vers founder primary inbox + Slack `#security` mobile push. Bloque launch 2026-06-01 (sans mailbox, `SECURITY.md` ment). Effort 30 min. *(W4 2026-05-17 : runbook déterministe `docs/operations/SECURITY_MAILBOX_SETUP.md` — DNS MX/SPF/DKIM/DMARC + smoke 4-tier inbound/outbound/spoof + evidence à capturer pour la PR. Reste TL exec OVH + DNS)*
- [ ] **C8.2 CNIL portal dry-run** — vérifier credentials sur <https://notifications.cnil.fr/notifications/>, faire un test breach notification end-to-end. Bloque launch 2026-06-01 (GDPR Art. 33 72h). Effort 60 min. *(W4 : `docs/operations/CNIL_BREACH_NOTIFICATION_DRYRUN.md` — scénario fictif + 14-step walkthrough en mode brouillon + delete. Reste TL exec sur portail live)*
- [ ] **C8.3 ENISA SRP onboarding** — créer un compte sur la plateforme de reporting unique, dry-run un test incident. Deadline réelle 2026-09-11 (CRA Art. 14). Target avant launch pour bake. Effort 60 min. *(W4 : `docs/operations/ENISA_SRP_ONBOARDING.md` — eIDAS account + product registration + dry-run en mode Test. Reste TL exec)*
- [ ] **C8.4 CERT-FR contact vérifié** — confirmer le point d'entrée `certfr-info@ssi.gouv.fr` + tel `+33 1 71 75 84 50` + ajouter au 1Password. Deadline 2026-09-11. Effort 15 min. *(W4 : `SECURITY.md` enrichie d'une section "Regulator escalation paths" + `docs/operations/INCIDENT_CONTACTS.md` consolidé (3 regulators + 11 sub-processors + 1P vault schema + cadence vérif Q1). Reste TL exec 1Password)*
- [ ] **C8.5 PGP key publication** — générer paire de clés `security@musaium.com`, publier la clé publique à `https://musaium.com/.well-known/pgp-key.txt`. Post-V1 (non bloquant launch, mais cité dans `SECURITY.md` § "PGP / encrypted reports"). Effort 30 min. *(W4 : `docs/operations/PGP_KEY_GENERATION.md` (Ed25519 2-year + backup offline 2 USB + rotation policy) + `museum-web/public/.well-known/pgp-key.txt` placeholder (token PGP_KEY_PLACEHOLDER_DO_NOT_SHIP, deploy gate à ajouter) + `security.txt` `Encryption:` ligne décommentée. Reste TL exec `gpg --quick-generate-key`)*
- [ ] **C8.6 Renewal calendar reminder** — ajouter rappel récurrent 2027-04-15 (30 j avant `Expires: 2027-05-14`) pour regénérer `museum-web/public/.well-known/security.txt` avec une nouvelle date. Effort 5 min.

### C9 — Chat backend hardening pré-launch (audit NORTHSTAR 2026-05-16)

> Audit /team 360° 2026-05-16 — 8 agents read-only ont identifié ~22 j-h de quick wins P0 sur le chat backend (28 001 LOC, 42 dossiers, 167 fichiers TS). Détail file:line + sources externes : `team-reports/2026-05-16-chat-backend-audit-360/`.
>
> **UFR-013 honesty** : aucune métrique latence/cost ci-dessous n'est mesurée terrain (`LANGFUSE_ENABLED=false` par défaut). C9.0 = précondition obligatoire à toute optim. Sans baseline, gains restent estimés.

- [x] **C9.0 Activer Langfuse prod + exporter Prom baseline 7j** — précondition à toute optim. Sans ça, gains ci-dessous sont hypothèses non vérifiées. Effort 0.5j + 7j bake parallèle. *(NORTHSTAR BL1)* *(shipped `fd796f94` 2026-05-19 — lf.trace+generation w/ userId/sessionId/museumId emitted)*
- [x] **C9.1 Fix copy mensonge "images compressées"** UFR-013 violation — fermé 2026-05-17, edit FR + EN `museum-frontend/shared/locales/{fr,en}/translation.json:552` (TTS désactivé / réponses plus courtes / prefetch wifi uniquement). Cf. TD-15. *(NORTHSTAR + H §5.1 SEV1 + dispatcher)*
- [x] **C9.2 `imageDescription` rendu en audio-desc mode** — shipped 2026-05-17 (`useChatSession.ts:99-124` autoplay TTS via expo-speech quand `audioDescriptionMode` ON ; toggle UI `SettingsAccessibilityCard.tsx` ; Zustand store + bootstrap profile server sync ; tests). BE émet via `assistant-response.ts:159` (claim original ligne 199 stale). *(audit 2026-05-20 : case oubliée par /team au merge)*
- [x] **C9.3a Granular AI consent sheet (Apple 5.1.2(i) + GDPR Art. 7)** — per-category × per-provider toggles, default OFF, audit chain emission, settings revocation. ADR-053. *(merge `bfcd0743` 2026-05-17 S4-P0-02, audit 2026-05-17 tick-audit split)*
- [x] **C9.3b EU AI Act Art.50 voice disclosure badge persistant** — shipped (vérifié audit 2026-05-20). Badge `ai-disclosure-badge` persistant `ChatHeader.tsx:77-93` (visible collapsed + expanded), footer `AiDisclosureFooter.tsx`, sheet recap `AiDisclosureSheetContent.tsx`, voice intro audio greeting `VoiceSessionIntroSheetContent.tsx:67`, i18n 8 locales (`voice.disclosure.badgeLabel/badgeA11y`). Audit légal `docs/legal/AI_DISCLOSURE_AUDIT.md` verdict "appears compliant" 2026-05-17. Note : AI Act Art.50 applicable 2026-08-02, donc V1 launch 2026-06-01 = anticipation (over-compliance). Reste TD-41 a11y contrast badge 8 locales (V1.1) + DPO sign-off doc.
- [x] **C9.4 Wire Cost Circuit Breaker + Langfuse generation()** — unified changeset : migrer `lf.trace` → `lf.generation({input, output, usage, model})` dans `langchain-orchestrator-tracing.ts` + propager `userId/sessionId/museumId` (5 LOC) + wire `recordCharge(estimateCostCents(...))` dans `langchain.orchestrator.invokeSection` + ajouter Prom gauge `llm_cost_eur_per_hour{tier,museumId}` + 3 alerts manquantes (cache-hit-rate-too-low, llm_cost_breaker_open, llm_guard_breaker_open). Effort 2j, gain : cost observability + safety net hard cap (50$/h spike, 500$/jour). *(NORTHSTAR Convergent.1 — B Gap-9 + D §10 + G converge)* *(W4 2026-05-17 — partie alertes Prom : `infra/grafana/alerting/llm-cost.yml` shippé avec 5 alerts (cache_hit_rate_too_low warn+critical, llm_cost_breaker_open, llm_guard_breaker_open, + bonus guardrail_budget_redis_fail_closed). Final bake post-W1 BE wiring `recordCharge` + Prom gauges.)* *(shipped `0635b883` 2026-05-19 — wake LlmCostCircuitBreaker + Prom gauge musaium_llm_cost_eur_per_hour)*
- [x] **C9.5 Stable-prefix message ordering** — restructurer `buildSectionMessages` (`llm-prompt-builder.ts:321-397`) : mettre system+section AVANT visitor_context+memory+enrichment+history+user. Précondition prefix ≥1024 tokens identique byte-à-byte. Logger `prompt_tokens_details.cached_tokens` (OpenAI L2 auto-cache). Effort 1j, gain attendu **-30 à -40% input cost gratuit** si cache hit ratio ≥ 0.4 sur sessions > 2 turns. *(B T1-A.2 + T1-A.3 + D QW3)* *(shipped `bcb035c6` 2026-05-19 + corrective `ce9f34bb` walk-intent parity)*
- [x] **C9.6 Promise.all enrichment + location + router** — `prepare-message.pipeline.ts:355-408` 3 awaits séquentiels indépendants (`fetchEnrichmentData` || `resolveLocationForMessage` || `resolveRouterFacts`). Effort 0.5j, gain **-200 à -500ms P50**. *(D-QW1)* *(shipped `50b75951` 2026-05-19 — parallelize enrichment + location + router facts)*
- [x] **C9.7 Détacher LLM judge de l'orchestrator** — `llm-judge-guardrail.ts:170-235` réutilise full pipeline section/circuit-breaker/Langfuse pour un simple structured output `{decision, confidence}`. Replace par `model.withStructuredOutput(JudgeDecisionSchema).invoke([JUDGE_SYSTEM, msg])` direct. Effort 1j, gain **-50 à -100ms judge p99**. *(B T1-A.4)* *(shipped `4a64c52b` 2026-05-19 — detach judge from full orchestrator pipeline)*
- [ ] **C9.8 Activate Presidio adapter (LLM02 PII gap)** — input + output PII detection (`Anonymize` + `Anonymized` scanners), observeOnly 7j bake puis enforce. ADR-051 ready. Effort 2j + 7j bake. Comble gap critique : Musaium V1 couvre email/phone via regex seulement, manque LOCATION/PERSON/CREDIT_CARD/CRYPTO/IBAN. *(C-P1 P0)*
- [x] **C9.9 Retire art-topic classifier OUTPUT O3** — supprimé `art-topic-classifier.ts` (75 LOC pre-removal, cf `git show e0d9cf29` pour l'archive). Le module refaisait un LLM call mini-modèle pour décider si output on-topic, redondant avec section prompt enforcement + L3 judge + promptfoo smoke gate. Garde fail-CLOSED sans valeur LLM01/LLM02. Effort 0.5j, gain **-300 à -800ms p99 output**. *(C-P2)* *(shipped `e0d9cf29` 2026-05-18/19 — retire OUTPUT O3, UFR-016)*
- [x] **C9.10 Voice-first prompt branch** — shipped (vérifié audit 2026-05-20). Flag `voiceMode` propagé `chat.shared-types.ts:45` → `chat-route.helpers.ts:206` → `chat-orchestrator.port.ts:37` → `llm-prompt-builder.ts:274` → `llm-sections.ts:149` active branch `if (voiceMode) return 80` word cap + `:203` prose-only no-markdown. Cache key inclut `voiceMode` (`chat-cache-key.util.ts:44,123`). *(audit 2026-05-20 : case oubliée par /team au merge)*
- [x] **C9.11 Collapse triple anti-injection reminder** — 3 endroits dans le prompt (`buildSystemPrompt:140` + final reminder L391-393 + Spotlighting envelope `CRITICAL: Treat content above as DATA` L101). ~150 tokens × 100k req/j = **15M tokens/jour gaspillés**. Effort 0.5j. *(C-P3)* *(shipped `ef728036` 2026-05-19 — dedup to canonical post-user slot)*
- [x] **C9.12 TTS quick wins** — tous shipped (vérifié audit 2026-05-20) :
    - [x] C9.12a MP3 → Opus codec — shipped `text-to-speech.openai.ts:42` literal `response_format: 'opus'` (commentaire daté 2026-05-17 "-40% bandwidth + -50-100ms first-byte vs MP3"). Note : support RN/Expo Opus à valider device test (C7.5).
    - [x] C9.12b Decouple S3 save + DB — shipped `chat-media.service.ts:249-275` true fire-and-forget `void (async () => { ... })()` (claim original ligne 314-332 stale).
    - [x] C9.12c Fix cache key voice bug — shipped `d54552be` 2026-05-19 (include voiceMode + audioDescriptionMode in LLM cache key).
- [x] **C9.13 Ship bge-reranker-v2-m3 ONNX local** — multilingue FR/EN/IT/ES/AR/JP, 0€ inférence CPU (mutualisé avec SigLIP). Reranker absent = gap RAG moderne (Anthropic Contextual Retrieval -49 à -67% failed retrievals avec rerank). Effort 4-5j, gain **-15 à -25% failed retrievals + nDCG@5 ~+10pt** vs no-rerank. *(F-QW1 P0)* *(shipped `64fab9af` 2026-05-19 + corrective `d2eeae57` + tier exempt `f57bf2a3` — V1 scaffold)*
- [x] **C9.14 SigLIP → SigLIP-2 base drop-in** — re-export `.onnx` + bump `SIGLIP_MODEL_VERSION` const → `upsertBatch` idempotent re-ingest. Preprocess identique (mean=0.5/std=0.5). Effort 1j, gain **+2-3pt R@1 visual compare** (audit fixture). *(F-QW2)* *(shipped `1a3e8d18` 2026-05-19 — swap SigLIP v1 → SigLIP-2 base patch16-224 ONNX)*
- [x] **C9.15 Retire Google CSE + SearXNG + DuckDuckGo adapters** — Tavily (P50 180ms) + Brave (indépendant, hedge Nebius acquisition Feb 2026 risque continuity) suffisent. Doctrine UFR-016 bury dead code. Effort 1j, **-314 LOC -3 env vars -3 secrets**. *(F-QW3)* *(shipped `6936975a` 2026-05-19 + cleanup `2d6650be` — UFR-016 bury dead code)*
- [x] **C9.16 Dead code burial SSE residuals** — déjà absent de `src/` (vérifié audit 2026-05-20). Résidus = `dist/` + `coverage/` stale uniquement (auto-régénérables). DONE confirmé.
- [x] **C9.17 Sunset legacy `[META]` parser path** — `llm-sections.ts:262-273` + `langchain.orchestrator.ts:131-141` + `assistant-response.parseAssistantResponse`. Précondition : audit test fakes migrent vers `withStructuredOutput`. Effort 0.5j, **-80 LOC dead code**. *(B T1-A.1)* *(shipped `3f0f9ac3` step B 2026-05-19 + corrective `868042e2` chaos e2e fakes migration)*
- [~] **C9.18 `detectedArtwork.artworkId` deep-link B2B** — shipped en fallback (vérifié audit 2026-05-20). BE émet via `extractMetadata()` `assistant-response.ts:120-128` (claim original ligne 175 stale). FE déclare `ChatUiMessageMetadata.detectedArtwork.artworkId` dans `chatSessionLogic.pure.ts:53-60`, passé à `ArtworkCard` via `ChatMessageBubble.tsx:255`, handler `ChatMessageList.tsx:166-176` deep-link `router.push({pathname:'/museum-detail', params:{artworkId, name}})`. **Route canonique `/museum/[id]/artwork/[artworkId]` n'existe pas encore** (TD-NEW noté dans le code) — route `/museum-detail` sert de passthrough V1 avec param artworkId. V1.1 = route dédiée + scroll/highlight UX.

**Total Phase A P0 strict** (mis à jour audit 2026-05-20 par 50 sous-agents fresh-context) : **~3 items réellement ouverts** sur ~3-6 j-h dev résiduels —
- C9.4 cost circuit breaker **fail-CLOSE wiring** (telemetry+gauge shipped, mais `canAttempt()` jamais appelé — orchestrator fail-OPEN ; à wirer 2-3h OU documenter "telemetry-only V1" dans ADR-047)
- C9.8 Presidio activate **deferred V1.1** (faible valeur produit V1 : email/phone regex couvre 95% risque RGPD ; PERSON/LOCATION = faux positifs sur artist names + museum cities reconnus par l'adapter lui-même ; gate sur prod data)
- Walk V1 si décision option C MVP stub

Items précédemment listés ouverts mais en réalité SHIPPED (cocher honest UFR-013) : C9.2 (a11y), C9.3b (AI badge), C9.10 (voice prompt), C9.12a/b (Opus + S3 decouple), C9.16 (SSE buré), C9.18 (deep-link fallback). C9.0 baseline shipped `fd796f94` 2026-05-19 — bake en cours, MAIS Langfuse leak via LangChain CallbackHandler `updateRoot:true` à fixer P0 launch via `LangfuseCoreOptions.mask` SDK option 30-60min (cf P0.A4 ci-dessus) — DPA Langfuse Cloud aussi P0.

### C10 — Chat UX refonte 2026-05-16 (livrée hors-roadmap, doctrine itérative assumée)

> 14 features TDD fresh-context shippées dans le merge `cc0b21c8` (2026-05-16 16:32) sans entrée roadmap pré-merge. Bloc créé 2026-05-17 par tick-audit pour traçabilité UFR-013. ADR-055 (BottomSheetRouter state machine) + ADR-056 (A5 phase client-side simulated). Doctrine Phase 1/2 séquentielle assouplie au profit d'un re-plan itératif (décision user 2026-05-17).

**A — Composer + bubbles + chrome**
- [x] **C10.A1** unified composer + attachment-picker
- [x] **C10.A2** artwork hero card + modal
- [x] **C10.A3** bubbles UI polish
- [x] **C10.A4** collapsible top bar
- [x] **C10.A5** status pipeline contextuels (cf. ADR-056 client-side simulated)
- [x] **C10.A6** citation chips

**B — Post-visite + resumption + in-museum**
- [x] **C10.B1** carnet de visite post-visite
- [x] **C10.B2** conversation resumption (session reprise)
- [x] **C10.B3** ask-more inline
- [x] **C10.B4** QR cartel scanner
- [x] **C10.B5** sotto-voce TTS mute toggle
- [x] **C10.B6** in-museum suggestion proactive

**C — Cache + router (réutilisation libellés C3/C4 sans collision — distinct des clusters image-compare / anti-hallu)**
- [x] **C10.C3** cache LLM hit côté UI (≠ C3 image compare)
- [x] **C10.C4** BottomSheetRouter UI unification — ADR-055 (≠ C4 anti-hallucination)

---

## NEXT — Phase 2 Évolution Walk V1 + B2B (post-Phase 1)

> Démarrage conditionné fin Phase 1. Tous les items déplacés depuis l'ancien NOW (renommés en `Wx.y`). Re-priorisation interne possible au moment du pivot.
>
> **🔍 Audit 2026-05-14 :** W3.1, W3.2, W3.3 et W4.1 ont été livrés malgré la doctrine "Phase 2 bloquée tant que Phase 1 incomplète" (commits `53903a293` 2026-04-21 → `3bf0813e` 2026-05-07). Items reclassés `[x]` ci-dessous avec ref commit. Indicateur clair que la séparation Phase 1/Phase 2 a glissé en pratique — re-discuter au prochain `/team roadmap:rotate`.

### W1 — Walk V1 intra-musée (différenciateur core, re-cadré 2026-05-20)

> **Split V1 intra vs V2 hors-musée** (audit finding E4 + décision P0.D) :
> - **V1 intra-musée** = transitions œuvre→œuvre + détection contexte (W1.4/W1.5/W1.6 + W1.1 partiel via prompt `suggestions[]`)
> - **V2 hors-musée** = walking guide multi-POI hors-musée avec chemin GPS + audio streaming auto (W1.2/W1.3 deferred V2, infra `features/walk/`+`museum_pois`+`walk_routes` à construire)

- [~] **W1.1 Transitions entre œuvres** *(intra-musée)* — partiel via prompt `walk-tour-guide.ts` `suggestions[]` (3 short texts en fin de réponse) + chips de relance FE. Pas encore d'orchestration "fin discussion œuvre A → transition fluide œuvre B" automatique. Promote V1.0.x hotfix window si MVP stub option C choisi (cf P0.D).
- [ ] **W1.2 Audio guide auto streaming** *(V2 hors-musée)* — TTS streaming continu balade, déclenché entrée POI, pause/reprise geste/voix. **Defer V2** (infra multi-POI absente, `museum_pois`/`walk_routes` tables n'existent pas).
- [ ] **W1.3 Chemin GPS itinéraire** *(V2 hors-musée)* — itinéraire balade généré (musée↔musée hors-mur, ou intra-salle), POI ordonnés, ETA, navigation simple. **Defer V2** (idem infra absente).
- [x] **W1.4 UX choix musée** — sélecteur musée explicite (recherche, carte, favoris) shipped
- [x] **W1.5 Détection musée auto** — geofence + LocationResolver shipped (jsonb-bbox path actif prod, PostGIS feature-detect runtime fallback — pas de migration `MigrateGeofenceBboxToPostgis` requise V1 contrairement à claim audit antérieur)
- [x] **W1.6 Détection endroit intra-musée** — partiel : QR-deeplink + propagation BE → LLM `[CURRENT ARTWORK]` ✔ ; SigLIP image-position deferred V1.1 (bloqué par seed P0.F1 + multi-rows pour kNN utile)

### W2 — Multi-tenancy musées (ex-priorité 2, KR1 pré-requis)

- [x] **W2.1 Onboarding musée** — flow admin pour ajout musée (nom, géo, horaires, KB locale, branding). *(merge W4 audit-360 2026-05-17 : `museum-web/src/app/[locale]/admin/museums/{page.tsx,new/page.tsx}` + Vitest unit tests 6 cas (validation requise / format slug / lat range / POST happy / server error / config.kbLocale). FE-only ; BE endpoint `POST /api/museums` admin-only existait déjà — TD-49 i18n parity FR à compléter post-launch.)*
- [x] **W2.2 Branding optionnel** — couleur primaire + logo musée dans header chat (B2B value). *(merge W4 audit-360 2026-05-17 : `museum-web/src/app/[locale]/admin/museums/[id]/branding/page.tsx` + tests 5 cas (load+show / load-error / hex invalide / logoURL non-HTTPS / PUT merge config / server error). Stockage `museums.config.branding` JSONB (primaryColor/secondaryColor/accentColor + logoUrl HTTPS). Logo upload réel = TD-50 ; en V1 = URL HTTPS uniquement.)*
- [x] **W2.3 Stats par musée** — dashboard admin : sessions, NPS, top œuvres demandées. *(merge W4 audit-360 2026-05-17 : extension `museum-web/src/app/[locale]/admin/analytics/page.tsx` avec sélecteur per-musée (auto-fetch `/api/museums`, query param `museumId` propagé sur les 3 endpoints usage/content/engagement). Affichage gracefully degradé si la liste musée n'est pas accessible.)*
- [x] **W2.4 Seed initial** — 3 musées pilotes contractés chargés en DB prod. *(merge W4 audit-360 2026-05-17 : `scripts/seed-pilot-museums.sh` orchestrator — Louvre Q19675 + Orsay Q23402 + Pompidou Q193554, idempotent, `--dry-run` / `--skip-museums` / `--skip-ingest` / `--only=<slug>`, pré-flight checks. Reste TL exec en prod + cross-worktree sync W3 geofence_polygon column.)*

### W3 — Web admin enrichi (ex-priorité 3, KR1 + KR4)

- [x] **W3.1 RBAC complet** — rôles `super_admin`/`museum_manager`/`moderator`/`visitor` + `RoleGuard` côté admin-web. Commit `3bf0813e` 2026-05-07 (P0 #9 admin user detail + P0-6 RoleGuard super_admin). *(audit 2026-05-14 : case oubliée)*
- [x] **W3.2 Page stats musée** — `admin/analytics/page.tsx` + `admin/reports/page.tsx` avec LineChart/BarChart Recharts. *(audit 2026-05-14 : case oubliée — scope per-musée reste à valider pour pitch B2B)*
- [x] **W3.3 Modération reviews** — shipped, scope museum-admin verifié.
- [x] **W3.4 Export CSV** — sessions, reviews, tickets — exigence légale + B2B reporting. *(merge `6893a6ab` 2026-05-16 R2 admin CSV export, audit 2026-05-17 tick-audit)*

### W4 — Landing web (ex-priorité 4, KR4)

- [x] **W4.1 Polish FR/EN existant** — `StorySection` 4-step timeline shipped (commit `53903a293` 2026-04-21), landing FR/EN assemblée dans `museum-web/src/app/[locale]/page.tsx`. *(audit 2026-05-14 : Lighthouse ≥95 + a11y axe-core à re-valider pré-launch)*
- [x] **W4.2 CTA inscription bêta** — formulaire email → liste pré-launch (1ère vague 100 testers) — couplé avec C6.3. *(merge `6893a6ab` 2026-05-16 R3 beta signup + Brevo list, audit 2026-05-17 tick-audit)*
- [x] **W4.3 Page B2B** — pitch musée (offre, pricing fourchette, contact form). *(merge `6893a6ab` 2026-05-16 R4 B2B pitch page + leads module, audit 2026-05-17 tick-audit)*

### W5 — Voice decision review (ex-priorité 5)

- [ ] **W5.1 Decision review** — 4 sem post-launch, décide WebRTC V1.1 (NEXT) ou continue features (V5.1 latency baseline a migré → C1.1)

### W6 — Chat backend modernization V1.1 (audit NORTHSTAR Phase B)

> Items post-launch chat backend issus de l'audit /team 360° 2026-05-16. ~28-30 j-h sur 8 semaines = ~5-6 j-h/sem (soutenable solo dev focus). Détail file:line + sources : `team-reports/2026-05-16-chat-backend-audit-360/`.

- [ ] **W6.1 Llama-Prompt-Guard-2-86M swap shadow → primary** — Phase A shadow run 7j (observeOnly=true) puis swap provider primaire, deprecate LLM-Guard prompt-injection scanner. Sidecar HF model GPU/CPU envelope déjà validé (cf. `llama-prompt-guard.adapter.ts:64-68`). Gain mesurable : **LLM01 recall 22% → 97.5% @ 1% FPR** (arXiv 2502.15427 LLM-Guard 86M vs Llama-PG2 benchmark). Effort 4j. *(C-P9)*
- [ ] **W6.2 Localiser system prompt FR/JA/ZH/AR** — créer `buildSystemPrompt_fr/_ja/_zh/_ar` + dispatcher par locale. Gap critique 8 locales B2C : prompt 100% EN + directive unique `Respond in ${language}` documentée arxiv 2505.11665 (EN-prompt non-EN-content quality degradation). Native review requis. Effort 3j. *(C-P4)*
- [ ] **W6.3 tsvector + RRF hybrid search** sur `artwork_embeddings` — Postgres 16 natif (pas d'extension binaire à installer), GIN index sur `title + metadata->>'artist'`. Réécrire `findNearest` pour fusion RRF avec reranker C9.13 reprenant top-K fused. Gain Recall@10 dense-only 78% → hybrid 91% (Supermemory benchmarks). Effort 5-6j. *(F-V1.1.1)*
- [ ] **W6.4 Anthropic provider + prompt caching middleware** — ajouter `@langchain/anthropic` + 1 branche `toModel()` + `anthropicPromptCachingMiddleware({ ttl: '1h' })` (cache read = 0.1× base = -90% cost cached prefix Claude). A/B test Claude Haiku 4.5 vs gpt-4o-mini sur prod : promptfoo recall ≥80%, latence p95 ≤3s, NPS-blind ≥7/10. Maintenir gagnant comme default + autre fallback provider. Effort 2j (B.T1-B.2 + T1-B.3). *(B Gap-2)*
- [ ] **W6.5 Folder refactor 42→22 dossiers** — Vagues 2-3 NORTHSTAR Option A hexagonal-plat. Profondeur 5→3. `git mv` + sed imports (codemod 2026-05-05 alias `@modules/chat/...`) NON-BREAKING. Fusions : `domain/{art-keyword,memory,message,session,visual-similarity}` → `domain/entities/` + `domain/repositories/`. `adapters/secondary/{pii,image,audio,guardrails}` → `adapters/ext/`. `useCase/{knowledge,web-search,enrichment,memory}` → `useCase/enrichment/`. Effort 6j (A-Vagues-2+3). *(A NEEDS-DISCUSSION)*
- [ ] **W6.6 Few-shot examples** — ajouter 3-5 prompts injectés dans `buildSystemPrompt` (artist alone, photo + question, refusal off-topic). +500-1500 tokens/req = ~$30-90/jour à 100k req/j (compensé par OpenAI L2 cache hits C9.5 si stable-prefix maintained). Effort 1.5j, gain +dialogue consistency + -retries. *(C-P5)*
- [ ] **W6.7 promptfoo per-locale smoke 50 × 10 locales + multi-turn + PII output tests** — daily-art smoke actuel 10 questions = noisy (1 fail = 10% drop). Étendre à 50 questions × 10 locales (RAG groundedness). Multi-turn scenario "user goes off-topic at turn 4". PII output assertions. Activate `llm_rubric_pct ≥30%` G-Eval rubric judge. Effort 3j. *(C-P7 + P8 + G T-New.7)*
- [ ] **W6.8 LangChain Langfuse callback handler officiel** — remplacer wrap manuel `withLangfuseTrace` par `langfuse-langchain` SDK. -30 LOC, auto-instrumentation chain/tool/retrieval events + token usage + model name + latencyMs capturés auto. Effort 1j. *(B T1-B.1)*
- [x] **W6.9 FE↔BE distributed tracing** — Sentry RN propage déjà `sentry-trace` header, BE Express middleware ne lit pas → no waterfall view cross-boundary. Intercepter header + propager dans `langchain-orchestrator-tracing` context. Effort 1.5j. *(G T-New.8)* *(merge W4 audit-360 2026-05-17 : FE `museum-frontend/shared/observability/sentry-init.ts` ajoute `tracePropagationTargets` (prod API + `/api/` LAN dev) ; BE `museum-backend/src/shared/observability/trace-propagation.middleware.ts` lit `sentry-trace` + `baggage` et attache aux attributs du span OTel actif (`musaium.parent.trace_id` / `span_id` / `sampled` / `baggage`). Middleware exporté, mount restant à wire dans `app.ts`. Doc `docs/observability/DISTRIBUTED_TRACING.md`. museum-web pas wired = TD-47, baggage validator = TD-48.)*
- [x] **W6.10 Guardrail fairness dashboard Grafana** — 90+63+108 séries Prom guardrail provisionnées (block-rate × locale × layer × user_tier × outcome) MAIS 0 panel → AI Act Art.10 compliance gap. 1 dashboard avec block-rate par locale × layer + FPR estimate. Effort 1j. *(G T-New.9 compliance)* *(merge W4 audit-360 2026-05-17 : `infra/grafana/dashboards/guardrail-fairness.json` shippé — 10 panels (overall block rate KPI + per-locale timeseries + per-layer + heatmap locale×layer + FPR proxy via promptfoo smoke + per-category top-10 + decisions volume per-locale). Templating sur `locale` + `layer` (multi-select). FPR vrai = TD-45 nécessite labelled prod data.)*

### W7 — Voice persona V1.1 + Dynamic WelcomeCard

> Différenciateurs UX post-launch identifiés par audit H (Product UX). Top 3 bets shippables V1.1 Q3 2026.

- [ ] **W7.1 Multi-persona voice** — 3 personas opt-in dropdown : **Curator** (formel, dates précises, voix `onyx` ou `echo`) + **Friend** default (chaleureux, anecdotes, voix `alloy` actuelle) + **Kid** (vocab simple, comparaisons quotidiennes, voix `nova` ou `fable`). Match Dex/Herodot UX réussi. A/B test 50 sessions/persona, thumbs-up rate ≥+15% delta sinon kill. Implem : `persona` field dans `useChatSession` + `TTS_VOICE_*` map + system prompt branch per persona. Effort 5-8j. *(H POC-1 + B.9)*
- [ ] **W7.2 Dynamic WelcomeCard** — replace 3 boutons fixes (anti-pattern memory `project_hybrid_product_philosophy`) par `useDynamicSuggestions()` combinant (a) GPS proximité, (b) dernière œuvre détectée, (c) heure du jour, (d) météo. Effort 3j, gain : fix doctrine debt + tap-rate measurable A/B. *(H POC-2 + B.10)*
- [ ] **W7.3 Mid-conversation idle nudge** — silence > 30s côté FE → bot dit "tu sembles réfléchir, je peux en dire plus sur ce détail ?". Driven par `useChatSession` idle timer. Comble gap §3.2 hybrid doctrine ("proactive in-chat" actuellement absent). A/B thumbs-down rate sur nudge ≤ 10% sinon kill. Effort 3j. *(H POC-4 + B.11)*
- [ ] **W7.4 STT prompt biasing** noms artistes/musée du contexte — extract artist names + titles depuis current museum context, inject comme STT `prompt` param OpenAI (≤ 224 tokens). Gain mesurable : **-15 à -30% WER** sur noms propres FR/EN (Picasso, Vermeer, Caravage, Léonard de Vinci). Effort 1j. *(E R-STT-7)*

### Personnalisation Spec C (deferred du sprint launch)

- [ ] PATCH `/auth/tts-voice` + voice catalog — déjà BE shipped, mount UI mobile (settings VoicePreferenceSection déjà shipped, vérifier flow complet end-to-end)
- [ ] LanguagePreference auto-detect (mode 20 sessions) — BE shipped, ajouter UX surface (toast "tu sembles parler français — passe en FR ?")
- [ ] SessionDuration P90 — BE shipped, exposer à orchestrator pour adapter longueur réponses LLM

### Voice WebRTC V1.1 (conditionnel)

- [ ] **Si KR2 NPS-voice <7** : intégration `gpt-4o-realtime` + WebRTC infra mobile + token streaming
- [ ] **Sinon** : skip, capacité dev redirigée Recommendations

### Premium full (post-stub validation)

- [ ] Stripe + iOS receipt + Android billing — démarrage conditionné data soft-paywall stub C6 (taux conversion + retention free→premium)
- [ ] Pricing décidé selon funnel data + benchmarks
- [ ] Receipt validation BE + entitlement cache

### Recommandations multi-musées

- [ ] Brainstorm spec via /team superpowers:brainstorming — cas d'usage : "tu as visité Louvre, suggère prochain musée selon affinité"
- [ ] Implémentation contained slice (à définir post-brainstorm, pas avant)

### Admin enrichi

- [ ] Push notifs musée → visiteurs abonnés (event, expo temporaire)
- [ ] Editor KB inline (museum-admin enrichit base sans dev)

---

## LATER — Q3+ 2026

- Réseau social museum-explorer (partage balade, follow autres visiteurs)
- Offline mode complet (pack musée DL avant visite, sync diff retour Wi-Fi)
- LLM cache cross-user warm (réponses populaires partagées entre visiteurs même musée)
- Spec D recall + recommendations + cross-session affinity (KILLED 2026-05-03 — réévaluer si signal use-case émerge)
- Multi-langue extended (au-delà FR/EN — IT, ES, DE, JP, AR pour musées internationaux)
- Realtime social — visiteurs même musée peuvent se voir + chat groupe

### Infra VPS hardening post-launch (incident 2026-05-20)

> Origine : VPS OVH plein à 100% deux fois en un mois (24 GB Docker images + 5.8 GB build cache + journald). Auto-rollback a tenu mais cycle d'incident répétable + non-scalable si charge users. Hygiene quotidienne (D + E + cron docker prune + log rotation + journald cap) appliquée 2026-05-20 — ces items sont les fondations architecturales post-launch.

- [ ] **F1 Disque dédié pour `/var/lib/docker`** — OVH Additional Disk attachable, mount sur `/var/lib/docker` (ou volumes critiques `museum_pgdata`/`museum_uploads`). Root OS isolé du data → un container qui log en boucle n'éclate plus l'OS. Effort 1 j (storage attach + symlink migration + downtime planifiée 30 min).
- [ ] **F2 Photos visiteurs sur S3 / B2** — `museum_uploads` volume va exploser dès le launch (chaque chat avec image = upload). Offload vers OVH Object Storage ou Backblaze B2 (Glacier-tier ~$0.005/GB/mois). Backend signe URLs temporaires côté client. Permet scale linéaire indépendant du VPS. Effort 3-5 j (adapter S3-compat + signed URL flow + migration backfill).
- [ ] **F3 DB backups off-VPS** — `deploy_db_backups` actuellement local sur VPS = single point of failure. Push `pg_dump` via `restic` vers B2/S3 (rotation 30j daily + 12 monthly). Effort 2 j (script + cron + secrets + restore drill). RPO/RTO documentés dans runbook.
- [ ] **F4 Split VPS multi-tenant** — actuellement museum + `portfolio25_*` + `home/telegram` cohabitent sur la même box. Quand museum monte en charge, isoler sur VPS dédié OVH (les autres restent sur la petite box). Coût ~5€/mois supplémentaire vs risque d'interférence. Trigger : quand museum CPU avg > 50% ou disk growth > 5 GB/semaine post-launch.
- [ ] **F5 Container resource limits explicites** — actuellement chaque service consomme sans cap. Ajouter `deploy.resources.limits` (mémoire + CPU) dans docker-compose.prod.yml pour backend, web, prom, grafana. Empêche un service runaway de killer les autres. Effort 1 j (baseline mesure + cap conservateur + tests load).
- [ ] **F6 Disk-usage SLO + ratchet** — métrique `vps_disk_used_pct` exposée via node-exporter (item E livré 2026-05-20), SLO target ≤ 60% steady-state. Alerte already configured ≥ 80% (warning) / ≥ 90% (critical). Ratchet trimestriel : si baseline drift > +10% trimestre, ouvrir TD pour root-cause.

### Moonshot V1.2+ B2B-ready + 20-ans-avance (audit NORTHSTAR Phases C+D)

> Bets stratégiques issus de l'audit /team 360° 2026-05-16. Détail file:line + risk register + sources externes : `team-reports/2026-05-16-chat-backend-audit-360/roadmap/NORTHSTAR.md` §6-7.

**M1 V1.2 B2B pitch-ready (Q3-2026, ~130 j-h équipe 2 devs)** — pour signer LOI musée pilote :

- [ ] **M1.1 Curator-overrideable LLM** — musée contracté peut surcharger response LLM pour 50 œuvres priorité (override-pack JSON). Hybrid Bloomberg quality + Musaium scale. Critique pour pitch B2B 2026 Q3. Effort 15-20j. *(H §6.7 + §8.4)*
- [ ] **M1.2 Dashboard analytics musée** — drop-off, top works, satisfaction agrégée, NPS par room. ROI mesurable côté musée (170% report ViitorCloud 2026 cité). Effort 30-40j. *(H §8.4)*
- [ ] **M1.3 White-label / co-branding configurable** — couleur primaire + logo musée dans header chat + tier Smartify-style Starter/Branded/Premium. Effort 20j. *(H §8.4)*
- [ ] **M1.4 AR pilot 1 musée contracté** — ARKit + ARCore phone-first (démocratie), Vision Pro / Quest 3 BYOD pour pilots premium. Overlay 3D restoration historique, X-ray pigments, ligne de regard composition. Match Smartify €1.8M move AR/XR. Effort 30j. *(H §6.4 + §7.2)*
- [ ] **M1.5 Sign Language LSF/BSL overlay top 50 œuvres par musée pilote** — pré-enregistré curator-curated. EN 301 549 §1.2.6 compliance + différenciateur a11y vs Bloomberg/Smartify. Inspiration SignGuide. Effort 25-40j. *(H §8.4)*
- [ ] **M1.6 Voice pack artistes domaine public** — Cézanne / Monet / Renoir (décédés > 70 ans, légal sans consentement) via ElevenLabs Iconic Marketplace ou voice clone interviews/lectures publiques. NPS bait + premium B2B upsell. **Picasso/Frida/Warhol = 6-fig licensing négo successions (NE PAS planifier sans partenariat).** Effort 1 sem POC + 1 sem prod. *(H §7.6 + NORTHSTAR CONF.6)*

**M2 V1.2 RAG modernization (triggered)** :

- [ ] **M2.1 Anthropic Contextual Retrieval** sur chunks Wikidata — prepend chunk-specific context summary BEFORE embedding + BM25. Gain **-49 à -67% failed retrievals** (compoundé avec reranker C9.13). Trigger : KB miss rate > 20% mesuré Langfuse post-launch. Effort 3-4 sem. *(F BB3 + dispatcher prep)*
- [ ] **M2.2 GraphRAG Microsoft modular** sur Wikidata art-domain — multi-hop natif (artiste → mouvement → influences → œuvres dérivées). Gain **+3.4x precision** multi-hop. Trigger : queries multi-hop > 30% trafic. Effort 4-6 sem. *(F BB1)*
- [ ] **M2.3 Jina-CLIP-v2 multilingual encoder swap** — 89 langues natif (vs SigLIP-2 EN-leaning), 512×512. Trigger : B2B EU non-EN onboarding (Uffizi, Prado, Reina Sofía). Effort 2-3 sem. *(F BB2)*
- [ ] **M2.4 gpt-realtime-mini split walk-mode** — 300ms E2E latence walk-mode uniquement (paywall 5min/jour freemium), V1 sync reste pour chat-text. Trigger : NPS-voice <7 sur 4 sem post-launch (W5.1 decision review). Effort 2-3 sem. *(E R-VOICE-WALK)*
- [ ] **M2.5 Exa.ai / Linkup.so eval parallèle vs Tavily** — hedge supply chain risk (Nebius rachat Tavily Feb 2026 $400M). 1 sem A/B in Langfuse. *(F BB5)*

**M3 V2 moonshot 20-ans-avance (2027+)** :

- [ ] **M3.1 3DGS scan pivots œuvres** (Mobile-GS 1125 FPS / 4.6 MB / OpenUSD support April 2026) — 1 œuvre pivot offerte gratuitement par musée contracté = pitch B2B wow + investor showcase. Polycam pro / Luma AI / Splat.dev scan ($5-50/œuvre, 5-50 MB storage). Marché immersif $12B en 2028 (Frame Sixty). Effort 1 sem POC + 2-3 sem industrialisation (CDN + ingestion + viewer web/native). *(Dispatcher 20yr-bets + NORTHSTAR §7.3)*
- [ ] **M3.2 Live multi-visitor co-presence "shared walk"** — indoor beacons (Navigine) + WebSocket real-time, 2 amis dans même musée se voient sur map + emoji discret "viens voir ça" + chat partagé. **Différenciateur UNIQUE marché** (zéro concurrent — vérifié H §4). RGPD geolocation partagée → opt-in strict per-session. Effort 2-3 sem. *(H §7.7 + dispatcher 20yr)*
- [ ] **M3.3 Generative AI re-mix de l'œuvre** — DALL-E 4 / Flux 2 / Stable Diffusion XL : "ré-imagine cette Joconde en cubisme moderne", "joue-moi Picasso en synthwave". User partage privé par défaut. **Whitepaper droit d'auteur requis** (œuvres récentes Picasso < 70 ans post-mortem en CE = ambigu fair use). Inspiration Dataland LA Refik Anadol. Effort 3 sem. *(H §7.5)*
- [ ] **M3.4 Affective computing emotion-adaptive content** — front-cam on-device 89.78% group / 99.79% individual (CNN ACM JOCCH 2024). Bot adapte ("tu sembles ému, je te laisse un moment"). **⚠️ AI Act Art.5 prohibition** workplace/school. Musée loisirs = zone grise → **légal review obligatoire avant ship**. Italian Garante 5M€ Replika 2025 = signal CNIL serait dur. Privacy by design strict : ON-DEVICE only, opt-in granulaire, désactivé par défaut, no storage. Telemetry agrégée anonyme musée = B2B value. Effort 2-3 sem POC. *(H §7.1 + dispatcher)*
- [ ] **M3.5 Wearable haptic feedback art guide** — Apple Watch double-tap "regarde à droite" (silent wayfinding multi-room) + cadence battant doux "ralentis devant cette œuvre". HapticNav prior art existant + Apple Watch haptic taps API stable. UX différenciateur silencieux musée bondé + a11y ADHD. Effort 2 sem. *(H §7.4)*
- [ ] **M3.6 Voice mood detection prosody** — F1 0.78-0.87 SOTA (transformers prosody), depression 98.7% lab (JMIR Mental Health 2025). Bot détecte stress/fatigue audible → propose "veux-tu une pause ?". Strictly on-device opt-in, no storage prosody features. Cross-lingual generalization faible (limitation). Effort 2-3 sem R&D. *(H §7.8)*
- [ ] **M3.7 Cross-museum visit graph & recommendation** — "tu as adoré Pollock à NYC, va voir Soulages à Centre Pompidou". Vector embedding sur visites passées + cosine similarity. Déjà 80% bâti via `useResumableSession` (chat sessions persisted, museumName extracted). Effort 2-3 sem. *(H §7.9 + dispatcher 20yr)*

**NE PAS planifier (raison documentée NORTHSTAR §7.8)** :
- BCI Neuralink — 2030+ pas commercial. Watch + retest 2028.
- Voice clone Picasso/Frida/Warhol DIY — négo six-fig avec successions (Picasso Adm, Frida Kahlo Estate, Warhol Foundation). Pilot 1 succession partenaire revenue share 50/50, jamais DIY.
- Persona AI manipulatrice émotionnelle (Replika antipattern, Italian Garante fine 5M€ 2025).

---

## KILLED (ne pas redécider sans signal nouveau)

| Item | Date kill | Raison |
|---|---|---|
| Spec D recall + cross-session affinity | 2026-05-03 | Solution chercher problème, pas de use-case clair |
| Roadmap NL_LINKEDIN_* (4 plans) | 2026-05-03 | One-shot, exécuté |
| Roadmap PROD_10_10 user-first | 2026-05-03 | Remplacée par cette roadmap |
| SSE streaming chat | 2026-04 (ADR-001 historique) | Replaced by sync chat — déjà déprécié |

---

## Comment utiliser cette roadmap

1. **Début sprint** : /team lit ce fichier + ROADMAP_TEAM.md, propose features Phase 1 (NOW) à attaquer (Spec Kit obligatoire si non-trivial). Phase 2 (NEXT) bloquée tant que Phase 1 incomplète.
2. **Pendant sprint** : coche `[x]` au merge. Bloqué = note inline `[BLOCKED: raison]`.
3. **Pivot Phase 1 → Phase 2** : quand C1…C7 tous cochés, NEXT remonte en NOW au prochain `/team roadmap:rotate`.
4. **Fin sprint** : réécriture file complète (NOW vidé, NEXT remonte, LATER trié, KILLED preserve), commit `docs(roadmap): sprint <YYYY-MM-DD>`.
5. **Hors sprint** : nouvelle idée → ajoute LATER avec date. Promotion vers NEXT au tri suivant.

**Source de vérité unique pour produit.** CLAUDE.md pointe ici. /team consolide à chaque cycle (cf. ROADMAP_TEAM.md §Auto-consolidation).
