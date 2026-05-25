# 🌳 Prompts worktree par FEATURE — pré-launch Musaium V1 (J-13)

> **Décisions tranchées** : NPS = full (0-10 + global + per-museum) · museum_manager = full (aligner FE/BE + branding consumer) · MFA = post-V1 (neutraliser l'entrée).
> **Principe** : 1 worktree = 1 **feature verticale** (BE+FE+web d'une même capacité) = 1 cycle `/team` = 1 PR. Plus qualitatif/entreprise-grade que des tranches par couche : la feature est livrée E2E et cohérente.
> **Usage** : pour chaque slice, créer le worktree puis lancer `/team` avec le prompt fourni. Les slices d'un même batch sont parallélisables (features disjointes). ⚠️ **Conflits de merge** notés par slice (fichiers partagés). Source des anchors : full-audit 2026-05-25.

---

## ⚙️ Comment créer un worktree
```bash
git worktree add ../mus-<slice> -b feat/<slice> dev
cd ../mus-<slice>     # clone complet du monorepo → BE+FE+web disponibles
# puis: /team "<prompt ci-dessous>"
```

---

## 🔴 BATCH 1 — Launch-blocking (parallélisables, features disjointes)

### W1 · `feat/mfa-neutralize-v1` — neutraliser l'entrée MFA (V1)
**Scope** : FE mobile. **Conflit** : aucun (zone auth isolée).
> `/team` : En V1, le flow MFA n'est pas livré (post-V1) mais l'écran d'enrôlement `app/(stack)/mfa-enroll.tsx` est atteignable et l'écran de challenge `MfaChallengeScreen.tsx` n'est monté par aucune route → un user qui s'enrôle se VERROUILLE au login suivant (`authApi.ts` throw `MFA_REQUIRED`, aucune route challenge). Objectif : rendre l'enrôlement MFA inatteignable en V1 (retirer/masquer le point d'entrée + la route `(stack)/mfa-enroll`, ou gate derrière un flag off) pour qu'aucun utilisateur ne puisse se verrouiller. Garder le code MFA en place (backlog post-V1). Acceptance : aucun chemin de navigation n'atteint l'enrôlement MFA ; un test prouve l'absence d'entrée ; pas de régression du login standard. Doc : ajouter TD post-V1 « câbler le challenge MFA + route ».

### W2 · `feat/location-consent-enforce` — bypass consent location (GDPR)
**Scope** : BE (chat-pipeline). **Conflit** : ⚠️ partage `prepare-message.pipeline.ts` + `llm-prompt-builder.ts` avec W10 (chat-privacy) → merger W2 avant W10, ou fusionner.
> `/team` : Bug RGPD Art.7 : quand l'utilisateur refuse le consent `location_to_llm`, `resolvedLocation` devient `undefined` (gate OK), MAIS `prepare-message.pipeline.ts:482` propage `context.location` (coords GPS brutes full-precision du FE) inconditionnellement, et `llm-prompt-builder.ts:196-200` les envoie au LLM via le fallback `if (!rl)`. Résultat pervers : refuser le consent envoie des coords PLUS précises (brutes) que l'accorder (coarse ville). Objectif : quand le consent location est refusé/absent, AUCUNE donnée de localisation (ni brute ni dérivée) ne doit atteindre le prompt LLM. Acceptance : test RED qui prouve qu'un consent refusé + `context.location` peuplé n'émet aucune ligne `Visitor location` ; le path coarse autorisé reste intact quand le consent est accordé. Constrainte : ne pas toucher l'ordre des couches de sécurité chat (CLAUDE.md AI Safety).

### W3 · `feat/prod-safety-alerts-cost` — alertes prod + cap coût
**Scope** : infra (`infra/grafana/alerting`) + BE cost-guard + merge PR #300. **Conflit** : aucun (infra + cost-guard isolés).
> `/team` : Deux trous de production. (1) I-OPS2 : aucune alerte Grafana sur backend-down (`up{job="musaium-backend"}==0`), pic 5xx, DB-down, Redis-down ; `alertmanager.yml` = single receiver sans severity split → un crash ne page personne. (2) I-FIX3 : le cap coût LLM a un anon-bypass (`llm-cost-guard.ts:103` `if userId===null return`) + le judge fail-OPEN à budget épuisé + STT/TTS non métrés contre le cap. La remédiation existe sur la PR #300 (`34bf280fc`) NON-mergée. Objectif : ajouter les règles d'alerte manquantes + severity routing ; merger/ré-appliquer #300 (fermer l'anon-bypass, métrer STT/TTS, décider le comportement judge à budget épuisé). Acceptance : règles d'alerte présentes et testées (promtool) ; test prouvant qu'un anon ne bypass plus le cap. Vérifier no-régression sur le chat existant.

### W4 · `feat/dailyart-content-integrity` — images daily-art + sentinel
**Scope** : BE (`daily-art`) + CI. **Conflit** : aucun.
> `/team` : 14 des 30 URLs d'images de `museum-backend/src/modules/daily-art/artworks.data.ts` renvoient 400/404 (vérifié curl), dont la Joconde (index 0, l'œuvre la plus affichée) et Guernica → ~47 % des jours affichent l'icône fallback. Aucun sentinel CI ne valide ces URLs. Objectif : re-sourcer les 14 URLs cassées vers des URLs Wikimedia Commons stables (format `upload.wikimedia.org` direct, pas `commons.wikimedia.org/wiki/`) + ajouter un sentinel CI (`scripts/sentinels/daily-art-image-liveness.mjs`) qui HEAD chaque URL et fail si non-200. Acceptance : les 30 URLs répondent 200 ; sentinel wiré pre-push + CI. Bonus honnête : noter le contenu EN-only (i18n descriptions = V1.0.x).

