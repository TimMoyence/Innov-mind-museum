# Roadmap Produit — Musaium

> **Vivante.** Réécrite à chaque sprint (4 semaines). Snapshots précédents = git history.
> **Sprint courant :** 2026-05-03 → 2026-06-01 (launch day).
> **Horizon :** 1 mois NOW + 1 trimestre NEXT/LATER.

---

## North Star

**Musaium est l'assistant balade culturelle.**

- Hors-musée ET intra-musée
- Multi-musées (pas une app par musée)
- Voice-first (mains libres pendant la balade)
- AI conversationnel contextuel (œuvres, lieux, histoire)

## Audience cible

| Segment | Modèle | État |
|---|---|---|
| **B2C visiteur** | Freemium (3 sessions/mois free, abonnement Premium illimité) | Hypothèse — soft-paywall stub V1 (C6) pour valider data-driven |
| **B2B musée** | Licence annuelle + co-branding optionnel | Hypothèse — pilotes à signer avant juin |
| **Institutionnel** | Subvention culture / appel à projets | Backlog 2026 H2 |

---

## OKR Q2-2026 (Mai-Juin)

**Objective :** Lancer Musaium V1 le 1er juin 2026 avec une expérience balade culturelle hors-musée multi-musées qui donne envie de revenir.

| KR | Cible | Mesure |
|---|---|---|
| **KR1 — Pilotes B2B** | ≥3 musées contractés (LOI signée) avant 1er juin | Compte signatures |
| **KR2 — Walk V1 NPS** | NPS post-balade ≥7/10 sur 50 sessions test | Survey in-app |
| **KR3 — Stabilité** | Crash-free ≥99.5% + chat p99 <5s + 0 P0 bug | Sentry + Langfuse + Grafana |
| **KR4 — Adoption** | 100 visiteurs B2C inscrits semaine 1 post-launch | Analytics |

---

## Stratégie : Phase 1 Consolidation → Phase 2 Évolution

Décision 2026-05-08 (brainstorm reprio) : **consolider l'existant à un niveau premium AVANT d'empiler Walk V1**.

Hypothèse : si chat / image / Wikidata / no-halluc / compare sont premium-grade dès V1, alors :
- KR2 (NPS Walk) bénéficie d'un fondement chat solide
- Pitch B2B (KR1) montre features différenciantes (image compare = wow)
- Soft-paywall stub (KR4 funnel data) valide hypothèse freemium pré-Stripe full
- Phase 2 démarre sur fondation stable, pas sur surcouche fragile

**Phase 1 (NOW)** = items C1…C7 ci-dessous. Bloque démarrage Phase 2 tant qu'incomplet.
**Phase 2 (NEXT)** = items Walk V1 + multi-tenancy + admin + landing, déplacés depuis l'ancien NOW.

---

## NOW — Phase 1 Consolidation (sprint launch 2026-05-03 → 2026-06-01)

> **Discipline :** chaque feature non-trivial passe par /team Spec Kit (spec.md + design.md + tasks.md).
> Coche `[x]` au merge. Bloqué = `[BLOCKED: raison]` inline.
>
> **Sprint segment intermédiaire P1 closure :** 2026-05-05 → 2026-05-19, plan détaillé dans [`docs/SPRINT_2026-05-05_PLAN.md`](./SPRINT_2026-05-05_PLAN.md). Feature freeze 2026-05-19, soak staging 48h, release checklist post-19.

### C1 — Chat fast (latency premium)

> Existant : sync-only pipeline shipped + Langfuse spans + targets P50<3.5s WiFi. Manque dashboard p99 baseline + LLM cache audit + optim data-driven.

