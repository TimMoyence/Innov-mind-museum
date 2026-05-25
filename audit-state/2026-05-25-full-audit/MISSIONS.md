# 🌙 5 missions autonomes profondes — pré-launch Musaium V1

> **Supersede** `WORKTREE-PROMPTS.md` (les 15 patchs surgicaux). Ici : **5 missions** (1 session/worktree chacune), autonomes, multi-cycle, qui tournent toute la nuit jusqu'à **zéro défaut**. Aucun defer, aucun backlog, aucun guess.
> Décisions : NPS full · museum_manager full · MFA neutralisé V1 (flow complet = décision produit dans M3).

## Préambule commun (à coller en tête de CHAQUE mission)

```
Tu es l'ORCHESTRATEUR /team AUTONOME, propriétaire exclusif du domaine de cette mission.
Mission longue, multi-cycle, autonome (toute la nuit). Objectif : amener le domaine à ZÉRO
DÉFAUT — aucun defer, aucun backlog, aucun "TODO", aucune supposition.

DOCTRINE NON-NÉGOCIABLE (UFR-022 + UFR-013) :
- Fresh-context par phase : spec → plan → red → green → review. Chaque phase = un sous-agent
  FRAIS, zéro contexte d'une autre phase. BRIEF-ACK sha256, BLOCK-CONTEXT-LEAK si fuite.
- TDD strict : RED d'abord — un test qui ÉCHOUE et reproduit le défaut OU prouve l'absence du
  use-case ; PUIS GREEN — coder jusqu'au vert ; frozen-test (le green ne touche pas un byte du red).
- COUVERTURE EXHAUSTIVE : chaque fonction touchée DOIT avoir TOUS ses use-cases testés —
  happy path + edge + erreur + concurrence + i18n/RTL/a11y si UI. Aucune branche non couverte.
- LIB-DOCS OBLIGATOIRE avant de coder : pour CHAQUE lib importée, lire lib-docs/<lib>/PATTERNS.md
  + LESSONS.md ; si stale (>14j) / version-drift / absente → doc-fetcher + doc-curator + WebSearch
  des patterns officiels AVANT d'écrire la moindre ligne. Citer PATTERNS.md:<line> en review.
- RÉFLÉCHIR AVANT D'AGIR : chaque cycle s'ouvre par une ANALYSE (lire le code RÉEL, tracer E2E
  via gitnexus+grep+read, challenger l'hypothèse). Jamais de guess — path:line reproductible.
- HONNÊTETÉ : rapporter les échecs verbatim ; "code dit X" (vérifié) ≠ "j'attends X" ; gates
  jamais bypassés (zéro --no-verify).

PHASE 0 — DÉCOUVERTE (sous-agent fresh, read-only) :
  Le SEED ci-dessous (findings d'audit) n'est qu'un POINT DE DÉPART à RE-VÉRIFIER from scratch
  (ne le crois pas) PUIS à DÉPASSER. Explore TOUT le domaine : trouve les défauts NON listés,
  les fonctions sans test, les use-cases manquants, les contrats stale. Écris ta task-list dans
  team-state/<run>/tasks.md (section ## Multi-cycle progress) — c'est TA liste, tu l'épuises.

CYCLE (répété jusqu'à tasks.md vide) :
  1. Pioche la task la plus haute valeur/risque.
  2. ANALYSE fresh (code réel + lib-docs + trace E2E).
  3. RED fresh (test(s) qui échouent).
  4. GREEN fresh (code au vert, frozen-test, tous les use-cases).
  5. REVIEW fresh (sémantique + lib-docs compliance + sécurité/a11y/perf/honnêteté).
  6. Coche ; ajoute les sous-tasks émergentes découvertes en chemin ; recommence.

BOUNDARY (anti-conflit parallèle) : tu modifies UNIQUEMENT les zones listées. Si une correction
exige de toucher hors-zone, NOTE-la en dépendance inter-mission dans STORY.md et NE la code PAS.

DONE = tasks.md vide ET chaque fonction du domaine a tous ses use-cases couverts ET review
APPROVED (≥85) ET tous les gates verts ET zéro item "defer/backlog/TODO" restant.
```

---