### W5 · `feat/imagecompare-provisioning` — SigLIP provisioning (503)
**Scope** : CI (`Dockerfile.prod`, workflows) + doc ops. **Conflit** : aucun.
> `/team` : C1 : le provisioning du modèle SigLIP ONNX n'est pas fait — `fetch-models.sh` avale le 404 quand `SIGLIP_ONNX_SHA256` est unset, le bucket GCS `musaium-models-public` n'est pas provisionné, `SIGLIP_ONNX_SHA256` n'est jamais injecté en CI (grep workflows = 0), et le prod default `EMBEDDINGS_PROVIDER=siglip-onnx` n'a pas de fallback → cold start `/chat/compare` = 503 (l'image-compare, argument B2B, est morte). Objectif : soit baker le modèle dans l'image Docker, soit provisionner GCS + pin SHA256 injecté en CI build-arg ; faire échouer le build (fail-loud) si le modèle est absent/SHA mismatch. Acceptance : `/chat/compare` retourne du contenu réel en prod (pas 503) ; build fail si modèle manquant. Doc : runbook provisioning + `.env`/CI var `SIGLIP_ONNX_SHA256`.

---

## 🟠 BATCH 2 — B2B full-scope (gros slices verticaux)

### W6 · `feat/nps-full` — NPS 0-10 + global + per-museum (KR2)
**Scope** : FE (StarRating) + BE (endpoint + attribution museum_id) + web (dashboard). **Conflit** : ⚠️ partage le module review avec W7 (museum_manager moderation) → coordonner.
> `/team` : KR2 (NPS post-session ≥7/10) est non-mesurable. Le BE est partiellement prêt : `review.schemas.ts` accepte déjà 0-10, `aggregateNps(museumId)` + `findByMuseum` existent avec le SQL (promoters-detractors), mais : (a) `StarRating.tsx:29,31` plafonne à 5 étoiles (`min:1,max:5`, `[1,2,3,4,5]`) → impossible de saisir 0-10 ; (b) `aggregateNps` n'a AUCUNE route qui l'expose ; (c) l'attribution `museum_id` est FAUSSE pour le B2C : `createReview.useCase.ts` prend `authedUser.museumId` (le user n'a pas de museumId en B2C) — il faut que le `museum_id` de la review vienne du **musée de la session notée** (`session.museumId`), pas du user. Objectif full-scope : (1) FE = widget NPS 0-10 post-session (remplacer/compléter StarRating, a11y `accessibilityValue max:10`) ; (2) BE = exposer un endpoint NPS (`GET /admin/reviews/nps?museumId=` per-museum + agrégat global) câblant `aggregateNps` + attribuer `museum_id` depuis la session ; (3) web = panneau NPS dashboard admin (global + par musée). Acceptance : un visiteur peut noter 0-10 ; le NPS per-museum et global se calculent et s'affichent ; tests E2E du flux note→agrégat. Constrainte : factories DRY (TEST_FACTORIES), a11y.