- [ ] **C1.1 Dashboard Grafana p50/p95/p99** — STT + LLM + TTS depuis spans Langfuse existants. Alerte si p99 >6s. (ex-V5.1)
- [ ] **C1.2 LLM cache audit + activate** — vérifier wiring `llm-cache.service.ts` (ADR-035) en prod, mesurer hit-rate, tune TTL si actif
- [ ] **C1.3 Optim data-driven** — après baseline, attaquer goulot identifié (parallélisation tools, prompt compaction, model routing si pertinent)

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

- [ ] **C3.1 Embeddings stack** — CLIP ou SigLIP image encoder, BE service dédié
- [ ] **C3.2 pgvector index** — migration TypeORM nouvelle table `artwork_embeddings`
- [ ] **C3.3 Catalogue seed initial** — pull Wikidata + Wikimedia Commons sur top musées contractés (~10-20k œuvres), ingest pipeline
- [ ] **C3.4 Endpoint similarity** — `/chat/compare` : input image user → top-K similaires + Wikidata enrichment + scoring fusion (visual + metadata)
- [ ] **C3.5 UX FE compare** — message bot inclut card `ImageCompareCarousel` avec œuvre similaire + photo + caption rationale (pourquoi celle-là)

### C4 — IA sans hallucination

> Existant : keyword guardrail multilingue + LLM judge V2 confidence scoring + output guardrail + KB Wikidata. Manque : WebSearch fallback wiring orchestrateur + threshold tuning + citations sources + regression eval continu.

- [ ] **C4.1 WebSearch fallback wiring** — Brave wrapper existe, brancher orchestrateur quand KB miss + judge confidence < threshold (ex-W1.7)
- [ ] **C4.2 Threshold confidence tuning** — calibrer cutoff LLM judge V2 sur dataset réel chat prod
- [ ] **C4.3 Promptfoo regression suite anti-hallucination** — T1.5b real-mode bake (cf. ROADMAP_TEAM.md)
- [ ] **C4.4 Citation enforce** — LLM doit citer source dans réponse (struct output `sources[]: {url, type, title}`), affichage FE clickable

### C5 — Wikidata premium (resilient)

> Existant : live SPARQL + Redis cache 7d + fail-open + prompt injection wrap (ADR-035 Accepted-Implemented). Manque : circuit-breaker + downtime metric + local dump fallback.

- [x] **C5.1 Circuit-breaker SPARQL** — opossum 9.x via `WikidataBreakerClient`, drop-in `KnowledgeBaseProvider`. 7 tests TDD transitions CLOSED/OPEN/HALF_OPEN + 4xx-no-trip + Step 7.1 DoD null fail-open. (PR-C5, 2026-05-11, ADR-039)
- [ ] **C5.2 Downtime metric Langfuse** — span `chat.knowledge.lookup` shipped (PR-C5) ; alertes p95>500ms / error-rate>5% restent à wirer Phase 6.2-4
- [ ] **C5.3 Local dump backup** — port + `NoopWikidataKbDumpRepository` + cascade soak `LOCAL_DUMP_FALLBACK_AFTER_MS` shipped (PR-C5) ; ingest = write-through organique au lieu de 150GB monthly (ADR-039 D4) — migration `wikidata_kb_dump` + hook UPSERT en hot-path à Phase 4-light
- [ ] **C5.4 Cache hit-rate monitoring** — Prometheus counters + Grafana dashboard à Phase 6.2-4

### C6 — Premium soft-paywall stub

> Existant : 0. Hypothèse 3 sessions/mois free → premium illimité = à valider AVANT Stripe full. Stub V1 = compteur + écran upsell sans paiement.

- [ ] **C6.1 BE compteur sessions/mois par user** — table tracking + middleware quota check pré-orchestrator
- [ ] **C6.2 Tier model `free | premium` sur User entity** — migration TypeORM, pas de Stripe yet
- [ ] **C6.3 FE écran upsell** — modal sur quota dépassé, CTA "rejoindre liste premium" → email capture (Brevo list)
- [ ] **C6.4 Admin override** — toggle premium manuel pour pilots B2B testers (cf. M2.x Phase 2)
- [ ] **C6.5 Telemetry conversion funnel** — combien hit quota, combien click upsell, combien email captured

