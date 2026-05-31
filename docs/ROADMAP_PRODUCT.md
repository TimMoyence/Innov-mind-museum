---
kind: roadmap
asof: 2026-05-31 — J-8 avant launch (2026-06-07)
gonogo: GO_WITH_RISKS
blockers: 1 code · 5 ops (Tim)
stats: done=97 partial=28 open=48 ops=5
---

# Roadmap Produit — Musaium

> **Source de vérité unique pour le produit.** État **vérifié-code** (on croit le code, pas la doc ni les marqueurs antérieurs).
> Façade lisible ici ; la **preuve item-par-item** (178 items, path:line, re-vérif adversariale) vit dans [`ROADMAP_AUDIT_TRAIL.md`](ROADMAP_AUDIT_TRAIL.md). Snapshots = `git log -- docs/ROADMAP_*.md`.
>
> **Vérification 2026-05-31** — workflow `roadmap-launch-readiness-audit` : 11 clusters × sous-agents lisant le code réel, puis **re-vérification adversariale** de chaque blocker (un 2ᵉ agent relit le code sans croire le 1er) + veille web (concurrence / compliance UE / NPS). **178 items : ✅ 93 livré-vérifié · 🟧 28 partiel · 🔴 48 ouvert · ♻️ 4 stale-claim · 🧑‍🔧 5 ops.**
>
> **Verdict launch : 🟧 GO avec risques.** Les 21 « blockers » nominaux se réduisent, après re-vérification, à **1 vrai blocker code + 5 actions ops** (ci-dessous ; C10 fermé 2026-05-31, commit `787e2ba9`). Les 14 autres étaient des *stale-claims* — des bugs déjà corrigés que la doc traînait encore (consent gating, museum_id FK, budgets latence, BOLA scope, MFA mobile retirée).

---

## North Star

**Musaium V1 = compagnon culturel IA voice-first, dedans ET dehors.** Tu photographies une œuvre (en musée) ou un monument/lieu (en ville) → chat AI conversationnel voice-first (STT + TTS Opus) sur ce que tu vois, mêmes capacités in/out musée, + **suggestions de proximité** (« un monument à côté », « un musée pas loin ») sans navigation. Carnet post-visite dans les deux modes.