### W7 · `feat/multitenant-admin-full` — museum_manager aligné FE/BE + branding
**Scope** : BE (admin getStats + 6 routes scope) + web (AdminShell + pages) + FE mobile (branding consumer). **Conflit** : ⚠️ gros, partage admin + review/support avec W6 → séquencer après W6 ou coordonner les merges.
> `/team` : Le rôle `museum_manager` est à moitié construit (B2B-ready cassé). Objectif full-scope Aligner FE/BE : (1) BE — scoper `getStats(museumId)` réellement (`getStats.useCase.ts:31` appelle `repository.getStats()` sans arg → fuite agrégat global cross-tenant ; ajouter le `WHERE museum_id` sur users/sessions/messages OU clamp) ; ajouter `museum_manager` aux routes admin pertinentes (`admin.route.ts` reviews :422/:440, tickets :374/:393, reports :272/:299, analytics) AVEC scope museumId par tenant (pas juste l'allow-list) ; (2) BE/data — assigner `users.museum_id` (ou dériver le scope du JWT claim museum_manager) ; (3) web — les 8 liens nav `museum_manager` fonctionnent (plus de 403), chaque page scopée à son musée ; corriger le sélecteur analytics qui 400 (`analytics/page.tsx` envoie `?museumId=` rejeté par strictObject) ; (4) FE mobile — construire le consumer `config.branding` (couleur primaire + logo dans `ChatHeader`/`BrandMark`, aujourd'hui hard-codé) pour que W2.2 ne soit plus write-to-void. Acceptance : un museum_manager voit UNIQUEMENT son musée (stats/reviews/tickets) — test adversarial cross-tenant 403/scope ; branding musée rendu côté mobile ; zéro lien nav mort. Constrainte : BOLA tests, pas de claim faux en commentaire (UFR-013).

---

## 🟠 BATCH 3 — Conformité & honnêteté (parallélisables)

### W8 · `feat/compliance-gates-honesty` — gates CI + ledger + nettoyage vérité
**Scope** : CI/scripts + docs. **Conflit** : aucun (docs/scripts).
> `/team` : Lot conformité + honnêteté. (1) CI gate PGP : faire échouer le deploy si `museum-web/public/.well-known/pgp-key.txt` contient encore `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` ; (2) sentinel S3 PAB : boot-check `GetPublicAccessBlock` sur le bucket prod (fail si public) ; (3) ledger légal : ajouter Langfuse + CARTO + Expo à `docs/compliance/SUBPROCESSORS.md` (Art.28) ET `docs/legal/ROPA.md` (Art.30) + créer `docs/legal/dpa-signed/` ; (4) honnêteté UFR-013/024 : supprimer `audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md` (claim creux, commits orphelins non-mergés) ; réécrire la prose des rows roadmap I-SEC4/I-SEC6 (bugs décrits « live » mais corrigés/jamais réels) ; corriger `ADR-038:76` + `ADR-065:20` (`llm:v1`→`v2`) ; committer ou retirer les doc-anchors `c4b-sparql-counts.md`/`c2-license-uris.md` (8 réfs code mortes) ; créer le sentinel `doc-anchor-check.mjs` cité dans CLAUDE.md mais inexistant. Acceptance : gates rouges si placeholder/bucket-public ; ledger complet ; tous les anchors cités résolvent.

### W9 · `feat/analytics-funnel-kr4` — Plausible domain + funnel E2E
**Scope** : FE (env) + vérif E2E. **Conflit** : aucun.
> `/team` : Le funnel d'adoption KR4 est muet en prod : `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` est absent de tous les `.env*.example` FE → `resolveDomain()` (`plausible.ts:113`) fait un no-op silencieux. Objectif : ajouter `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` aux `.env.production.example`/`.env.example` FE + doc de set EAS ; vérifier E2E que les events funnel (`paywall_modal_shown`/`cta_clicked`/`email_captured` + `quota_exceeded`) partent bien avec consent. Acceptance : test prouvant qu'avec domaine set + consent accordé, l'event est émis ; doc EAS. (Aussi : vérifier `EXPO_PUBLIC_SENTRY_DSN_ANDROID/_IOS` présents dans le build prod pour KR3 crash-free.)