### C7 — Stabilité prod (KR3)

- [ ] **C7.1 S6.1 Smoke prod** — `pnpm smoke:api` étendu auth + chat + image upload + voice end-to-end
- [ ] **C7.2 S6.2 Chaos game-day** — `docs/CHAOS_RUNBOOKS.md` Redis kill + LLM down + DB readonly sur staging
- [ ] **C7.3 S6.3 P0 bug zero** — triage Sentry + Linear, aucun ouvert avant 1er juin
- [ ] **C7.4 S6.4 Release checklist run** — `docs/RELEASE_CHECKLIST.md` exécutée et signée

---

## NEXT — Phase 2 Évolution Walk V1 + B2B (post-Phase 1)

> Démarrage conditionné fin Phase 1. Tous les items déplacés depuis l'ancien NOW (renommés en `Wx.y`). Re-priorisation interne possible au moment du pivot.

### W1 — Walk V1 IMPROVE (différenciateur core, ex-priorité 1)

- [ ] **W1.1 Transitions entre œuvres** — orchestrateur chat détecte fin discussion œuvre A, propose transition fluide vers œuvre B (suggestion proactive, sans rupture cognitive)
- [ ] **W1.2 Audio guide auto** — TTS streaming continu pour balade, déclenché à l'entrée d'un point d'intérêt, pause/reprise par geste ou voix
- [ ] **W1.3 Chemin GPS** — itinéraire balade généré (musée→musée hors-mur, ou intra-salle musée), points d'intérêt ordonnés, ETA, navigation simple
- [ ] **W1.4 UX choix musée** — sélecteur musée explicite (recherche, carte, favoris), pas seulement géolocalisation passive
- [ ] **W1.5 Détection musée auto** — geofence + LocationResolver (déjà partiel, étendre à liste musées contractés)
- [ ] **W1.6 Détection endroit intra-musée** — beacon BLE, QR-code à l'entrée salle, ou estimation pos via image (œuvre vue caméra)

### W2 — Multi-tenancy musées (ex-priorité 2, KR1 pré-requis)

- [ ] **W2.1 Onboarding musée** — flow admin pour ajout musée (nom, géo, horaires, KB locale, branding)
- [ ] **W2.2 Branding optionnel** — couleur primaire + logo musée dans header chat (B2B value)
- [ ] **W2.3 Stats par musée** — dashboard admin : sessions, NPS, top œuvres demandées
- [ ] **W2.4 Seed initial** — 3 musées pilotes contractés chargés en DB prod

### W3 — Web admin enrichi (ex-priorité 3, KR1 + KR4)

- [ ] **W3.1 RBAC complet** — rôles museum-admin (1 musée), super-admin (tous), visitor — déjà partiel
- [ ] **W3.2 Page stats musée** — graphes Recharts (sessions/jour, NPS, top œuvres) — pour pitch B2B
- [ ] **W3.3 Modération reviews** — déjà shipped, vérifier UX museum-admin scoping
- [ ] **W3.4 Export CSV** — sessions, reviews, tickets — exigence légale + B2B reporting

### W4 — Landing web (ex-priorité 4, KR4)

- [ ] **W4.1 Polish FR/EN existant** — StorySection shipped, vérifier copy + a11y + Lighthouse ≥95
- [ ] **W4.2 CTA inscription bêta** — formulaire email → liste pré-launch (1ère vague 100 testers) — coupler avec C6.3
- [ ] **W4.3 Page B2B** — pitch musée (offre, pricing fourchette, contact form)

### W5 — Voice decision review (ex-priorité 5)

- [ ] **W5.1 Decision review** — 4 sem post-launch, décide WebRTC V1.1 (NEXT) ou continue features (V5.1 latency baseline a migré → C1.1)

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