## 🟦 MISSION 1 — Chat & AI pipeline (cœur produit + privacy + safety)
**Worktree** `feat/m1-chat-pipeline` · **Boundary** : `museum-backend/src/modules/chat/**`, `museum-frontend/features/chat/**`, `packages/musaium-shared/src/observability/strip-free-text.ts`.
**Seed (re-vérifier + dépasser)** :
- **Consent location bypass (RGPD)** : `prepare-message.pipeline.ts:482` propage `context.location` brut + `llm-prompt-builder.ts:196-200` fallback → coords au LLM malgré refus. Couvrir TOUS les cas : consent accordé/refusé/révoqué/anon, in-museum/ville/aucune loc.
- **Logger sans scrub** : `error.middleware.ts:99,117` loggent `req.originalUrl` brut (PII query-string).
- **Langfuse vision PII** : `strip-free-text.ts:51-62` ne masque pas le `content` tableau multimodal.
- **TTS non consent-gated** : `chat-media.route.ts:271` (`createTtsHandler`).
- **DSAR `artwork_matches`** manquant dans l'export (`exportUserData.useCase.ts`).
- **Chat FE** : burial callbacks SSE morts (TD-FE-CHAT-BURY-SSE), TTS cache `.mp3`→`.opus` (`useTextToSpeech.ts:61`), Accept-Language `fr-FR` (`chat-compare.route.ts:80` + `locale.ts:39`), a11y bulle USER masquée (`ChatMessageBubble.tsx:237`) + live region conditionnelle (`StreamingBody.tsx:54`).
- **Image-compare** : `useCompareImage` orphan (C3.5, 0 caller) → câbler E2E ; score-floor `fallbackVisualThreshold` dead (C3.7).
- **Intégrité** : les 6 couches de sécurité chat (CLAUDE.md AI Safety) — ordering + couverture adversariale de chacune. Le fix P0-FA1 (bulle vide, déjà mergé `246db09e9`) — vérifier aucune régression + couverture complète des stratégies d'envoi (texte/image/audio/cache/offline).
**Libs à doc-vérifier** : `@langchain/*`, `openai`, `expo-speech`, `expo-av`, Langfuse SDK.