---

## 🟠 BATCH 4 — Debt PRODUIT (par feature, parallélisables)

### W10 · `feat/chat-privacy-hardening` — logger scrub + Langfuse + TTS consent + DSAR
**Scope** : BE (chat-pipeline + observability + DSAR). **Conflit** : ⚠️ partage chat-pipeline avec W2 → merger après W2.
> `/team` : Lot privacy backend (4 fuites par side-channels). (1) Logger sans scrub : `error.middleware.ts:99,117` loggent `req.originalUrl` brut (code/token/email en query-string) en stdout — ajouter un scrub au sink logger (réutiliser `scrubUrl`). (2) Langfuse PII vision : `strip-free-text.ts` ne masque que `content` string, pas le tableau multimodal `[{type:text},{type:image_url}]` (path vision) → free-text user fuite si `LANGFUSE_ENABLED=true` ; étendre `stripMessagesArray` au content array. (3) TTS non consent-gated : `chat-media.route.ts:271` (`createTtsHandler`) envoie le texte à OpenAI TTS sans vérifier `third_party_ai_audio_openai` — ajouter le gate comme sur l'upload STT. (4) DSAR incomplet : `artwork_matches` (œuvres matchées par les photos du user) absent de l'export Art.15 (`exportUserData.useCase.ts`) — l'ajouter. Acceptance : tests prouvant scrub logger, masquage vision PII, TTS bloqué sans consent, export DSAR incluant artwork_matches. Constrainte : sentinel PII-seed.

### W11 · `feat/settings-sync` — préférences FE→BE (sync cross-device)
**Scope** : FE (settings) + BE (vérif endpoint). **Conflit** : aucun.
> `/team` : 5 réglages utilisateur ne se synchronisent jamais : `PATCH /api/auth/me/preferences` (BE complet, `auth-profile.route.ts:108-128` : audioDescription/locale/museumMode/guideLevel/dataMode) a ZÉRO call-site FE, et `audioDescriptionMode` toggle (`audioDescriptionStore.ts:48`) est local-only Zustand sans appel API → réglages perdus au changement d'appareil. Objectif : câbler les toggles settings FE vers `PATCH /me/preferences` (+ `audioDescriptionMode` write) avec optimistic update + invalidation `['user','me']`. Acceptance : test prouvant qu'un toggle settings émet le PATCH et persiste ; pas de régression du read bootstrap. Bonus a11y : `SettingsAiConsentCard.tsx:165` + `ContentPreferencesCard.tsx:84` manquent `accessibilityState.checked`/`role=switch`.

### W12 · `feat/chat-fe-polish` — SSE burial + TTS cache + Accept-Language + a11y
**Scope** : FE (chat) + petit BE (Accept-Language). **Conflit** : ⚠️ touche chat FE (coordonner avec W11 si même fichiers settings — peu probable).
> `/team` : Lot finition chat FE. (1) TD-FE-CHAT-BURY-SSE : enterrer les callbacks SSE morts (`onToken`/`onDone`/`onGuardrail`) que `sendMessageSmart` ignore désormais (`send.ts:169-172`) — dead-code UFR-016. (2) TTS cache : `useTextToSpeech.ts:61,78` cache sous `.mp3` alors que le BE émet de l'Opus (`text-to-speech.openai.ts:46`) → renommer `.opus` ou versionner la clé cache. (3) Accept-Language `fr-FR` : `parseAcceptLanguageHeader` (`locale.ts:39`) renvoie le tag brut `"fr-FR"`, et `chat-compare.route.ts:80` teste `=== 'fr'` → faux → les users FR reçoivent l'anglais ; normaliser via `extractLangCode`. (4) a11y I-CMP3 résiduel : la bulle UTILISATEUR masque encore son texte (`ChatMessageBubble.tsx:237-238`, même anti-pattern role=text+label retiré côté assistant) + live region non-conditionnelle (`StreamingBody.tsx:54`, gate sur `isStreaming`). Acceptance : tests par item ; lecteur d'écran lit le vrai texte user ; users FR reçoivent du FR.

