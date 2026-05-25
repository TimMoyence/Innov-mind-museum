# 🚀 Plan pré-lancement Musaium V1 — J-13 (launch 2026-06-07)

> Source : consolidation full-audit 2026-05-25 (pass-1 + pass-2, 82 agents). Objectif user : **roadmap pré-lancement finalisée + debt à zéro**.
> **Pas d'estimations en jours** (mes estimations solo tournent 50-70 % trop haut — ta vélocité gouverne). Sizing relatif S/M/L seulement.
> **Parallélisme** = tracks touchant des zones de code DISJOINTES → exécutables en parallèle (sessions/`/team` cycles distincts sans conflit de merge). Conflits internes notés.

---

## 0. Verdict launch-readiness

**Peut-on lancer ?** Pas encore. Le launch est gaté sur **Wave 1 (P0 code) + Wave OPS (compliance humaine) + smoke prod**. Tout le reste est éligible à la fenêtre hotfix V1.0.x (2026-06-07 → 06-21).

- ✅ **Déjà fait** : P0-FA1 (bulle vide, `246db09e9`), LOT 1/2/3 sécu/GDPR/feature-gates (#293/294/295), LOT 5 a11y partiel (#298), LOT 6 burial (PR#299).
- 🔴 **Bloquant launch** : 5 items code (Wave 1) + 5 actions Tim (Wave OPS).
- 🟠 **Debt-à-zéro réaliste** : Wave 2 + 3.
- 🟡 **Defer honnête V1.0.x** (zéro risque launch) : Wave 4.

---

## WAVE 1 — Bloquants launch (parallèle, zones disjointes) 🔴

| Track | Item | Zone | Dépend |
|---|---|---|---|
| **1A FE** | **P0-FA2 MFA mobile verrou** — router `MfaChallengeScreen` OU masquer l'enroll V1 (`app/(stack)/mfa-enroll.tsx`) | museum-frontend/auth | — |
| **1B BE** | **P0-FA3 consent location bypass** (GDPR) — couper le fallback raw-coords `prepare-message.pipeline.ts:482` + `llm-prompt-builder.ts:196-200` | museum-backend/chat | — |
| **1C BE/infra** | **I-OPS2 alertes** backend-down/5xx/DB/Redis + severity routing (`infra/grafana/alerting`) **+ merger #300** (I-FIX3 cap anon/judge/metering, `34bf280fc`) | infra + cost-guard | merge #300 |
| **1D BE/data** | **P0-FA5 daily-art** — re-sourcer 14/30 URLs (Wikimedia stable) + sentinel CI liveness (`artworks.data.ts`) | museum-backend/daily-art | — |
| **1E décision** | **P0-FA4 NPS** (câbler 0-10 + per-museum OU descoper KR2) **+ P0-FA6 museum_manager** (aligner FE/BE OU retirer le rôle V1) | admin BE+web | décision produit |
| **1-ops** | **C1 SigLIP** provisioning (provision GCS + injecter `SIGLIP_ONNX_SHA256` en CI, sinon 503 /chat/compare) | CI + ops | — |

→ 1A/1B/1C/1D parallélisables (apps/modules disjoints). 1E = trancher AVANT de coder (les décisions descopent du travail).

## WAVE OPS — Tim, humain (100 % parallèle au code) 🧑‍🔧

- **B17 révoquer la clé Anthropic** `.env:108` (re-exposée par l'audit) — **à faire maintenant**.
- **B12** générer PGP réelle + remplacer placeholder · **B13** provisionner mailbox `security@musaium.com` + smoke RFC 9116.
- **B14** signer DPA Langfuse · **B19** S3 PAB (console OU IaC) · **C7.5** device TTS smoke iPhone réel.
- **Exec seed prod** (C4 Aquitaine) + **vérifier migration no-drift** (`migration:run` puis `generate Check` vide) avant bake.

---

## WAVE 2 — Compliance gates + honnêteté (parallèle) 🟠

| Track | Item | Zone |
|---|---|---|
| **2-CI** | **B12 PGP CI-gate** (bloque deploy si placeholder) + **B19 S3 PAB sentinel** boot-check `GetPublicAccessBlock` | scripts/sentinels, .github |
| **2-legal** | **B14 ledger dev** — ajouter Langfuse/CARTO/Expo à `SUBPROCESSORS.md` + `ROPA.md` + créer `docs/legal/dpa-signed/` | docs |
| **2-KR4** | **`EXPO_PUBLIC_PLAUSIBLE_DOMAIN`** dans `.env*.example` FE (sinon funnel KR4 muet en prod) | museum-frontend env |
| **2-honesty** | Retirer/merger `LOT-P0-STABILITY-CLOSURE.md` (claim creux) · réécrire prose I-SEC4/I-SEC6 (faux "live") · réconcilier I-SEC8 (CRITIQUE→LOW) · ADR-036... corrigé, reste **ADR-038:76 + ADR-065:20** `llm:v1`→`v2` · doc-anchors `c4b/c2` (committer ou retirer) · créer `doc-anchor-check.mjs` (cité CLAUDE.md, inexistant) | docs + scripts |

→ Les 4 tracks Wave 2 sont disjoints, full-parallèle.

---

## WAVE 3 — Debt-à-zéro réaliste (P1, parallèle par app) 🟠

**Backend** (chat-pipeline hotspot → sérialiser 3A en interne) :
- 3A-1 **logger sans scrub** PII query-string (`error.middleware.ts:99,117`)
- 3A-2 **Langfuse vision PII array** (`strip-free-text.ts` — couvrir `content[]`)
- 3A-3 **B7 TTS non consent-gated** (`chat-media.route.ts:271`)
- 3A-4 **DSAR `artwork_matches`** dans l'export Art.15
- 3B **cost-breaker dailySpend wipe** (`three-state-circuit.ts:128` / `cost-trip-strategy.ts:63`)
- 3C **leads durabilité** (table locale + OpenAPI `/leads/*`) · **smoke account teardown** + `verification_token` no-op (`seed-smoke-account.ts:155`)
- 3D **TOTP TOCTOU** (compare-and-set `markUsed`)

**Frontend** (features disjointes → sub-parallèle) :
- 3E-1 **settings sync** — câbler `PATCH /me/preferences` + `audioDescriptionMode` write (5 réglages local-only)
- 3E-2 **TD-FE-CHAT-BURY-SSE** (callbacks morts) + **TTS cache `.mp3`→`.opus`**
- 3E-3 **Accept-Language `fr-FR`** (extractLangCode, `chat-compare.route.ts:77`)
- 3E-4 **a11y I-CMP3** (USER bubble masking `ChatMessageBubble.tsx:237` + live region conditionnelle `StreamingBody.tsx:54`)
- 3E-5 **2 Maestro stale sur shards CI** (`audio-recording-flow.yaml`, `onboarding-flow.yaml`) — `git mv` remplaçants + swap shard
- 3E-6 **C3.5 useCompareImage** — câbler dans l'UI OU enterrer (décision)

**Web** :
- 3F **I-CMP4** badge contrast 2.15:1 (`tokens.semantic.ts`) + **I-CMP5** 4 refs `.app` (`accessibility-content.ts:32,58,90,116`)

→ Backend (3A-D) ∥ Frontend (3E) ∥ Web (3F) = 3 apps disjointes, full-parallèle.

---

## WAVE 4 — Defer honnête V1.0.x (zéro risque launch) 🟡

> Forcer ces items à zéro AVANT launch n'est PAS le meilleur call produit (UFR-001) — fenêtre hotfix suffisante.
- **CC-BY-SA** inatteignable (inerte en V1 : allow-list = pd/cc-0 ; dead forward-compat) — ou trancher pd/cc-0 strict.
- **seed-pilot-museums.sh** Q-codes Paris (dead-code post-rescope) — burial.
- **RTL borders** `SwipeableConversationCard` + étendre `_rtl-style-audit` aux radius.
- **WelcomeCard dead UI** burial · **reviews.userName ghost** + dead 409 burial.
- **C3.7 score-floor** (`fallbackVisualThreshold` dead) · **C4.3 promptfoo** assertions dead-on-arrival.
- **I-OPS3** migration single-path · **I-OPS6** guard pgvector ≥0.7.0 · **I-OPS7** indices (P1/scale) · **I-OPS8** CI gates théâtre · **I-OPS5** media backup (IaC).
- **W2.2 branding** consumer mobile (M1.3 Q3) — OU retirer la claim.

---

## Synthèse parallélisme (vue d'ensemble)

```
J-13 ───────────────────────────────────────────────► launch
  Wave 1 (5 tracks code ∥) ──┐
  Wave OPS (Tim ∥, dès maintenant) ──┤── gate launch
  Wave 2 (4 tracks ∥) ───────┘
  Wave 3 (BE ∥ FE ∥ Web) ──── debt-à-zéro
  Wave 4 ──── defer V1.0.x honnête (ou si temps)
  + smoke prod local Docker ≥48h (auth+chat+photo+DSAR+geofence) AVANT bake
```

**Décisions à trancher en premier (descopent du travail)** : (1) NPS — câbler ou descoper KR2 ? (2) museum_manager — aligner ou retirer le rôle V1 ? (3) useCompareImage — câbler ou enterrer ? (4) CC-BY-SA — pd/cc-0 strict ?

**Définition de "debt à zéro" honnête** : Wave 1+2 = obligatoire launch ; Wave 3 = debt P1 à zéro (réaliste) ; Wave 4 = defer assumé V1.0.x (le forcer pré-launch coûte plus que ça ne rapporte).