**V2 = parcours guidé navigué** (itinéraire GPS multi-POI + audio streaming auto entre points). Sprint sep-nov 2026 si signal KR2 NPS positif. Distinction nette : **V1 = réactif** (tu photographies ce qui est devant toi) · **V2 = proactif navigué** (l'app te guide d'un point à l'autre et narre en route).

**Audience** — B2C freemium (cible V1, soft-paywall stub à valider data-driven). **B2B musée = hypothèse future, 0 musée démarché à ce jour** (les 3 musées Bordeaux = données de démo). Institutionnel = backlog H2.

**OKR Q2** — KR1 pitch B2B démontrable · KR2 NPS post-session ≥7/10 (instrumenté, PR #301) · KR3 crash-free ≥99.5 % + chat p99 <5s · KR4 100 inscrits B2C semaine 1.

---

## 🚦 P0 — Launch blockers restants (avant 2026-06-07)

> Tout le reste du P0 historique (sécurité, GDPR, feature-gates, stabilité) est **vérifié livré sur `dev`** — détail § V1 ci-dessous et dans l'audit trail. Voici les **seuls items qui bloquent encore** le launch.

### Code (1)

- ✅ **C10 — « un autre musée à côté » câblé** — `home.tsx` passe désormais `onChooseAnother={() => router.push('/(stack)/museums-picker')}` : la CTA suggestion-de-proximité (NorthStar V1) route vers le picker existant (reuse, UFR-016). Test d'intégration AC1 (nav picker) + AC2 (pas de session chat), red prouvé avant câblage. Commit `787e2ba9` sur `dev`, **fermé 2026-05-31**.
- 🔴 **CNIL âge-15 — preuve e2e manquante** — le code *enforce* déjà le floor (`auth.schemas.ts` `dateOfBirth` requis + `register.useCase` rejette <15 ans, CNIL Délib. 2021-018). Reste à **prouver par 1 flow Maestro happy-path** (UFR-021) que le path date `DD/MM/YYYY` FR n'a pas régressé (classe de bug DOB-2026-05-17). Jest seul ne suffit pas.

### Ops — Tim, hors-code (5)

- 🧑‍🔧 **P0.B13** — provisionner l'alias **`security@musaium.com`** (OVH → Gmail). Requis par la clé PGP publiée, le breach-playbook et l'intake VDP/CRA. ~30 min.
- 🧑‍🔧 **P0.B14** — signer/confirmer le **DPA Langfuse** (`SUBPROCESSORS.md:52` encore « TBD »). Langfuse traite le contenu des prompts → GDPR Art.28 obligatoire avant données réelles en prod.
- 🧑‍🔧 **P0.B17** — **révoquer la clé Anthropic** encore vivante côté secret-store Tim (code + `.env.example` déjà nettoyés ; rotation out-of-band).
- 🧑‍🔧 **P0.B19** — renseigner les **contacts réels** du breach-playbook (`docs/incidents/BREACH_PLAYBOOK.md`) + confirmer le **S3 PAB** (`GetPublicAccessBlock`, pas de Terraform → vérif console/sentinel).
- 🧑‍🔧 **P1-FA15 / I-OPS5** — poser **`EXPO_PUBLIC_PLAUSIBLE_DOMAIN`** en prod (sinon funnel KR4 silencieusement no-op) + **1 restore-drill** confirmant que le backup DB atterrit dans `backups/daily/`.

### ⚖️ Décision à trancher avant launch (pas un blocker)

- 🟧 **/chat/compare (image-similarity C3)** — `fetch-models.sh` tolère le bucket GCS non-provisionné (exit 0 sur 404) et `EMBEDDINGS_PROVIDER` retombe sur `replicate`. **Décider** : provisionner `musaium-models-public` (SHA-pin) **OU** `EMBEDDINGS_PROVIDER=replicate` + `REPLICATE_API_TOKEN`, sinon /chat/compare est inerte en prod.

---

## ✅ V1 — Livré & vérifié-code (sur `dev`)

> Une ligne par cluster — chaque ✅ = vérifié contre le code cette session. Détail item-par-item + path:line dans [`ROADMAP_AUDIT_TRAIL.md`](ROADMAP_AUDIT_TRAIL.md).

- ✅ **Sécurité & PII (P0.A — 9/9)** — email domain-only (`extractEmailDomain.ts`), DOB hard-gate 400, Sentry scrub URL **+ event.tags** (`sentry-scrubber.ts:37-54`, 16 clés), Langfuse `mask` câblé, cost+latency circuit breakers enforced sur les 2 paths (`langchain.orchestrator.ts:162-177,556-559`).
- ✅ **Sécurité round 2 (P0.I-SEC — 10/12)** — Redis `maxmemory`, coût vision par-image, `POST /art-keywords` gaté rôle+rate-limit, `EXPORT_PSEUDONYM_SALT` ≥32 prod, TOTP replay + access-token denylist, **KE scopé `museum_id`** (#300, cross-tenant bleed clos), deps `ws`/`brace-expansion` pinnées. *(résiduels mineurs : I-SEC4 api-key role, I-SEC6 login-key email → V1.0.x.)*
- ✅ **GDPR & anonymisation (P0.B — 12/19 code)** — cleanup audio TTS à la suppression compte, unsubscribe Brevo, **DSAR Art.15 complet** (UserMemory/AuditLog/feedback/reports/social/api_keys + artwork_matches), consent BE enforced au call-site LLM, purge S3 orphelins câblée, consent namespace per-user, **bypass raw-coords GDPR Art.7 clos** (#305). *(le reste = ops B13/B14/B17/B19.)*
- ✅ **Feature-gates (P0.C — 6/10)** — mapping licence URI→slug Wikidata, **`reviews.museum_id` FK** (migration mergée), télémétrie Plausible câblée FE+BE (consent-gated), `museum_manager` dans l'AdminShell. *(C8 stats museum_id = no-op documenté, C1 SigLIP → décision ci-dessus.)*
- ✅ **Stabilité (P0.I-OPS — corrigé)** — alertes API 5xx/up==0 **présentes** (`api-health.yml`), budgets latence cohérents (`env.ts:163-165`), **index ops** créés (#300 `AddOpsStabilityIndexes`). *(I-OPS3 double-run migration, I-OPS6 pgvector gate, I-OPS8 CI gates → V1.0.x.)*
- ✅ **a11y / compliance / correctness (P0.I-CMP/I-FIX — 5/9)** — **AI Act Art.50** badge disclosure contraste AA (#298), **40 clés consent i18n 8 locales**, invalidation cache LLM corrigée, clé cache cross-artwork. *(I-CMP3/I-CMP5 résiduels a11y → V1.0.x.)*
- ✅ **Honnêteté / dead-code (P0.D — 4/5)** — burial SSE FE (−434 LOC), stryker cache dé-tracké (−18,5 MB), Llama-Prompt-Guard supprimé (ADR-051), 3 `describe.skip` retirés.
- ✅ **Findings critiques (FA — 6)** — bulle assistant vide texte-seul corrigée (FA1, `406fe9b82`), **KR2 NPS livré** (FA4, widget 0-10 + `aggregateNps` + dashboard), **`museum_manager` BOLA fermé** (FA6, scope par tenant + co-branding mobile), MFA mobile **entièrement retirée** (FA2, web-admin-only), DSAR artwork_matches (FA12).
- ✅ **Plateforme produit (P0.F — 19/21)** — cache LLM v2 + Prom + Grafana, enrichment image fan-out, **SigLIP ONNX + pgvector halfvec(768) HNSW**, KnowledgeRouter cascade KB→judge→WS, **halluc-eval CI gaté** (97-corpus, `ci-cd-backend.yml:658`), paywall stub + quota + tier, **audio-description WCAG** + AI Act badge + i18n 8/8, refonte chat UX (composer/hero/bubble/carnet/QR), géofence hybrid, RBAC + moderation + CSV, landing + B2B page, **distributed tracing FE↔BE**, guardrail fairness dashboard, TTS Opus + voice preference.

---

## 🔧 V1.0.x — Hotfix window (2026-06-07 → 06-21)

> Shipped-mais-gap-mineur OU ouvert-non-bloquant. À traiter dans la fenêtre hotfix post-launch.

- 🟧 **C8 — stats multi-tenant museum_id** : RBAC/BOLA fermé, mais `WHERE museum_id` sur users/sessions/messages = no-op (colonnes absentes). Axe analytics par-musée inerte tant que non câblé.
- 🟧 **I-CMP3 / I-CMP5 — résiduels a11y** : bulle UTILISATEUR masque son texte (`ChatMessageBubble.tsx:237-238`), live-region non-conditionnelle (`StreamingBody.tsx:54`), 4 refs `support@musaium.app` mortes (`accessibility-content.ts`).
- 🔴 **SEC-PRIVILEGE-ESCALATION** : route `PATCH /users/:id/role` **est** gardée `requireRole('admin')` (pas d'escalade cross-tier), mais `changeUserRole.useCase.ts:19-57` laisse un admin promouvoir `super_admin` sans check de rang acteur↔cible. Ajouter un rank-guard.
- 🔴 **I-OPS1 — Sentry release/dist** : `sentry-init.ts:35-47` sans `release`/`dist` → les crashes remontent mais symbolication/attribution-build dégradées. Ajouter via plugin EAS Sentry.
- 🔴 **I-OPS3 / I-OPS6 / I-OPS8** : migrations 2× par deploy (idempotent mais à rendre single-path), pgvector ≥0.7.0 jamais gaté en code, CI gates partiellement théâtre (`ai-tests` jamais en PR, Expo Doctor `continue-on-error`).
- 🟧 **I-OPS5 — backup shared-fate** : backup DB OK mais **dans le même bucket que les médias** + volume `uploads` non-backupé. 2ᵉ bucket off-site.
- 🟧 **P1-FA7 / P1-FA9 / P1-FA13** : logger `req.originalUrl` non-scrubbé (`error.middleware.ts:97`), recovery cost-breaker wipe `dailySpend` (`three-state-circuit.ts`), compte smoke seedé prod (guardé env, à supprimer post-deploy).
- 🔴 **Finitions feature** : `C3.5 useCompareImage` hook orphelin (FE ne peuple jamais `compareResults`), `audioDescriptionMode` write FE→BE zéro call-site (sync cross-device cassé), Accept-Language `fr-FR` strict-equals (`chat-compare.route.ts:77-82`), `reviews.userName` ghost field.
- 🔴 **Maestro UFR-021** : `audio-recording-flow.yaml` cassé (labels inexistants) + flows manquants AI-badge / voice-intro / paywall.
- 🧑‍🔧 **C7.5 / C8.x** — smoke device TTS iPhone réel (Tim), CNIL dry-run, CERT-FR 1Password, calendrier renouvellement PGP 2027.

---

## 🔭 V1.1 — Q3 2026 (juin-août) — chat backend modernization + B2B polish + V2 prep

- ⬜ **W5.1** — décision WebRTC Realtime 4 sem post-launch (reco veille : **skip**, ~5× coût + ré-arch guardrail).
- ⬜ **W6.2** — localiser system prompt FR/JA/ZH/AR (actuellement EN + `Respond in ${language}`).
- ⬜ **W6.3** — tsvector + RRF hybrid search sur `artwork_embeddings` (recall@10 78 %→91 %).
- ⬜ **W6.4** — provider Anthropic + prompt-caching middleware (−90 % coût préfixe cached).
- ⬜ **W6.5** — refactor dossiers chat 44→33-35 (`git mv` + sed, ~3j).
- ⬜ **W6.11 / W6.12** — `LLM_CACHE_ENABLED` kill-switch + propagation `outcome=cache_hit` + panels ratio cache.
- ⬜ **W7.1** — multi-persona voice (Curator / Friend / Kid) — veille confirme l'UX persona (Herodot). Piggyback `guideLevel`.
- ⬜ **W7.2** — WelcomeCard dynamique (`useDynamicSuggestions` : GPS + last artwork + heure) — dette doctrine hybrid-product.
- ⬜ **W7.3** — nudge idle mid-conversation (silence >30s).
- ⬜ **B2B polish** — multi-tenant scoping toutes routes admin, NPS true 0-10 per museum, hard-delete admin Art.17, OpenAPI `/leads/*`, rate-limit Brevo per-pod, i18n pages admin B2B.
- ⬜ **Sécu hardening** — `event.tags` via `scrubEvent`, HMAC IP at-write, zero-width strip user-path, homoglyph fold, QR replay cross-museum fix, audit chain ADR-054 Phase 1+2, privilege-escalation rank-guard.
- ⬜ **Premium full** — Stripe + receipts iOS/Android, conditionné aux données du soft-paywall stub.

---

## 🚶 V2 — Walk hors-musée (sprint sep-nov 2026)

> **Démarrage conditionné** : fin Phase 1 + signal KR2 NPS ≥7/10 sur 50 sessions. Code-vérifié absent aujourd'hui (`features/walk/` n'existe pas, 0 migration POI, MapLibre = markers only, TTS 100 % sync).

- ⬜ **`features/walk/`** — ~700 LOC FE (state machine, screens, GPS-arrival, audio queue).
- ⬜ **Migrations** — `museum_pois`, `walk_routes`, `walk_progress`, `tour_step_audio_cache`.
- ⬜ **BE module `walk`** — directions adapter (OSRM self-host) + circuit breaker + audio sidecar.
- ⬜ **TTS streaming** — port renvoie `Readable` (chunked) au lieu de `Buffer`. *(reco veille : reste V1.1/V2, pas un table-stake V1 pour l'UX photo-puis-discute async.)*
- ⬜ **MapLibre polyline** — `<LineLayer>` + `<ShapeSource>` GeoJSON, glyphs self-hosted.
- ⬜ **Pause-resume VoiceMap-style** + background GPS (`expo-task-manager`, re-review App Store) + 5 ADRs.
- ⬜ **Contenu démo** — ~5 tours × 5-8 POI Bordeaux + scripts audio FR/EN.

---

## 🌙 LATER — Q4 2026+ / Moonshots

- ⬜ **Infra VPS** — F1 disque dédié docker, F2 photos S3/B2, F4 split multi-tenant, F5 resource limits, F6 disk SLO. *(F3 backups off-VPS = ✅ shippé 2026-04-26.)*
- ⬜ **M1 B2B-ready** — curator-overrideable LLM, dashboard analytics musée, white-label/co-branding, AR pilot, LSF/BSL overlay, voice-pack artistes domaine public.
- ⬜ **M2 RAG modernization** — Anthropic Contextual Retrieval, GraphRAG, Jina-CLIP-v2 multilingue, realtime-mini walk-mode (triggers mesurés).
- ⬜ **M3 moonshots 2027+** — 3DGS scan œuvres, co-présence multi-visiteurs « shared walk », re-mix génératif (whitepaper droit d'auteur), affective computing (⚠️ AI Act Art.5), haptic Apple Watch, voice mood prosody, cross-museum visit graph.
- ⬜ **Social / offline** — réseau museum-explorer, offline pack musée, LLM cache cross-user warm, i18n web admin complète.

---

## ⛔ KILLED (ne pas redécider sans signal nouveau)

| Item | Date | Raison |
|---|---|---|
| SSE streaming chat | 2026-04 | Remplacé par sync chat ; burial FE fait (P0.D1) |
| Garak orchestrator | 2026-05-17 | Coût réel ~$120/mois vs $2 estimé |
| Realtime API V1 walk-mode | 2026-05-20 | 5× coût + ré-arch guardrail ; park V2.1+ |
| MFA mobile user-facing | 2026-05-26 | Web-admin-only V1 (ADR-017 Withdrawn) ; surface retirée |
| Hexagonal POJO 23 entities V1 | 2026-05-20 | 157 fichiers cross-importants, infaisable V1 |
| Chat éclatement 4 sous-modules V1 | 2026-05-20 | 909 LOC composition root sain |
| Voice clone DIY artistes sous licence | 2026-05-03 | Négo successions only |

---

## 🌐 Veille (web, 2026-05-31)

- **Concurrence** — Smartify (700+ orgs), Bloomberg Connects (free B2B), **Herodot AI** (persona selector + photo-to-story), **VoiceMap** (multi-POI pause-resume = pattern V2). Parité V1 atteinte sur photo-activation + conversationnel + voice + 8 locales ; streaming-TTS et auto-narration caméra = correctement V1.1/V2.
- **Compliance UE** — **AI Act Art.50** transparence (obligatoire 2026-08-02) **déjà implémenté** (badges disclosure) ; période transitoire couvre le launch juin. **CRA** reporting dès 2026-09-11 (breach-process doit exister au launch → B19). **CNIL âge-15** = le seul item réglementaire demandant un sign-off final.
- **NPS** — benchmark B2C culture/voyage 2026 ; mesure post-session, échantillon ≥50, attention au biais de timing (KR2 instrumenté).

---

## Comment utiliser cette roadmap

1. **Début sprint** — `/team` lit ce fichier + `ROADMAP_TEAM.md`, propose les items P0/V1.0.x à attaquer. NEXT bloquée tant que P0 incomplet (sauf hotfix).
2. **Au merge** — fais avancer le marqueur de statut (open → partial → done). Bloqué = `[BLOCKED: raison]` inline.
3. **Preuve** — tout claim trace à un `path:line` dans [`ROADMAP_AUDIT_TRAIL.md`](ROADMAP_AUDIT_TRAIL.md) (UFR-024). On croit le code, pas la doc.
4. **Rendu lisible** — `node scripts/render-artifact.mjs docs/ROADMAP_PRODUCT.md --out artifacts/roadmap.html` (dashboard go/no-go + lanes + filtres).
5. **Fin sprint** — réécriture complète (P0 vidé, NEXT remonte), commit `docs(roadmap): sprint <date>`. La trace des versions = `git log`.