### W13 · `feat/leads-durability` — table locale + OpenAPI
**Scope** : BE (leads). **Conflit** : aucun.
> `/team` : Les leads B2C/B2B sont non-durables : `submitBetaSignup`/`submitPaywallInterest` écrivent uniquement vers Brevo (`await notifier.subscribe()` throw avant le 202 si Brevo down → 500, lead perdu définitivement) — Brevo = SPOF, aucune table/queue locale. De plus les 3 endpoints `/leads/*` sont absents de l'OpenAPI spec (0/76 paths) → hors contract-tests. Objectif : persister le lead en base locale (table `leads`) AVANT l'appel Brevo (best-effort async vers Brevo, retry/queue) ; ajouter les paths `/leads/*` à l'OpenAPI. Acceptance : test prouvant qu'un échec Brevo ne perd pas le lead (persisté local) ; contract-test OpenAPI vert.

### W14 · `feat/web-a11y-compliance` — contraste badges + domaine .app
**Scope** : web. **Conflit** : aucun.
> `/team` : Deux défauts EAA/WCAG web. (1) I-CMP4 : badges status/priority `tokens.semantic.ts:128-137` = white-on-amber 2.15:1 / white-on-green 2.28:1 (badge 11px bold = normal text, exige 4.5:1), live sur `ticket-detail.tsx:304`/`TicketsListView.tsx:280` — corriger les tokens pour atteindre ≥4.5:1. (2) I-CMP5(b) : 4 refs `.app` vivantes dans `accessibility-content.ts:32,58,90,116` (dont `support@musaium.app`, domaine non possédé) alors que le canonical est `.com` partout ailleurs → contact a11y injoignable (EAA §6) ; corriger en `.com`. Acceptance : contraste recalculé ≥4.5:1 (test/lint token) ; zéro `.app` restant ; axe-core vert.

### W15 · `feat/test-ci-integrity` — Maestro stale + smoke teardown + TOTP
**Scope** : FE/CI (Maestro) + BE (smoke + TOTP). **Conflit** : aucun.
> `/team` : Intégrité tests/CI. (1) 2 flows Maestro stale ACTIFS sur les shards CI : `audio-recording-flow.yaml` (labels `Hold to talk`/`Play assistant response` inexistants) et `onboarding-flow.yaml` (assert slides supprimés + bouton inexistant) → faux-vert ou shard rouge ; `git mv` les remplaçants à jour (`voice-record-and-tts.yaml`, `onboarding-full-carousel.yaml`) dans `.maestro/` + swap dans `shards.json`. (2) Smoke account : `seed-smoke-account.ts:155` `repo.update({verification_token: undefined})` = no-op TypeORM silencieux (gotcha) → `() => 'NULL'` ; + teardown du compte smoke seedé en PROD chaque deploy (login-able permanent). (3) TOTP TOCTOU : `markUsed` non-atomique → compare-and-set `WHERE last_used_step < :step`. Acceptance : shards Maestro verts sur les vrais labels ; smoke account nettoyé ; test de concurrence TOTP.

---

## 🟡 BATCH 5 — DIFFÉRÉ V1.0.x (NE PAS créer de worktree maintenant)
Optimisation/scale + burials sans impact à 100 visiteurs : indices DB (I-OPS7), migration single-path (I-OPS3), guard pgvector (I-OPS6), cost-breaker dailySpend, CI gates théâtre (I-OPS8), CC-BY-SA, burials dead-code (seed-pilot Paris, WelcomeCard, reviews.userName), score-floor C3.7, promptfoo C4.3. → fenêtre hotfix.

---

## 🔀 Ordre de merge recommandé (à cause des fichiers partagés)
1. **W2** (location-consent) AVANT **W10** (chat-privacy) — partagent `prepare-message.pipeline.ts` + `llm-prompt-builder.ts`.
2. **W6** (NPS) AVANT/coordonné avec **W7** (multitenant-admin) — partagent le module review + admin.
3. Tous les autres (W1, W3, W4, W5, W8, W9, W11, W12, W13, W14, W15) sont disjoints → merge dans n'importe quel ordre.

## Batchs parallèles suggérés (solo + /team)
- **Vague A (launch-blocking)** : W1, W3, W4, W5 en parallèle ; W2 seul (puis W10).
- **Vague B (B2B)** : W6 puis W7.
- **Vague C (conformité)** : W8, W9 en parallèle (+ TODO ops Tim).
- **Vague D (debt produit)** : W10 (après W2), W11, W12, W13, W14, W15 en parallèle.