## 🟩 MISSION 2 — Plateforme B2B (NPS + multi-tenant + branding + funnel)
**Worktree** `feat/m2-b2b-platform` · **Boundary** : modules `review`/`support`/`admin`/`telemetry`, `museum-web/src/app/[locale]/admin/**`, `museum-frontend/features/review/**` + branding consumer (`shared/ui` BrandMark/ChatHeader).
**Seed (re-vérifier + dépasser)** :
- **NPS full (KR2)** : FE `StarRating.tsx:29,31` plafonné à 5 → widget 0-10 ; exposer `aggregateNps` (route global + per-museum) ; **corriger l'attribution `museum_id`** : doit venir du musée de la session notée, pas de `authedUser.museumId` (`createReview.useCase.ts`) ; dashboard web NPS. Couvrir : promoters/passives/detractors, count=0, multi-museum, anon.
- **museum_manager full** : scoper `getStats(museumId)` réellement (`getStats.useCase.ts:31` no-op → fuite agrégat global) ; ajouter le rôle aux routes reviews/tickets/reports/analytics avec scope par tenant ; corriger le sélecteur analytics qui 400 (`analytics/page.tsx`) ; 8 liens nav fonctionnels. Tests adversariaux cross-tenant (BOLA).
- **Branding consumer mobile** : construire le rendu `config.branding` (couleur/logo) côté mobile (aujourd'hui hard-codé `BrandMark`) → W2.2 plus write-to-void.
- **Analytics funnel KR4** : `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` + funnel E2E avec consent ; vérifier les 4 events.
- **Reviews** : `userName` ghost field + dead branch 409 → corriger/enterrer.
**Libs à doc-vérifier** : TypeORM (query scoping), Plausible, React 19/Next 15 (web admin), expo.

## 🟨 MISSION 3 — Auth, compte & sécurité (MFA, TOTP, leads, erasure, smoke)
**Worktree** `feat/m3-auth-security` · **Boundary** : module `auth`, module `leads`, `museum-frontend/features/auth/**`, `seed-smoke-account.ts`/seeds, security middleware non-chat.
**Seed (re-vérifier + dépasser)** :
- **MFA** : neutraliser l'entrée enroll en V1 (anti-verrou — `MfaChallengeScreen` orphelin → lockout) ; **décision produit** : soit câbler le flow complet (route challenge + login E2E) si on le veut en V1, soit le gate-off proprement. Couvrir enroll/challenge/recovery/lockout.
- **TOTP TOCTOU** : `markUsed` non-atomique → compare-and-set `WHERE last_used_step < :step` + test de concurrence.
- **Leads durabilité** : Brevo = SPOF (lead perdu si down) → table locale + retry/queue avant Brevo ; OpenAPI `/leads/*` (absents, 0/76).
- **Smoke account** : `verification_token: undefined` no-op (`seed-smoke-account.ts:155`) → `() => 'NULL'` ; teardown du compte smoke seedé en PROD permanent.
- **Erasure/DSAR (parts non-chat)** : compléter l'erasure best-effort (audio/Brevo/S3 orphelins), `AUDIT_ACCOUNT_DELETED` loggé APRÈS cleanup, hard-delete admin. Couvrir tous les chemins Art.17.
**Libs à doc-vérifier** : `otplib`/TOTP, `bcrypt`, JWT, Brevo SDK, expo-secure-store.

## 🟧 MISSION 4 — Fiabilité prod & coût-infra
**Worktree** `feat/m4-prod-reliability` · **Boundary** : `infra/**`, `.github/workflows/**`, `museum-backend/deploy/**`, `scripts/sentinels/**`, migrations, cost-guard config.
**Seed (re-vérifier + dépasser)** :
- **I-OPS2 alertes** : règles Grafana backend-down (`up==0`) / 5xx / DB-down / Redis-down + severity routing (`alertmanager.yml` single-receiver). Tester (promtool).
- **Cap coût** : merger/ré-appliquer #300 (`34bf280fc`) — fermer anon-bypass (`llm-cost-guard.ts:103`), métrer STT/TTS contre le cap, décider judge fail-OPEN→CLOSED ; **cost-breaker dailySpend wipe** (`three-state-circuit.ts:128`→`cost-trip-strategy.ts:63`).
- **I-OPS3** migrations double-run (`Dockerfile.prod:101` CMD + CI) → single-path.
- **I-OPS6** guard pgvector ≥0.7.0 en code (preflight `extversion`).
- **I-OPS7** indices manquants (chat-purge `purgedAt`/`updatedAt`, `api_keys.user_id`, composite `listSessions`).
- **I-OPS8** CI gates théâtre : `ai-tests` workflow_dispatch-only, expo-doctor continue-on-error, gate anti-drift migration absent.
**Libs à doc-vérifier** : Prometheus/Grafana alerting, TypeORM migrations, pgvector, BullMQ, Docker.

## 🟥 MISSION 5 — Contenu, conformité, a11y & honnêteté
**Worktree** `feat/m5-content-compliance` · **Boundary** : module `daily-art`, KE provisioning (SigLIP/`fetch-models.sh`), `museum-web` a11y, `docs/**` (legal/ADR/anchors), `scripts/sentinels`, `.maestro/**`, dead-code à enterrer.
**Seed (re-vérifier + dépasser)** :
- **Daily-art** : 14/30 images cassées (curl-vérifié) → re-sourcer Wikimedia stable + sentinel CI liveness. (i18n descriptions EN-only → couvrir.)
- **SigLIP provisioning (C1)** : GCS provisionné + `SIGLIP_ONNX_SHA256` injecté CI + fail-loud (sinon `/chat/compare` 503).
- **Web a11y** : I-CMP4 badges 2.15:1→≥4.5:1 (`tokens.semantic.ts:128`) ; I-CMP5 4 refs `.app`→`.com` (`accessibility-content.ts:32,58,90,116`).
- **Compliance gates** : gate PGP placeholder ; sentinel S3 PAB boot-check ; ledger Langfuse/CARTO/Expo dans SUBPROCESSORS.md (Art.28) + ROPA.md (Art.30) + `dpa-signed/`.
- **Honnêteté (UFR-013/024)** : supprimer `LOT-P0-STABILITY-CLOSURE.md` (claim creux) ; réécrire prose rows I-SEC4/I-SEC6 ; réconcilier I-SEC8 (LOW) ; `ADR-038:76`+`ADR-065:20` `v1`→`v2` ; doc-anchors `c4b`/`c2` ; créer `doc-anchor-check.mjs` (cité, inexistant).
- **Burials dead-code (UFR-016)** : seed-pilot Paris Q-codes, WelcomeCard non-montée, `useTypewriter` orphan, clé i18n `a11y.chat.assistant_message`.
- **CC-BY-SA** : trancher (pd/cc-0 strict OU rendre le slug atteignable) — pas de dead forward-compat.
- **Maestro** : 2 flows stale actifs sur shards CI (`audio-recording-flow.yaml`, `onboarding-flow.yaml`) → remplacer + swap `shards.json`.
**Libs à doc-vérifier** : Wikimedia/Wikidata API, ONNX runtime, axe-core, Maestro, CycloneDX/cosign.

---

## Dépendances inter-missions (coordination merge)
- **M1 ↔ M4** : le cap coût (I-FIX3/#300) est porté par **M4** (infra/cost) ; M1 ne touche pas le cost-guard, seulement le pipeline chat. Si M1 a besoin d'un hook coût, le noter en dépendance.
- **M1 ↔ M3** : DSAR/erasure — la part **chat-data** (`artwork_matches`) = M1 ; la part **compte** (audio/Brevo/S3, ordering audit) = M3. `deleteAccount.useCase.ts` = M3 (M1 expose juste la projection chat).
- **M2 ↔ M3** : `museum_id` attribution review (M2) vs JWT claim (M3 auth) — M2 lit le claim, ne le modifie pas.
- Sinon les 5 boundaries sont disjointes → 5 sessions parallèles sûres.

## Comment lancer (5 sessions)
```bash
git worktree add ../mus-m1 -b feat/m1-chat-pipeline dev   # idem m2..m5
cd ../mus-m1
# /team "<préambule commun> + <bloc MISSION N>"
# (option autonomie nuit : envelopper dans /loop pour ré-amorcer les cycles)
```
**Done global** = les 5 missions à tasks.md vide + gates verts + smoke prod local Docker ≥48h (auth+chat+photo+DSAR+geofence).
