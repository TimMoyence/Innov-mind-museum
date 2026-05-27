# Roadmap Produit — Musaium

> **Source de vérité unique.** Vivante, réécrite à chaque sprint (4 semaines). Snapshots = git history.
> **Sprint courant :** 2026-05-03 → 2026-06-07 (launch day, minimum — à reconfirmer selon avancement P0).
> **Horizon :** 1 mois NOW + 1 trimestre NEXT + LATER moonshots.
>
> **🔬 Consolidation 2026-05-20 — 140 sous-agents fresh-context (Wave A × 70 + Wave B × 70 cross-validation) + 3 vagues WebSearch (EU compliance / PII SOTA / competitive intel).** Tous les claims ci-dessous sont cross-validés : verified shipped = consensus A+B, falsified = claim démontée par au moins 2 agents indépendants sur path:line. Inflation x2-x3 vs audit antérieur détectée — items dégraissés à preuve code.
>
> **Audit-driven roadmap discipline (UFR-024)** : tout claim "X LOC à supprimer", "Y shipped", "sentinel Z en place" DOIT être `find`/`wc -l`/`git show` reproductible. Pas de bullet sans preuve code.

---

## North Star (re-cadré 2026-05-21)

**Musaium V1 (launch 2026-06-07 minimum) = Compagnon culturel IA voice-first, dedans ET dehors — œuvres en musée et monuments/lieux en ville à parité + carnet de visite.**

Tu photographies une œuvre (en musée) ou un monument/bâtiment (en ville) → chat AI conversationnel voice-first (STT + TTS Opus) sur ce que tu vois. Mêmes capacités in/out musée :

- **En musée** : géoloc/QR détecte le musée (W1.4/W1.5 shipped) → contexte œuvre + multi-musées + audio description WCAG (C9.2 shipped) + transitions suggérées via prompt `suggestions[]` (W1.1 partiel) + image-compare SigLIP-2 (C3.x shipped).
- **Hors musée (ville)** : géoloc ville (Nominatim, shipped) → chat sur le monument/lieu photographié + **suggestions de proximité** (« un monument juste à côté », « un musée pas loin »). L'app suggère ce qui est autour, sans naviguer. ⚠️ La pièce critique restante : `location_to_llm` absent du consent FE → location droppée aujourd'hui (cf. P0.B9).
- **Carnet post-visite** (C10.B1 shipped) consultable dans les deux modes.

**Musaium V2 = parcours guidé actif** = walking guide pro-actif multi-POI : itinéraire GPS + suivi du trajet vers un musée/lieu + pauses audio automatiques pour expliquer un bâtiment, une maison, un monument *en chemin* (polyline GPS + audio streaming auto). Sprint juin-août 2026 si signaux KR2 positifs.

**Distinction V1/V2** : V1 = réactif (tu photographies CE qui est devant toi) + suggestions statiques de proximité. V2 = proactif navigué (l'app te guide d'un point à l'autre et narre en route).

**Why le re-cadrage** : audit code-grounded a confirmé `features/walk/` n'existe pas, `museum_pois` + `walk_routes` migrations absentes, MapLibre rend uniquement markers (zéro `LineLayer`), TTS 100% sync (zéro streaming) → le **parcours guidé navigué** est V2 ; le **monument-photo + suggestions de proximité** reste V1. **Aucun musée n'a été démarché à ce jour** — le B2B est une hypothèse future, pas un acquis (cf. KR1, et `seed-museums.ts` = données de démo, pas des pilots contractés).

**Concurrents 2026 (WebSearch Wave 3)** : Smartify (700+ orgs, 2M MAU), Bloomberg Connects (1250+ guides, free B2B), Herodot AI (persona selector + photo-to-story), VoiceMap (multi-POI pause-resume — pattern à reprendre V2). Gap parité MEDIUM-HIGH : narrator persona + BYOD QR + multi-POI walk.

- In/out musée à parité — œuvres ET monuments/lieux, pas qu'une app de musée
- Multi-musées (pas une app par musée)
- Voice-first (mains libres dedans/dehors)
- AI conversationnel contextuel (œuvres, monuments, lieux, histoire)

## Audience cible

| Segment | Modèle | État |
|---|---|---|
| **B2C visiteur** | Freemium (3 sessions/mois free, abonnement Premium illimité) | Hypothèse — soft-paywall stub V1 (C6 shipped) pour valider data-driven via Plausible (P0.F2) |
| **B2B musée** | Licence annuelle + co-branding optionnel | **0 musée démarché à ce jour.** Capacité B2B (image-compare + multi-tenant + co-branding + analytics) en préparation pour pitch — hypothèse future, aucun contrat |
| **Institutionnel** | Subvention culture / appel à projets | Backlog 2026 H2 |

---

## OKR Q2-2026 (Mai-Juin) — re-cadré 2026-05-20

**Objective** : Lancer Musaium V1 le 7 juin 2026 (minimum) avec une expérience compagnon culturel IA in/out musée (œuvres + monuments/lieux) qui donne envie de revenir + une capacité B2B démontrable (image-compare + co-branding + analytics par musée) — aucun musée démarché à ce jour, le B2B est une hypothèse future.

| KR | Cible | Mesure |
|---|---|---|
| **KR1 — Pitch B2B prêt** | Capacité B2B démontrable (démo image-compare + co-branding + analytics par musée) — **aucun musée démarché, aucune cible contrat V1** (démarchage = après que l'app soit utilisable) | Démo fonctionnelle prête |
| **KR2 — Companion NPS** *(re-cadré : était "Walk V1 NPS")* | NPS post-session ≥7/10 sur 50 sessions test ; benchmark B2B SaaS 2026 = +45 médian | ✅ **Mesurable (PR #301, 2026-05-27)** : saisie 0-10 (`NpsScale.tsx`), `aggregateNps()` global + par-musée câblé (endpoint `GET /api/admin/nps` + dashboard admin), attribution par session. Reste à collecter les 50 sessions test post-launch. Voir P0-FA4. |
| **KR3 — Stabilité** | Crash-free ≥99.5% + chat p99 <5s + 0 P0 bug | Sentry + Langfuse + Grafana |
| **KR4 — Adoption** | 100 visiteurs B2C inscrits semaine 1 post-launch | Funnel PostHog/Plausible (P0.F2 P0 bloquant) |

---

## P0 Launch Readiness (2026-06-07 minimum)

> **Verdict cross-wave A+B** : ~30-35 items réellement ouverts P0 (security/GDPR/code/compliance). Effort dev cumulé ~50-70h + ~5h ops Tim.
>
> **Codes** : ✅ = verified shipped (sur `dev`). ❌ = verified open. ⚠️ = partial/gap connu. **🔀 = FAIT sur branche non-mergée** (code écrit + tests, en attente de merge — marqueur réservé aux items qui ne sont vraiment QUE sur une branche). 🧑‍🔧 = ops humain (hors-code).
>
> **🔁 Réconciliation doc↔code 2026-05-25** (vérification croisée par le code, 8 domaines × 8 agents fresh-context Opus read-only — détail item par item dans [`../audit-state/2026-05-25-roadmap-reconstruction/CONSOLIDATED_STATE.md`](../audit-state/2026-05-25-roadmap-reconstruction/CONSOLIDATED_STATE.md) §3, preuves `findings/D1..D8`).
> **⚠️ Correction majeure post-audit (git vérifié `git merge-base --is-ancestor`)** : la directive de l'audit décrivait LOT 1 et LOT 3 comme « FAITS sur branches non mergées » (`p0/security` / `p0/feature-gates`). **C'est désormais FAUX : les deux lots ont été MERGÉS sur `dev`** — **LOT 1 sécurité (12 items) via `e0aade002` (#293)** et **LOT 3 feature-gates (11 items) via `811fd501c` (#295)**. Les branches `origin/p0/*` sont des reliquats pré-merge superseded. **LOT 2 GDPR (6 items) = mergé via `71f103b35` (#294).** Conséquence : les items A3-A9 / C1-C9 / I-FIX1-2 / I-SEC1-12 sont marqués **✅ DONE-DEV** (et non 🔀), preuves path:line re-vérifiées sur l'arbre `dev` courant. Le **seul reliquat de dev neuf** = LOT 4 stabilité (I-OPS2/3/4/6/7/8, I-FIX3) + I-SEC8 + LOT 5 a11y + LOT 6 burial. La roadmap ne mentait PAS sur la complétude — elle traînait des descriptions de bugs déjà corrigés (claims STALE) ; ce bloc les re-marque. Le texte d'audit d'origine est conservé tel quel ; le marqueur + ce bloc font foi.
>
> **🔁 Réconciliation doc↔code 2026-05-21** (vérifiée grep/read — détail + lots de dev dans [`V1_LOCKDOWN_LOTS.md`](V1_LOCKDOWN_LOTS.md)) : 12 items ci-dessous étaient marqués `❌` mais sont en fait **mergés ou réfutés** → re-marqués `✅`. Le texte d'audit d'origine de chaque ligne est conservé tel quel ; le marqueur ✅ + ce bloc font foi.
> - **B1** `deleteAccount.useCase.ts:97` audio cleanup · **B2** `brevo-beta-signup.notifier.ts:81` removeContact · **B3** `exportUserData.useCase.ts:86` (userMemory/auditLogs/messageFeedback/…) · **B4** `image-storage.s3.ts` deleteByPrefix + legacyFetcher · **B5** `runS3OrphanPurge` wiré `index.ts:467` · **B8** `useAiConsent.ts:26` clé namespacée + AuthContext clear · **B9** `consentScopes.ts:38` scope location_to_llm (fichier renommé depuis `thirdPartyAiConsent.ts`) · **B11** `image-processing.service.ts:162` fallthrough observable.
> - **I-SEC4** `auth-api-keys.route.ts:29` a déjà `requireRole(MUSEUM_MANAGER,ADMIN)` (claim STALE) · **I-SEC6** `login-rate-limiter.ts:100` hash déjà l'email SHA-1 (claim « plaintext » RÉFUTÉ).
> - **I-OPS1** `sentry-init.ts:33` conforme (doc pessimiste — RN mappe release/dist auto) · **I-CMP4** badges web OK ; ~~contraste mobile non reproductible~~ **CORRIGÉ pass-2 2026-05-25 : contraste mobile EST reproductible (2.15:1/2.28:1) → I-CMP4 ❌ NOT FIXED**.
> - **Déféré V1.1** : I-SEC11 (SSRF latent, `urlHeadProbe` undefined au V1).

> **🔬 Full-audit 2026-05-25 (J-13) — 32 sous-agents fresh-context + 4 vérifs orchestrateur.** Rapport complet : [`../audit-state/2026-05-25-full-audit/REPORT.md`](../audit-state/2026-05-25-full-audit/REPORT.md). Tâches : (A) réalité roadmap rafraîchie vs 62 commits ; (B) review qualité diffs par cluster double-angle ; (C) tracing E2E entrée→data 14 features.
>
> **Ticks appliqués ci-dessous (DONE-mais-pas-coché, path:line vérifié)** : LOT 5 a11y I-CMP1/2/3/5 ❌→✅, I-CMP6 ❌→⚠️ ; LOT 6 burial P0.D1-D5 →✅ + TD-AS-01 ; 6 items NOW V1.0.x [x] ; B11 ✅→⚠️ (boot-assert absent). Exit-criteria §8 "LOT6 non démarré" = FALSE-CLAIM corrigé.
>
> **🆕 NOUVEAUX findings launch-critiques (à traiter in-session, pas documenter — UFR `track-not-treat`)** :
> 1. ✅ **P0-FA1 — Chat texte-seul → bulle assistant VIDE — RÉSOLU `246db09e9` (2026-05-25)**. Garde élargie `(!streamingIdRef.current || imageUri)` → `(response && context.streamingIdRef.current)` (`sendMessageStreaming.ts:117`), converge texte+image sur un bloc finalize unique + ferme le gap télémétrie. TDD : 5 tests RED → GREEN, nouveau `describe('text-only sync finalize (P0-FA1 empty bubble)')` TR.1-TR.6 pilotant le vrai path sync (`mockResolvedValue(makePostMessageResponse)`, pas le fake-world onDone) → asserte bulle remplie + zéro bulle vide. Reviewer 93.45. **Vérifié orchestrateur : 6/6 tests verts au runtime + trace code.** Reste burial des callbacks SSE morts → TD-FE-CHAT-BURY-SSE.
> 2. 🔴 **P0-FA2 — MFA mobile = verrouillage** : `app/(stack)/mfa-enroll.tsx` monte l'enroll mais `MfaChallengeScreen.tsx` n'est importé/monté par AUCUN fichier → login post-enroll = dead-end. Router le challenge OU masquer l'enroll V1.
> 3. 🔴 **P0-FA3 — Consent `location_to_llm` contourné (GDPR Art.7)** : `prepare-message.pipeline.ts:482` passe `context.location` (coords brutes FE) inconditionnellement ; `llm-prompt-builder.ts:196-200` les ship au LLM si `resolvedLocation` undefined (consent refusé). Refus → coords PLUS précises qu'accord. Couper le fallback brut.
> 4. ✅ **P0-FA4 — KR2 NPS livré (PR #301, 2026-05-27)** : `aggregateNps()` désormais global + par-musée avec caller (`getNps.useCase.ts`) + endpoint `GET /api/admin/nps` ; widget 0-10 `NpsScale.tsx` remplace les 5 étoiles enterrées ; attribution via la session notée (`createReview.useCase.ts`, FK `reviews.session_id`) ; dashboard admin recharts. Avis pré-bascule exclus du NPS (`NPS_SCALE_EPOCH`). TDD + reviewer APPROVED ≥85.
> 5. 🟠 **P0-FA5 — 14/30 images daily-art cassées** (Mona Lisa, Guernica… curl-vérifié, `artworks.data.ts`) → ~47% jours = fallback icône. Re-sourcer + sentinel CI liveness.
> 6. ✅ **P0-FA6 — `museum_manager` réparé (PR #301, 2026-05-27)** : `getStats.useCase.ts` scope par musée via le helper `tenant-scope.ts` → fuite d'agrégat cross-tenant fermée (BOLA) ; reviews/tickets scopés + PATCH sur musée étranger → 404 (BOLA write-side) ; nav réduite aux liens utilisables (plus de 403 morts) ; co-branding mobile consommé (`useBrandedTheme.ts`, `MuseumLogo.tsx`). Tests d'isolation 2-musées réels + `museum_manager` dans la matrice RBAC.
> 7. 🟡 **P1-FA — qualité** : cost-breaker recovery wipe `dailySpend` (`three-state-circuit.ts:128`) ; Langfuse `stripFreeText` ne couvre pas `content[]` multimodal (PII egress vision) ; TTS non consent-gated (`chat-media.route.ts:271`) ; 3/8 scopes third_party_ai décoratifs ; TOTP TOCTOU `markUsed` ; leads non-durables (Brevo SPOF, OpenAPI `/leads/*` absent) ; CC-BY-SA slug inerte ; Lua atomicity test gap ; RTL borders `SwipeableConversationCard.tsx:121`.
>
> **⚠️ Honnêteté (UFR-013)** : LOT 4 (I-OPS2/3/4/6/7, I-FIX3, I-SEC8) — les claims de complétion sur worktree `p0/stability` sont **non vérifiés sur `dev`** (SHAs non-ancêtres, fichiers introuvables). LOT 4 reste NON DÉMARRÉ sur dev. La note de clôture `LOT-P0-STABILITY-CLOSURE.md` a été retirée 2026-05-26 ; ses actions ops durables (backup média/2ᵉ bucket, exporters PG/Redis, branch-protection sentinel-mirror, DR fresh-DB) sont promues dans [`OPS_DEPLOYMENT.md`](OPS_DEPLOYMENT.md) §28. · Doc-anchors `c4b-sparql-counts.md`/`c2-license-uris.md` référencés 8× mais inexistants (UFR-024 cassé). · I-SEC8 reclassé CRITIQUE→**LOW** (catalogue public scrapé, ADR-061 cohérent ; consensus B5+C6 vs A2). · I-SEC4/I-SEC6 textes "live" à réécrire (bugs fixés/jamais réels).

> **🔬🔬 Full-audit PASS-2 (fine-grain, 2026-05-25) — ~40 agents-feuilles (1 par 2-3 items, re-dérivation indépendante from scratch) + 8 agents-agrégateurs (arbre) + méta-finale.** Demandé par l'utilisateur après que la pass-1 a sous-livré l'échelle. Rapport : [`../audit-state/2026-05-25-full-audit/REPORT-PASS2.md`](../audit-state/2026-05-25-full-audit/REPORT-PASS2.md). **La re-vérification a corrigé des erreurs de la pass-1 elle-même** (preuve que re-passer tout, même récemment audité, est nécessaire).
>
> **❗ CORRECTIONS de ticks pass-1 erronés (honnêteté UFR-013)** :
> - **I-CMP3 ✅→⚠️** : 5 points assistant fermés mais bulle UTILISATEUR masque encore son texte (`ChatMessageBubble.tsx:237-238`) + live region non-conditionnelle (`StreamingBody.tsx:54`).
> - **I-CMP4 ✅→❌** : NON fixé (white-on-amber 2.15:1, recalculé, reproductible — caveat "non reproductible" était faux).
> - **I-CMP5 ✅→⚠️** : skip-link ✅ mais 4 refs `.app` vivantes dans `accessibility-content.ts:32,58,90,116` (dont `support@musaium.app`), jamais touché par #298.
> - **B7 ✅→⚠️** (TTS sortant non consent-gated) · **B9 ✅→⚠️** (bypass raw-coords) · **C1 ✅→⚠️** (503 provisioning) · **C7 ✅→⚠️** (read+update unscoped + NPS dead).
>
> **🆕 Findings additionnels pass-2 (au-delà des P0-FA1..6 de la pass-1)** :
> - **P1-FA7 logger sans scrub** : `error.middleware.ts:99,117` loggent `req.originalUrl` brut (code/token/email query-string) en stdout — sink Sentry scellé, sink logger ouvert.
> - **P1-FA8 Langfuse PII vision** : `stripFreeText` ne masque pas le `content` en tableau (path vision) → free-text user fuite si `LANGFUSE_ENABLED=true`.
> - **P1-FA9 cost-breaker** : recovery HALF_OPEN `reset()` wipe `dailySpend` (`three-state-circuit.ts:128`→`cost-trip-strategy.ts:63`) → cap $/jour érodé. **P1-FA10 I-FIX3 corrigé sur #300 NON-mergé** (`34bf280fc` non-ancêtre de HEAD).
> - **P1-FA11 réglages non-synchronisés** : `PATCH /me/preferences` (5 champs) + `audioDescriptionMode` write FE→BE = ZÉRO call-site → local-only, sync cross-device cassé.
> - **P1-FA12 DSAR `artwork_matches`** absent de l'export Art.15. **P1-FA13 compte smoke seedé en PROD** chaque deploy, jamais supprimé (login-able). **P1-FA14 Langfuse/CARTO/Expo absents de SUBPROCESSORS.md + ROPA.md** (part dev faisable en repo). **P1-FA15 `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` absent des env** → funnel KR4 no-op silencieux prod.
> - **Pattern dominant** (motif transverse) : *endpoints/helpers BE existants sans call-site FE* (= fausse complétude) : `PATCH /me/preferences`, `useCompareImage` (C3.5), `aggregateNps` (C7), `reviews.userName` ghost, branding consumer, `seed-pilot-museums.sh` Q-codes Paris. Décision systématique requise : **câbler OU enterrer** (UFR-016).
>
> **À COCHER [x] / recadrer (pass-2)** : C6.5 (503 wording fail-closed déjà correct) · "Sentry `event.tags` walked by scrubEvent" (NEXT — déjà fait, claim "bypassed" faux) · C9.8 Presidio (overlay `docker-compose.presidio.yml` EXISTE → recadrer "activation env-only différée", pas "manque docker-compose").
>
> **Anchors/sentinels cassés (UFR-024)** : `c4b-sparql-counts.md`/`c2-license-uris.md` (8 réfs code mortes) · `doc-anchor-check.mjs` cité dans CLAUDE.md **n'existe pas** · LOT 4 stability = commits orphelins non-ancêtres, jamais mergé sur dev (note `LOT-P0-STABILITY-CLOSURE.md` retirée 2026-05-26 ; actions ops → `OPS_DEPLOYMENT.md` §28) · `_rtl-style-audit.ts` ne couvre pas les border-radius (RTL bug `SwipeableConversationCard` non-flaggé) · 2 Maestro stale actifs sur shards CI (`audio-recording-flow.yaml`, `onboarding-flow.yaml`).

### P0.A — Security & PII (dev ~20-25h)

| ID | Item | Preuve code (cross-wave) | Effort |
|---|---|---|---|
| ✅ **P0.A1** | **Email clair-texte** — créé `@shared/pii/extractEmailDomain.ts` + patché les 3 sites in-scope (`forgotPassword.useCase.ts`, `login-handler.helpers.ts`, `auth-password.route.ts`) → `emailDomain` only. Merge `71f103b35` (#294 squash). Follow-up : `auth-email.route.ts:47` `newEmail` brut (LOW, hors scope). | Agent 01 confirmé. Logger sans scrub layer ; audit metadata `LooseRecordSchema`. | 60-90 min |
| ✅ **P0.A2** | **DOB bypass exploitable curl direct** — drop `.optional()` `auth.schemas.ts` + drop fallback `if(!dateOfBirth) return` `register.useCase.ts` (hard-throw 400) + OpenAPI `required[]` + tests réalignés (unit+e2e+perf+contract). Merge `71f103b35` (#294 squash). | Exploit confirmé `curl -X POST /api/auth/register -d '{"email":"minor@test.fr","password":"V1"}'` → 201 + null DOB | 2-3h |
| ✅ **P0.A3** | *(DONE-DEV — LOT 1 sécurité mergé `e0aade002` #293 ; `scrubUrl`/`SENSITIVE_QUERY_KEYS` via `@musaium/shared`)* **Sentry tag URL leak + `event.tags` NON scrubbé** — utiliser `scrubUrl` dans `error.middleware.ts:94,102,120` + ajouter `code`, `state`, `email`, `phone` à `SENSITIVE_QUERY_KEYS` + scrubber `event.tags` chokepoint dans `beforeSend` (PAS juste `scrubEvent` qui ne walk que request/user/extra). Upstream `redactQueryString` decode-semantics dans `scrubUrl` puis delete duplicate | OAuth `/api/auth/google/callback?code=<authcode>&state=<jwt>` leak | 60-90 min |
| ✅ **P0.A4** | *(DONE-DEV — #293 ; `langfuse.client.ts:68` `mask: stripFreeText` wiré R5)* **Langfuse `mask:` SDK option NOT wired + `updateRoot:true` hazard** — wire `LangfuseCoreOptions.mask` `langfuse.client.ts:55` ctor + `stripFreeText(data)` blacklist `data.input.messages[]`/`data.output.text` + sentinel PII-seed test. WebSearch Wave 2 §1 recommande dual-pass regex+Presidio + sentinel CI. Required SI `LANGFUSE_ENABLED=true` prod (default false, hotfix 2026-05-17) | `langfuse-langchain.ts:61` `updateRoot:true` confirmé ; grep `mask:` = 0 hits | 60-90 min |
| ✅ **P0.A5** | *(DONE-DEV — #293)* **Version drift Android résolu** — `app.config.ts:128` dynamise désormais `version: (require('./package.json') as {version:string}).version` + sentinel `scripts/sentinels/fe-version-sync.mjs` **créé par #293** (présent sur disque). **Nom corrigé 2026-05-25** : le claim antérieur citait `museum-frontend-version-sync.mjs` qui n'a jamais existé ; le sentinel réel s'appelle `fe-version-sync.mjs`. | finding A7 cross-validé (D1) | 45-60 min |
| ✅ **P0.A6** | *(DONE-DEV — #293 ; `langchain.orchestrator.ts:168` `if (!this.costBreaker.canAttempt())` wiré)* **Cost circuit breaker fail-OPEN confirmed** — `LlmCostCircuitBreaker.canAttempt()` `llm-cost-circuit-breaker.ts:107-114` JAMAIS appelé (grep `costBreaker.canAttempt(` = 0 hits ; seul guardrail breaker `llm-guard.adapter.ts:226`). Wire `if (!await this.costBreaker.canAttempt()) throw new CostCircuitBreakerOpenError()` AVANT `invokeSection`. **Le claim original "telemetry only" est correct, l'incident type avril 2026 ($437/nuit retry loop, WebSearch Wave 1 §6) confirme l'urgence.** | Agents 02, 05 A+B confirmés. 5 alerts Prom wirees, 0 enforcement. | 2-3h |
| ✅ **P0.A7** | *(DONE-DEV — #293 ; `checkLatencyBreakerOrThrow(site:'invokeSection'|'generateWalk')` garde les 2 paths)* **Walk path bypasses circuit breaker** — `langchain.orchestrator.ts:373-467` `generateWalk` ne check PAS `circuitBreaker.state === 'OPEN'` (main path L249 check). Cost containment bypassable. | NEW finding cross-wave Theme 1 Agents 01 A+B | 1h |
| ✅ **P0.A8** | **Honesty docstring fixes (UFR-013)** — *(DONE-DEV — #293, re-vérifié 2026-05-25 D1)* : (a) docstring cost-breaker `llm-cost-circuit-breaker.ts:10` réécrite ("no caller checked `canAttempt()`. This run wires the missing guards") — plus de "PHASE 2 NOT WIRED" mensonger ; (b) comment `deleteAccount.useCase.ts:62-63` reflète désormais la réalité CASCADE ("`chat_sessions` removed first in `deleteUser` (CASCADE → `chat_messages`)"). | Agents 05, 10 A+B ; re-vérifié D1 | 30 min |
| ✅ **P0.A9** | *(DONE-DEV — #293, subsumed by A3)* **OAuth callback `code` in SENSITIVE_QUERY_KEYS** — subsumed by P0.A3 mais explicite : ajouter `code`, `state` (réellement absents) | grep `SENSITIVE_QUERY_KEYS` `sentry-scrubber.ts:23-31` | Inclus P0.A3 |

### P0.B — GDPR + Anonymisation (dev ~12-18h, Ops Tim ~2h)

| ID | Item | Preuve | Effort |
|---|---|---|---|
| ✅ **P0.B1** | **TTS audio orphans on user delete (GDPR Art.17)** — `audio-storage.s3.ts:43-48` keys `chat-audios/YYYY/MM/<uuid>` SANS user prefix. `AudioStorage` n'a pas `deleteByPrefix`. `DeleteAccountUseCase` ZERO appel audio cleanup. Voice content survit l'erasure. | Cross-wave Agents 02 A+B confirmés | 2-3h |
| ✅ **P0.B2** | **NO Brevo unsubscribe on user delete (Art.17 + e-Privacy)** — Seul `subscribe()` existe `brevo-beta-signup.notifier.ts:28-72`. Wire `DELETE /v3/contacts/{email}` + appel dans `DeleteAccountUseCase` | Agents 02 + Leads 09 cross-validés. UI claim "One-click unsubscribe" `en.json:334`/`fr.json:334` non backed. | 2-3h |
| ✅ **P0.B3** | **DSAR export incomplet (Art.15)** — manquent `UserMemory` (favoriteArtists/museumsVisited/notableArtworks JSONB/summary), `AuditLog` rows attribuables, moitié colonnes `User`+`ChatSession` (coordinates/visitContext/museumId/currentRoom/currentArtworkId), `message_feedback`, `message_reports`, `social_accounts`, `api_keys`. | Agents 02 A+B + Wave B G-6b/c/d/e/f | 3-4h |
| ✅ **P0.B4** | **S3 prefix mismatch bug** — writer `chat-images/yyyy/mm/user-<id>/...` vs `deleteByPrefix` scan `chat-images/user-<id>/`. **Art.17 erasure scan = ZERO match production.** Fix: scanner utilise `Prefix=chat-images/` + filter substring `/user-<id>/`. + Wire `legacyImageRefLookup` 3rd arg dans `auth/useCase/index.ts:128` (proxy strips le legacy fetcher) | Agents 03 A+B + 10 A+B confirmés | 2h |
| ✅ **P0.B5** | **`runS3OrphanPurge` NEVER wired in `src/`** — exists + 10 tests dans `museum-backend/src/modules/chat/jobs/s3-orphan-purge.job.ts:193` mais grep BE = 0 callers. Wire dans `index.ts` cron. | Cross-wave Agents 10 + Wave B 02 TTS | 30 min |
| ✅ **P0.B6** | *(DONE-DEV, `71f103b35` #294)* **BE consent enforced at LLM call site** — `ThirdPartyAiConsentChecker` wiré (`third-party-ai-consent-checker.ts` + injecté `prepare-message.pipeline.ts:113,246` mirror `LocationConsentChecker`). Texte d'audit d'origine conservé : *seul `location_to_llm` gated (`location-resolver.ts:196-200`) ; 8 third_party_ai scopes NOT enforced ; Art.7(3) violation symbolique.* Vérifié résolu 2026-05-25 (D3). | Agents 06 A+B + 07 A+B + ADR-053 ; re-vérifié D3 | 3-4h |
| ⚠️ **P0.B7** | *(CORRIGÉ pass-2 2026-05-25 : upload audio STT gardé ✅, MAIS l'endpoint TTS sortant `POST /messages/:id/tts` (`chat-media.route.ts:271`, `createTtsHandler`) n'a AUCUN check consent → le texte assistant part à OpenAI TTS sans vérifier `third_party_ai_audio_openai`. DONE-DEV pour le STT seulement. DEBT-B7-TTS P1.)* **Audio consent enforced sur `POST /sessions/:id/audio`** — `ThirdPartyAiConsentChecker` câblé dans `chat-media.route.ts:42,224` (`createAudioHandler(chatService, consentChecker)`). Texte d'audit d'origine conservé : *scope `third_party_ai_audio_openai` collecté `AiConsentSheetContent.tsx:75-80`, zero check BE ; refuser peut quand même submit à OpenAI.* Vérifié résolu 2026-05-25 (D3). | Agents 01 A+B Theme 3 + 06 A+B ; re-vérifié D3 | 1h |
| ✅ **P0.B8** | **Consent inheritance bug FE (cross-user)** — `useAiConsent.ts:7` `CONSENT_KEY = 'consent.ai_accepted'` sans userId namespace. `clearPerUserFeatureStorage` `AuthContext.tsx:109-120` clear cache/daily-art/biometric mais PAS `clearConsentAcceptedFlag()` (qui existe `useAiConsent.ts:16-22`). User A grant → logout → user B logon même device → sheet n'ouvre pas. **GDPR Art.7(1) broken + Apple 5.1.2(i) bypass shared devices.** One-line fix. | Agents 06 A+B cross-wave | 30 min |
| ⚠️ **P0.B9** | *(CORRIGÉ pass-2 2026-05-25 : FE scope ✅ + resolver gated ✅, MAIS bypass GDPR OUVERT — refuser le consent laisse `resolvedLocation=undefined`, mais `prepare-message.pipeline.ts:482` propage `context.location` (coords brutes FE full-precision) inconditionnellement, et `llm-prompt-builder.ts:196-200` les ship au LLM en fallback. Refus → coords PLUS précises qu'accord. DEBT-B9-RAW-LOC P0 GDPR Art.7.)* **`location_to_llm` consent FE UI présente** — scope désormais dans FE `THIRD_PARTY_AI_SCOPES` `consentScopes.ts:38` (fichier renommé depuis `thirdPartyAiConsent.ts`) + surfacé dans `SettingsAiConsentCard`/`AiConsentSheetContent`. Texte d'audit d'origine conservé : *scope dans BE `userConsent.entity.ts:25` mais ABSENT de FE ; en prod la BE retournait false → location SILENTLY DROPPED.* Re-vérifié 2026-05-25. | Agents 02 + 07 Wave B cross-validés | 60-90 min |
| ✅ **P0.B10** | *(DONE-DEV, `71f103b35` #294)* **iOS Info.plist drift `NSLocationAlwaysUsageDescription` résolu** — `Info.plist:68` ne déclare plus que `NSLocationWhenInUseUsageDescription` (les `NSLocationAlways*` retirés). Texte d'audit d'origine conservé : *Info.plist + dernière `.xcarchive` shippaient `NSLocationAlways*` malgré `app.config.ts` ; App Store Review 5.1.1(i) risk.* Re-vérifié 2026-05-25. | Agent 07 Wave B Theme 6 confirmé ; re-vérifié | 30-60 min |
| ⚠️ **P0.B11** | *(RÉTROGRADÉ ✅→⚠️ 2026-05-25 full-audit — wiring 3 sites composition OK MAIS boot-assert demandé ABSENT, fallthrough `image-processing.service.ts:153-165` reste silencieux : pas de log/metric/assert. Risque faible, fix defense-in-depth non livré.)* **EXIF strip `imageProcessor` optional fallthrough silent** — `image-processing.service.ts:162-165` claim "observable" mais pas de log/metric. Composition root oubli = EXIF intact shipped silencieusement. Add boot assert dans `chat-module.ts`. | Agent 03 Wave A + 10 Wave B | 30 min |
| ❌🧑‍🔧 **P0.B12** | *(NEEDS-OPS-HUMAN)* **PGP key real OR remove `Encryption:` line** — `museum-web/public/.well-known/pgp-key.txt` body = literal `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP`. Soit gen Ed25519 2y + remplace, soit retire `Encryption:` line de `security.txt`. CI gate à ajouter. | Agents 09 A+B | 30 min Tim |
| ❌🧑‍🔧 **P0.B13** | *(NEEDS-OPS-HUMAN)* **`security@musaium.com` mailbox provisioned + smoke RFC 9116** — alias OVH → Gmail Tim. Bloque launch (sans, `SECURITY.md` ment). | Cross-wave + C8.1 | 30 min Tim |
| ❌🧑‍🔧 **P0.B14** | *(NEEDS-OPS-HUMAN)* **Langfuse DPA + SUBPROCESSORS.md** — Langfuse Cloud actif `museum-backend/.env:180-183` (URL `https://cloud.langfuse.com`, keys committed) mais `docs/compliance/SUBPROCESSORS.md` 20 vendors, 0 Langfuse row. Sign DPA + ajouter row + créer `docs/legal/dpa-signed/` archive (n'existe pas). | Agents 05 A+B | 60 min Tim |
| ✅ **P0.B15** | *(DONE-DEV, `71f103b35` #294)* **Subprocessors centralisés + `/subprocessors` public** — `museum-web/src/lib/legal/privacy-content.canonical.json` (19 subprocessors, source-of-truth unique) + route `museum-web/src/app/[locale]/subprocessors/page.tsx`. Texte d'audit d'origine conservé : *HTML / Web / FE in-app listaient 5-6 sur 20 ; Brevo/Sentry/Apple/Tavily/Brave/Unsplash/Langfuse/CARTO/Wikidata/Wikimedia/Nominatim/OSMF/Better-Stack manquants ; GDPR Art.13(1)(e) failure.* Re-vérifié 2026-05-25. | Agents 05 + 09 A+B cross ; re-vérifié | 2-3h |
| ✅ **P0.B16** | *(DONE-DEV, `71f103b35` #294)* **Privacy policy version sync + âge 15** — source-of-truth unique `privacy-content.canonical.json` (âge `15` aligné CNIL Délib. 2021-018, plus de `16 ans`). Texte d'audit d'origine conservé : *3-way drift `1.0.0` à 3 dates ; HTML §10 disait `16 ans` (faux).* Re-vérifié 2026-05-25. | Agent 09 A+B ; re-vérifié | 60-90 min |
| ⚠️ **P0.B17** | **`ANTHROPIC_API_KEY=sk-ant-…` mais ZERO usage** — **PARTIAL (2026-05-25)** : ✅ code/`.env.example` nettoyés **DONE-DEV (#293, dead config retirée)** ; 🧑‍🔧 **rotation de la clé exposée = ops humain** (à révoquer côté provider si la clé a fuité). Texte d'audit d'origine conservé : *pas de `@anthropic-ai/sdk` deps, 0 .ts refs, pas parsé `env.ts` ; credentials leaked → REVOKE, ou dead config → DELETE.* | Agent 05 A+B ; re-vérifié D1 | 15 min |
| ✅ **P0.B18** | *(DONE-DEV, `71f103b35` #294)* **`/terms` route présente museum-web** — `museum-web/src/app/[locale]/terms/page.tsx` + `terms-content.canonical.json`, lien Footer ajouté (cf. `Footer.cookies-terms-subprocessors.test.tsx`). Texte d'audit d'origine conservé : *Footer listait Privacy/Support/Accessibility/Security/B2B sans Terms ; e-Privacy Art.5(3) risque.* Re-vérifié 2026-05-25. | Agents 09 A+B ; re-vérifié | 2-3h |
| ❌🧑‍🔧 **P0.B19** | *(NEEDS-OPS-HUMAN — IaC/ops)* **S3 bucket PAB IaC** — `docs/incidents/BREACH_PLAYBOOK.md:217` admet "operator responsibility". `infra/` pas de Terraform. **Une console misclick = world-readable bucket avec keys embeded `user-<userId>` enumerable.** Terraform OR CI sentinel boot-check `GetPublicAccessBlock`. | Agent 03 A+B | 1-2h |

### P0.C — Feature gates launch-critical (dev ~8-12h)

| ID | Item | Preuve | Effort |
|---|---|---|---|
| ⚠️ **P0.C1** | *(CORRIGÉ pass-2 2026-05-25 : code SHA-pin OK MAIS provisioning non fait — bucket GCS `musaium-models-public` non provisionné, `SIGLIP_ONNX_SHA256` jamais injecté en CI (grep workflows=0), prod default `siglip-onnx` sans fallback → risque 503 /chat/compare RESTE OUVERT. DONE-DEV = code seulement.)* **SigLIP model provisioning** — `Dockerfile.prod:38` runs `fetch-models.sh` mais script avale 404 silencieusement quand `SIGLIP_ONNX_SHA256` unset. GCS bucket `musaium-models-public` TODO `fetch-models.sh:36-40`. Prod default `EMBEDDINGS_PROVIDER=siglip-onnx` → cold start /chat/compare = 503. Soit bake dans Docker, soit provision GCS + pin SHA256. | Agents 01 A+B Theme 2 | 1-2h |
| ✅ **P0.C2** | *(DONE-DEV — #295)* **SPARQL license classifier 100% reject silent** — `catalog-ingest.ts:175-183` `classifyLicense` compare contre slugs `'public-domain'|'cc-0'|'cc-by-sa'`, mais SPARQL Wikidata returne `?license` = URIs `http://www.wikidata.org/entity/Q19652`. Le test fixture `catalog-ingest.test.ts:108` injecte directement le slug → bug invisible. Fix mapping URI→slug. | Agents 03 A+B Theme 2 | 2-3h |
| ✅ **P0.C3** | *(DONE-DEV — #295 ; migration `1779381393403-AddWikidataQidToMuseums.ts` mergée)* **`catalog-ingest.ts:310-317` écrit `museum_id=NULL`** — pas de `--museum-id=<int>` CLI flag. `museums` table n'a pas `wikidata_qid` column → impossible de resolve UUID via SPARQL Q-code. **Cross-tenant leak post-B2B.** Ajouter migration `museums.wikidata_qid` + CLI flag + lookup. | Agents 03 A+B | 2-3h |
| ✅🧑‍🔧 **P0.C4** | *(code/migration DONE-DEV #295 ; exec seed = action ops à lancer sur la prod)* **Seed démo (PAS de pilots contractés — 0 musée démarché)** — 3 musées Bordeaux de démo dans `seed-museums.ts:91-115` (slugs+adresses 33000/33300) **sans Q-codes**. Q-codes résolus 2026-05-21 (wikidata.org, vérifiés) : Aquitaine **Q3329534** / CAPC **Q2945071** / Cité du Vin **Q16964634**. ⚠️ `scripts/seed-pilot-museums.sh` **N'EXISTE PAS** (claim audit antérieur faux) — les Q-codes Paris (Louvre Q19675/Orsay Q23402/Pompidou Q193554) à retirer sont dans `catalog-ingest.helpers.ts` + `seed-museums.ts`. **Ajouter aussi 1 monument exemple (Pont de Pierre, Bordeaux)** pour exercer le cas in/out musée. | Q-codes vérifiés + paths re-checkés 2026-05-21 | exec dev 2-3h |
| ✅ **P0.C4b** | *(décision tranchée 2026-05-25, code DONE-DEV #295)* **RISQUE CONTENU image-compare (C3) sur les musées démo Bordeaux — DÉCIDÉ** : SPARQL count exécuté → **Aquitaine seul ingest-viable (~133 œuvres P18 licence-libre)** ; **CAPC + Cité du Vin = Q-code carto only** (≈ zéro œuvre Wikidata exploitable, Cité du Vin = centre culturel vin pas musée d'art). C3 image-compare promis sur Aquitaine uniquement pour la démo. **NOTE** : les doc-anchors de preuve (`c4b-sparql-counts`, `c2-license-uris`) ne sont **pas** committés sur `dev` malgré le merge #295 — à committer ou à retirer comme référence (gap UFR-024 mineur). Texte d'audit d'origine conservé : *risque `no_visual_neighbor` systématique ; query SPARQL count `wdt:P195 + wdt:P18` AVANT de promettre C3.* | Conséquence directe du seed démo Bordeaux ; décidé D2 | Vérif faite + décision |
| ✅ **P0.C5** | **Telemetry conversion funnel (KR4) — IMPLÉMENTÉE** *(CLAIM STALE CORRIGÉ 2026-05-25, D2)* : **Plausible câblé sur `dev`** — FE `shared/analytics/plausible.ts` (`trackFunnelEvent` + events `paywall_modal_shown`/`paywall_cta_clicked`/`paywall_email_captured`) + `useAnalyticsConsent.ts` + `ConsentBanner.tsx` (consent gate GDPR) + BE module `museum-backend/src/modules/telemetry/` + `quota_exceeded` côté `monthly-session-quota.middleware.ts`. **L'ancien claim « grep `posthog`/`plausible` = 0 » est FAUX** (vérifié par `Grep` 2026-05-25). Reste : dashboard Plausible simple à finaliser. | Agents 10 A+B Theme 5 ; ré-vérifié D2 | 6-10h |
| ✅🧑‍🔧 **P0.C6** | *(corrections `.env.example` DONE-DEV #295 ; application au `.env` prod = ops)* **`.env` corrections release** — CORS_ORIGINS, BREVO_API_KEY, APP_VERSION, GOOGLE_OAUTH_CLIENT_ID, drop dead vars (TTS_ENABLED, ANTHROPIC_API_KEY, GOOGLE_CSE_*, SEARXNG_INSTANCES, SMTP_BREVO + ANTHROPIC_API_KEY P0.B17). Mirror `.env.example` → `.env.production.example`. + `FEATURE_FLAG_WEB_SEARCH=true` unread → delete (UFR-015). | Agents 07 + 02 A+B | 60 min |
| ⚠️ **P0.C7** | *(CORRIGÉ pass-2 2026-05-25 : migration + WRITE-path scopés ✅, MAIS admin READ+UPDATE non scopés (ListAllReviews/Tickets + Moderate/UpdateStatus ignorent museumId), NPS per-museum = dead-code (`aggregateNps`/`findByMuseum` 0 caller), `users.museum_id` jamais assigné → axe inerte. Mérite le qualifieur "no-op documenté" comme C8.)* **Reviews + Tickets `museum_id` columns** — bloquait KR2 NPS per-museum + W3.3 moderation. Migration + scope read+update ajoutés. Texte d'audit d'origine conservé : *ajouter migration + scope all read+update paths, OU descope KR2 à NPS global.* | Agents 08 A+B + 04 RBAC A+B ; D2 | 4-6h dev OU 0 si descope |
| ⚠️ **P0.C8** | **Multi-tenant leak `/api/admin/analytics/*`** — **PARTIAL (2026-05-25, D2)** : ✅ faille RBAC/BOLA fermée (`museum_manager` scope JWT) **DONE-DEV #295** ; ❌ le `WHERE museum_id` sur stats users/sessions/messages reste un **no-op documenté** (`getStats.useCase.ts` — les tables stats n'ont pas encore de colonne museum_id côté users/sessions/messages). Texte d'audit d'origine conservé : *3 endpoints + `/api/admin/stats` SANS `museumId` scoping ; `admin` peut voir TOUS tenants.* | Agents 05 A+B Theme 5 ; D2 | 3-4h |
| ✅ **P0.C9** | *(DONE-DEV — #295)* **`museum_manager` ajouté à l'AdminShell allow-list** — `AdminShell.tsx` allow-list étendue + scope. Texte d'audit d'origine conservé : *`AdminShell.tsx:195-201` allow `['admin','moderator','super_admin']` ; museum_manager 403 sur entry.* | Agents 02 + 04 A+B ; D2 | 1-2h |

### P0.D — Honesty / dead-code (dev ~3-5h)

| ID | Item | Preuve | Effort |
|---|---|---|---|
| ✅ **P0.D1** | *(DONE 2026-05-25, `134abe293` — `sseParser.ts`/`stream.ts`/tests supprimés −1093 LOC, flag `EXPO_PUBLIC_CHAT_STREAMING` retiré. ⚠️ voir P0-FA1 : la bulle-vide texte-seul est un bug FE distinct du burial.)* **SSE residuals burial `museum-frontend/features/chat/`** — backend SSE supprimé 2026-05-17 (commits `e433741f8` + `62feca482`). **Chiffre corrigé 2026-05-25 (D6) : ≈434 LOC dormant réel** = `sseParser.ts` (81) + `chatApi/stream.ts` (214) + tests SSE, le tout derrière flag `EXPO_PUBLIC_CHAT_STREAMING` **off**. **2 claims faux corrigés** : (a) `sendMessageStreaming.ts` (185) est **LIVE** (stratégie d'envoi par défaut câblée `useChatSession.ts`/`sendStrategies/index.ts`, PAS du dead-code) ; (b) **aucun `streaming.e2e.test.ts` FE** référant un fichier supprimé (le claim antérieur était erroné). Roadmap C9.16 "SSE résidus déjà absent" reste FAUX pour FE → burial du dormant à faire. **UFR-013 + UFR-016. P0 burial.** | Agents 07 A+B Theme 3 + 02 Wave B ; re-vérifié D6 | 1-2h delete |
| ✅ **P0.D2** | *(DONE 2026-05-25, `e49b75fe5` — untracked, −397 977 lignes)* **Stryker incremental cache committed 18,5 MB** — `museum-backend/reports/stryker-incremental.json` force-tracked malgré `.gitignore` (**18,5 MB / 397 976 lignes**, re-mesuré 2026-05-25 D6). `git rm --cached` + bump root .gitignore. | Agent 02 Wave A Theme 7 ; D6 | 15 min |
| ✅ **P0.D3** | *(DONE 2026-05-25, `eda7a0b7d` — supprimé, ADR-051 ; grep `chat-module.ts`=0 confirmé)* **Llama-Prompt-Guard ~571 LOC dormant** — adapter `llama-prompt-guard.adapter.ts` (180) + test `llama-prompt-guard.adapter.test.ts` (338) + `docker-compose.llama-prompt-guard.yml` (53) = **~571 LOC** (re-mesuré 2026-05-25 D6), **zéro wiring** (`grep llama-prompt-guard chat-module.ts` = 0). **Décision DELETE V1 lockée** (W6.1) ; prompt-injection couverte par LLM Guard + promptfoo LLM07 ≥95 %. Wire déféré V2/V1.1. | Agents 02 A+B Theme 1 ; D6 | 1h delete |
| ✅ **P0.D4** | *(DONE 2026-05-25, `0d0b2fda5` — 3 fichiers supprimés, 238 LOC)* **3 hard-skips `describe.skip` (238 LOC)** — `art-keyword-repo-atomic-upsert.test.ts` (59), `AddCriticalChatIndexesP0.spec.ts` (86), `AddP1FKAndTokenIndexes.spec.ts` (93) = **238 LOC** (vérifié 2026-05-25 D6). Delete ou re-enable. **Claim corrigé** : `streaming.e2e.test.ts` retiré de la liste (conditionnel valide, pas un hard-skip — et n'existe pas en FE). | Agent 02 Wave A ; D6 | 30 min |
| ✅ **P0.D5** | *(DONE 2026-05-25, `af2d31468` — ADR-036 `v1`→`v2` corrigé, `AiDisclosureModal` purgé des docs légaux)* **Doc UFR-013 fixes** — **PARTIAL (2026-05-25, D8)** : ✅ la rotation TECH_DEBT est **déjà faite** (TD-17/18/19/28/30/RN-01/RN-03/52/LF-02 archivés, anchors résolvent). **Résiduels ❌** : (a) `ADR-036-llm-cache-strategy.md:15,56` disent encore `llm:v1:` → corriger `v1`→`v2` (la clé prod est `llm:v2:` depuis `d54552beb`) ; (b) ref obsolète `AiDisclosureModal` (réel : `AiDisclosureSheetContent.tsx`) dans `AI_DISCLOSURE_AUDIT.md` ×3, `AI_DISCLOSURE.md` ×3, `ADR-055` ×1. | Agents 01 A+B Theme 7 ; D8 | 1h |

### P0.E — Exit criteria honest V1 launch

> **⚠️ Réconcilié 2026-05-25 (D1-D8 + git vérifié).** LOT 1 sécurité (#293) ET LOT 3 feature-gates (#295) ont été **MERGÉS sur `dev`** (contrairement à la directive d'audit qui les croyait sur branche). Statut réel ci-dessous (✅ = fait/mergé sur dev · ❌ = à faire · 🧑‍🔧 = ops humain).

1. ✅ P0.A1-A9 sécurité : A1/A2 ✅ + **A3-A9 ✅ DONE-DEV (#293)** ; A8 (a)+(b) docstrings corrigés. Pipeline vert dev.
2. ✅🧑‍🔧 P0.B1-B19 GDPR : B1-B11 ✅ + B10/B15/B16/B18 ✅ sur dev ; B17 ⚠️ (rotation clé 🧑‍🔧) ; **B12/B13/B14/B19 🧑‍🔧 ops Tim non faits** (DPA, security@ smoke, PGP réelle, S3 PAB).
3. ✅ P0.C1 SigLIP provisioning **DONE-DEV (#295)** — vérifier /chat/compare retourne contenu réel en prod.
4. ✅🧑‍🔧 P0.C2-C4 catalog : code/migrations **DONE-DEV (#295)** ; **exec seed = action ops sur la prod** (Aquitaine ingest-viable, cf C4b).
5. ✅ P0.C5 telemetry Plausible **implémentée sur dev** ; reste dashboard simple à finaliser.
6. ✅🧑‍🔧 P0.C6 .env corrections **DONE-DEV (#295)** — appliquer/re-valider au `.env` prod (ops).
7. ✅⚠️ P0.C7-C9 multi-tenant : C7/C9 ✅ DONE-DEV (#295) ; C8 ⚠️ (RBAC fermé, stats museum_id = no-op documenté).
8. ✅ P0.D1-D5 burial + honesty : **FAIT & mergé 2026-05-25** (PR#299 : `134abe293` SSE + `e49b75fe5` stryker + `eda7a0b7d` llama + `0d0b2fda5` describe.skip + `af2d31468` honesty + TD-AS-01 `15abcc94d`). L'ancien claim "NON démarré (LOT 6)" était un **FALSE-CLAIM** (corrigé full-audit 2026-05-25).
9. ❌ Smoke prod local Docker ≥48h : auth + chat + photo + DSAR + geofence + Maestro audio-recording flow réparé.
10. ❌🧑‍🔧 Tim sign-off device TTS test iPhone réel (C7.5).

### P0.F — Items vérifiés shipped & cochés (audit cross-wave 2026-05-20)

Au 2026-05-20, audits cross-wave A+B confirment shipped (preuves code path:line dans `.tmp-roadmap-waves/wave-{A,B}/`) :

- **C1.2** LLM cache wired `llm-cache.service.ts` v2 key + Prom counters + Grafana panel `id:4` chat-latency.json
- **C2.1-C2.5** image enrichment Promise.all fan-out + Wikimedia + MusaiumCatalogue + Zod v2 + Prom + Langfuse
- **C3.1** SigLIP ONNX adapter normalize `[-1,1]` mean=std=0.5
- **C3.2** pgvector `halfvec(768)` + HNSW + halfvec_ip_ops + scope museum_id
- **C3.4** chat-compare endpoint 5-stages + CompareResult + i18n 8 locales (mais C3.5 hook orphan — voir V1.0.x)
- **C4.1** KnowledgeRouter cascade KB→judge→WS via `AbortSignal.any` + per-leg budgets
- **C4.3** promptfoo halluc-eval CI workflow (60-entry corpus) — **MAIS assertions `quoteInFacts`+`citeRealUrl` NOT wired via `type:javascript` ; eval = dead-on-arrival pour ces fonctions. P0.B19** ⚠️
- **C4.4** citation enforce Zod sources[] v2 `{url,type,title,quote,confidence?}` + FE SourceCitation Ionicons + i18n 8 locales
- **C5.1-C5.4** Wikidata KB cluster (opossum breaker + WriteThrough + local dump 48-50 canonical works × en+fr + 4 alerts + 5-panel dashboard)
- **C6.1-C6.4** paywall stub + quota + tier + admin override (audit `6893a6ab`)
- **C7.1** smoke:api couverture e2e ; C9.2 imageDescription audio-desc autoplay + C9.3a granular consent + C9.3b AI Act Art.50 badge persistent + i18n 8/8 + C9.4 (telemetry side shipped, enforcement gate ouvert P0.A6) + C9.5 stable-prefix + C9.6 Promise.all + C9.7 judge detached + C9.9 output O3 retired + C9.10 voiceMode 80w + C9.11 sandwich dedup + C9.12 TTS Opus + fire-and-forget + cache key v2 + C9.13 reranker scaffold + C9.14 SigLIP-2 + C9.15 retire Google CSE/SearXNG/DDG + C9.17 [META] retired
- **C10.A1-A6 + B1-B6** chat UX refonte (composer/hero/bubble/topbar/status/citation/carnet/resumption/ask-more/QR/sotto-voce/proactive)
- **W1.4** UX choix musée ; W1.5 geofence (hybrid postgis+jsonb-bbox) ; W1.6 QR-deeplink + `[CURRENT ARTWORK]`
- **W2.1** museum onboarding admin web ; W2.2 branding (mais ZÉRO FE consumer mobile — UFR-013 doc fix V1.0.x) ; W2.3 stats per-museum (avec BUG multi-tenant leak P0.C8) ; W2.4 seed pilots script
- **W3.1-W3.4** RBAC + stats + moderation + CSV export
- **W4.1-W4.3** Landing + beta signup + B2B page
- **W6.9** FE↔BE distributed tracing ; W6.10 Guardrail fairness dashboard
- **W7.4** STT prompt biasing (roadmap mentioned `[ ]`, en fait shipped — Theme 3 Agents 01 A+B)
- **Personnalisation Spec C voice** PATCH /auth/tts-voice + FE VoicePreferenceSection mounted

### P0.G — Claims antérieurs falsifiés (à NE PLUS retenter)

Cross-validé Wave A+B — preuves dans agent reports :
- ❌ "Sentinel S1.2 SigLIP `embedding_model_version` homogeneity" → n'existe pas (Agents 03 A+B)
- ❌ "C9.16 SSE résidus absent" → FALSE pour FE (≈434 LOC residuals dormant derrière flag off — chiffre corrigé 2026-05-25 D6, cf P0.D1 ; Agents 07 A+B + 02 Wave B)
- ❌ "Sentinel `museum-frontend-version-sync.mjs`" → never existed (Agent 07 Wave A+B Theme 7)
- ❌ "DPO obligation Art.37 V1" → non applicable au volume 100 visitors S1 (legal Wave 1)
- ❌ "C9.13 Reranker -15% à -25% failed retrievals" → V1 scaffold throws `RerankerUnavailableError`, V2-deferred-honest (Agents 06 A+B)
- ❌ "Hexagonal POJO 23 entities 3-5j" → infaisable V1 (Agents 10 A+B Theme 7)
- ❌ "Chat éclatement 4 sous-modules V1" → 909 LOC composition root sain, mais "44→22 dossiers en 6j" est fiction. Réalisable 44→33-35 en 2.75-3j (Agents 10 A+B Theme 7)
- ❌ "5 alerts manquantes" sur llm-cost.yml → 5 alerts shipped (Agent 05 Wave A+B)

### P0.H — Anti-pattern documenté : UFR-024 + nouveau UFR-025

> **UFR-024** (codifié `.claude/agents/shared/user-feedback-rules.json`) — toute roadmap dérivée d'audit doit citer `path:line` reproductible AVANT lock. Sentinelle `scripts/sentinels/roadmap-claim-resolves.mjs` (wired pre-push G20 + sentinel-mirror).
>
> **UFR-025 (NEW 2026-05-20)** — pour audits critiques (P0 launch, security, GDPR), Wave A doit être complétée par Wave B fresh-context isolé (no shared state). Consensus A+B = claim valide ; discordance = re-audit ciblé. **Empêche claim hallucination single-pass.** Ce roadmap = première application.
>
> **How to apply** : `.tmp-roadmap-waves/` template (gitignored) avec `wave-A/theme-X/agent-NN.md` + `wave-B/theme-X/agent-NN.md` + `consolidation/round-N-A-vs-B-compare.md`. Effort orchestration ~5h pour 140 agents — high ROI sur compliance + B2B due-diligence.

---

## P0.I — Hardening audit round 2 (2026-05-21, 7 zones aveugles)

> **Couverture des angles morts admis** : supply-chain/CVE, knowledge-extraction, DB-scaling/perf, CI-CD/DR, authz-pentest endpoint-matrix, LLM-economics, WCAG systématique. **56 agents fresh-context (Wave A ×42 + Wave B ×14 indépendants) + grep-vérification perso des criticals + runs verts exécutés.**
>
> **Légende confiance** (restaurée per demande — la nuance était perdue en round 1) :
> `◇◇` = consensus A+B **ET** grep/run exécuté par l'orchestrateur (tier le plus fort). `◇` = consensus A+B indépendant. `·` = single-wave (à re-vérifier avant action). `↓` = **dégradé par cross-validation** (un agent avait sur-évalué).
>
> **Runs exécutés (◇◇, plus "agent a lu le test")** : BE `tsc` PASS · BE unit tests PASS · FE `tsc` PASS · web `tsc` PASS · sentinels (as-any/roadmap-claim/workspace-links) PASS.

### P0.I.A — Security / fuites de données (les plus porteurs)

| ID | Conf | Item | Preuve |
|---|---|---|---|
| ✅ **I-SEC1** | ◇◇ | *(DONE-DEV — #293, re-vérifié 2026-05-25 D1)* **Redis prod `maxmemory`/eviction désormais pinés** — `docker-compose.prod.yml:372` `--maxmemory` + `:374` `--maxmemory-policy`. Texte d'audit d'origine conservé : *sans, à l'OOM les writes sont rejetés ; cost-counter `INCRBYFLOAT` échoue → fail-CLOSED → tout le chat bloqué.* | `docker-compose.prod.yml:372` (le claim antérieur citait le chemin repo-root `deploy/…` ; le réel est `museum-backend/deploy/…`) |
| ✅ **I-SEC2** | ◇◇ | *(DONE-DEV — #293, re-vérifié 2026-05-25 D1)* **Forfait per-image substitué au byte-length brut** — `llm-cost-pricing.ts:43-59` utilise `VISION_BYTES_EQUIVALENT` (≈4000 bytes/image, ~85-1105 tokens `detail:high`) au lieu de la longueur base64 réelle. Texte d'audit d'origine conservé : *`Math.ceil(payloadBytes/4)` ; image inline → ~350k-1M "tokens" vs ~1100 réels ; aggrave P0.A6.* | `llm-cost-pricing.ts:59` (vérifié) |
| ✅ **I-SEC3** | ◇ | *(DONE-DEV — #293, re-vérifié 2026-05-25 D1)* **`POST /art-keywords` gaté** — `chat-message.route.ts:204` route POST avec `requireRole(ADMIN, MODERATOR)` + `taxonomyWriteLimiter` (10/min byUserId). Texte d'audit d'origine conservé : *`isAuthenticated` seul, no role, no rate-limit ; tout visiteur (ou clé `msk_`) pouvait polluer/évader le guardrail.* | `chat-message.route.ts:204` (route re-localisée depuis `:184`) |
| ✅ **I-SEC4** | · | **`POST /auth/api-keys` : tout user authentifié (free visitor inclus) forge une clé API B2B `msk_`** — no role/tier check. | `auth-api-keys.route.ts:20-42` |
| ✅ **I-SEC5** | ◇◇ | *(DONE-DEV — #293, re-vérifié 2026-05-25 D1)* **`EXPORT_PSEUDONYM_SALT` gaté en prod** — `env.production-validation.ts:159-178` exige la présence + longueur ≥32 (`required()` + `assertSecretLength()`). Plus de fallback littéral acceptable en prod. Texte d'audit d'origine conservé : *fallback `'musaium-admin-export-v1'` public → pseudonymisation GDPR réversible.* | `env.production-validation.ts:170` (vérifié) |
| ✅ **I-SEC6** | ◇◇ | **Login sliding-window Redis key = email plaintext** `login-attempts:<raw-email>` (le lockout key, lui, est SHA-1). Le commentaire "raw emails never appear in Redis" ne vaut que pour le lockout. PII en keyspace/AOF 10min. | `login-rate-limiter.ts:96` (grep confirmé) vs `:99-101` |
| ✅ **I-SEC7** | ◇ | *(DONE-DEV — #293, re-vérifié 2026-05-25 D1)* **TOTP replay + token-révocation traités** — `markUsed` persiste (`totp-secret.repository.pg.ts:60`) + access-token denylist Redis (`redis-access-token-denylist.ts`, prefix `denylist:access:`) consommée au logout/admin (ADR-064). Texte d'audit d'origine conservé : *TOTP rejouable ~90s ; access token non-révocable jusqu'à 15min ; RFC 6238 §5.2.* | `totp-secret.repository.pg.ts:60` (vérifié) |
| ❌ **I-SEC8** | ◇ | **KE knowledge base sans `museum_id` → cross-tenant bleed** : `findById(currentArtworkId)` (UUID client, `prepare-message.pipeline.ts:357`) injecte le `[CURRENT ARTWORK]`/`[LOCAL KNOWLEDGE]` d'un autre musée dans le system prompt. Thème récurrent (= reviews/tickets aussi, cf P0.C7). **Reste OUVERT (re-vérifié 2026-05-25 D3)** : #294 « reclassify » mais NE corrige PAS le scoping — seul OPEN de sécurité critique restant. | `artwork-knowledge.entity.ts:14-67` + `prepare-message.pipeline.ts:357` (ligne re-localisée) |
| ✅ **I-SEC9** | ◇ | *(FALSE-CLAIM résolu — re-vérifié 2026-05-25 D1)* **`searchTerm` déjà retiré du payload/worker** — `ExtractionJobPayload` ne porte que `{url, locale}` (`extraction-queue.port.ts:3` commente le retrait pour data-minimisation Art.5(1)(c)) ; le worker destructure sans `searchTerm`. Plus de PII dead-data en Redis. Texte d'audit d'origine conservé : *message chat brut persisté, jamais consommé, rétention 500 jobs.* | `extraction-queue.port.ts:3` (vérifié) |
| ✅ **I-SEC10** | · | *(DONE-DEV — #293, re-vérifié 2026-05-25 D1)* **KE scraper : garde Content-Length deux-couches** — `html-scraper.ts:187-191` Layer 1 pre-fetch Content-Length reject + Layer 2 cap `maxContentBytes` pendant le stream. Texte d'audit d'origine conservé : *`response.text()` sans guard ; body multi-GB OOM le worker ; URLs influençables.* | `html-scraper.ts:188` (vérifié) |
| ❌ **I-SEC11** | ↓ | **SSRF citation URL HEAD probe — DÉGRADÉ : latent, pas live V1.** `urlHeadProbe?` optionnel, `undefined` au V1 (`message-commit.ts:28`, "V1.1 rollout"), gardé `if(...&&urlHeadProbe)`, `new UrlHeadProbe`=0 hit. **Wave A l'avait sur-évalué comme live.** → pré-condition V1.1 : valider host/IP avant d'activer. | grep confirmé |
| ✅ **I-SEC12** | ◇ | *(DONE-DEV — overrides présents `museum-backend/package.json:80-81` `"brace-expansion": ">=5.0.6"` + `"ws": ">=8.20.1"`, vérifié 2026-05-25)* **Deps `ws`/`brace-expansion` pinnées.** **NOTE 2026-05-25** : la directive d'audit annonçait « pin absent, overrides vide, retirer du périmètre LOT 1 » — vérification code la **réfute** : les pins existent sur `dev`. 0 HIGH/CRITICAL ; CVE-2025-29927 (Next.js) NON vulnérable (15.5.18). | `museum-backend/package.json:80-81` (vérifié) |

### P0.I.B — Stabilité / KR3 (crash-free + p99)

| ID | Conf | Item | Preuve |
|---|---|---|---|
| ✅ **I-OPS1** | ◇ | **KR3 crash-free non-mesurable mobile** : `ci-cd-mobile.yml` zéro Sentry ; `Sentry.init` RN sans `release`/`dist` → la métrique KR3 phare n'a pas d'attribution build fiable. | `sentry-init.ts:33-48` + grep mobile workflow |
| ❌ **I-OPS2** | ◇ | **Aucune alerte API 5xx / `up{backend}==0` / DB-down / Redis-down.** Un backend qui 500 ou crash-loop ne page personne (seul node-exporter a `up==0`). Alert-routing = un Telegram, pas de severity split (doc dit PagerDuty). | `infra/grafana/alerting/*.yml` (grep) |
| ❌ **I-OPS3** | ◇◇ | **Migrations exécutées 2× par deploy** : CI `migration:run` + boot-time `CMD ["sh","-c","node ...run-migrations.js && node ...index.js"]` (`Dockerfile.prod:101`). **Nuance 2026-05-25 (D4)** : le crash-loop est **conditionnel** — l'idempotence TypeORM (migrations déjà appliquées = no-op) amortit le 2e run dans le cas nominal ; le risque ne se matérialise qu'en cas d'échec réel de migration sous `restart:unless-stopped`. À rendre single-path quand même. | `Dockerfile.prod:101` (vérifié) |
| ❌ **I-OPS4** | ◇ | **KR3 p99<5s tenu seulement sur cache-hit.** **Chiffres corrigés 2026-05-25 (D4)** : LLM timeout **15s** (`env.ts:163` `LLM_TIMEOUT_MS=15000`) + budget total **25s** (`:165` `LLM_TOTAL_BUDGET_MS=25000`) > `REQUEST_TIMEOUT_MS=20s` (`:66`, incohérent) — **pas « 10s×2 »**. + 2 sidecars guardrail V2 **en série** (input 1500+500ms, output 1500ms) autour du call LLM. | `env.ts:163-165` + `guardrail-evaluation.service.ts:118,154` |
| ⚠️ **I-OPS5** | ◇ | **PARTIAL (2026-05-25 D4)** : rotation clé GPG **doc-mitigée** ; restent ❌ **volume `uploads`/media non-backupé** (DB backup off-site GPG + restore drill = OK, voir F3) + backups dans **le même bucket que les médias** (shared-fate SPOF) — majoritairement IaC/ops. | `DB_BACKUP_RESTORE.md:46-47,61` |
| ❌ **I-OPS6** | ◇ | **pgvector ≥0.7.0 jamais gaté en code** : `CREATE EXTENSION vector` + `halfvec(768)` sans version check → fail/revert silencieux sur 0.6.x (contredit gotcha ADR-037). | `1778406339944-AddArtworkEmbeddings.ts:39,53` |
| ❌ **I-OPS7** | ◇ | **Indices manquants** : chat-purge cron full seq-scan (`purgedAt`/`updatedAt` non-indexés sur la + grosse table) ; `api_keys.user_id` CASCADE FK non-indexé ; `listSessions` sans composite `(userId, updatedAt DESC)`. P1 scale. | migrations + `chat.repository.typeorm.ts:265` |
| ❌ **I-OPS8** | ◇ | **CI gates partiellement théâtre** : `ai-tests` documenté required mais `if:workflow_dispatch` (never PR) ; web/mobile `paths-filter` "pending forever" ; Expo Doctor `continue-on-error` ; pas de CI gate anti-drift migration. **(d)** « `sentinel-mirror` absent des required-checks » = **non vérifiable par fichier** (config branch-protection GitHub, pas dans le repo) → à confirmer via `gh api repos/:owner/:repo/branches/:branch/protection` ou Settings (note 2026-05-25 D4). | `.github/workflows/*` |

### P0.I.C — Compliance / a11y / GDPR

| ID | Conf | Item | Preuve |
|---|---|---|---|
| ✅ **I-CMP1** | ◇◇ | *(DONE 2026-05-25 full-audit, #298 — opacity retirée `AiDisclosureFooter.tsx:33-40`, contraste recalculé 9.4:1 light / 5.7:1 dark)* **AI Act Art.50 disclosure footer échoue contraste AA** : `opacity:0.7` sur `textSecondary` → 3.55-4.09:1 (< 4.5). Notice légalement obligatoire. Fix 1 ligne (retirer l'opacity → 8.34:1). Le badge lui-même passe AA (le "~8:1" documenté était faux, réel 4.92-6.84:1). | `AiDisclosureFooter.tsx:33-37` |
| ✅ **I-CMP2** | ◇◇ | *(DONE 2026-05-25 full-audit, #294 — 40 clés consent traduites dans les 8 locales, 0 manquante ; claim "rendu en anglais" désormais faux)* **10 clés GDPR consent (cookie-banner Accept-all/Manage) manquantes en 6 locales** (de/es/it/ja/zh/ar) → consentement rendu en anglais. Le gate `check-i18n-completeness.js` (ci-cd-mobile) **échoue déjà** sur le commit local — bloquera la CI avant prod. Le test Jest ne couvre que fr↔en (redondance à élargir). | `shared/locales/*/translation.json` (diff committé) |
| ⚠️ **I-CMP3** | ◇◇ | *(PARTIAL — CORRIGÉ pass-2 2026-05-25 : 5 points audio-desc assistant fermés #298, MAIS 2 résiduels a11y trouvés en re-vérif fine : (a) la bulle UTILISATEUR masque encore son texte `ChatMessageBubble.tsx:237-238` (même anti-pattern role=text+label, WCAG 1.3.1/4.1.2 ; le fix #298 n'a touché que la bulle assistant), (b) live region non-conditionnelle `StreamingBody.tsx:54` sur toutes les bulles, pas gated isStreaming (WCAG 4.1.3). Mon tick ✅ pass-1 était sur-évalué.)* **Audio-description a11y : 5-7 violations** (consensus A+B + round-1) — `Speech.stop()` zéro caller (1.4.2/2.2.2), double-playback race 2 moteurs TTS, Switch sans accessibilityLabel (4.1.2), réponse streamée sans live region (4.1.3), bubble label masque le texte (1.3.1), FE→BE write absent. La feature vendue "for accessibility" exclut sa cible. | `useChatSession.ts:106-124` + `SettingsAccessibilityCard.tsx:32` + `ChatMessageBubble.tsx:188` |
| ❌ **I-CMP4** | ◇ | *(CORRIGÉ pass-2 2026-05-25 : le caveat "contraste non reproductible" était FAUX. Recalculé depuis les tokens : white-on-amber 2.15:1, white-on-green 2.28:1 ; badge 11px bold = normal text → exige 4.5:1. Live sur écrans tickets mobile `ticket-detail.tsx:304`/`TicketsListView.tsx:280`. WCAG 1.4.3 NON fixé.)* **Status/priority badges white-on-amber/green 2.15-2.28:1** (mobile tickets). Web admin OK. | `tokens.semantic.ts:128-137` |
| ⚠️ **I-CMP5** | ◇ | *(PARTIAL — CORRIGÉ pass-2 2026-05-25 : (a) skip-link réel `layout.tsx:32-41` + `<main id>` ✅ ; (b) `.app`→`.com` FAUX — 4 refs `.app` vivantes dans `accessibility-content.ts:32,58,90,116` (dont `support@musaium.app` non possédé), fichier jamais touché par #298. Mon tick ✅ pass-1 était sur-évalué. EAA §6 contact injoignable.)* **Web : skip-link absent (2.4.1, axe ne catch pas) + statement a11y pointe `musaium.app`/`support@musaium.app` alors que le code = `musaium.com`** → contact a11y injoignable = défaut EAA §6. axe-core CI bien wiré (23 specs wcag2aa). | `accessibility-statement-*.md:31` |
| ⚠️ **I-CMP6** | ◇ | *(PARTIAL 2026-05-25 full-audit — BE `ci-cd-backend.yml` + web `cosign attest --type cyclonedx` OK ; reste gap mobile EAS no-digest, deadline CRA 2027, acté ADR-068)* **SBOM généré mais jamais attesté/signé** (CycloneDX en artifact 90j, pas `cosign attest`) ; web+mobile zéro SBOM. Image cosign+SLSA-L3 OK. Gap CRA Art.13 (deadline 2027-12-11). | `ci-cd-backend.yml:99-110` |

### P0.I.D — Correctness / coût (non-sécurité mais réels)

| ID | Conf | Item | Preuve |
|---|---|---|---|
| ✅ **I-FIX1** | ◇◇ | *(DONE-DEV — #295, re-vérifié 2026-05-25 D2)* **Invalidation cache LLM corrigée** : `cache-purge.route.ts` délègue désormais à `invalidateMuseum` (plus dead-code, UFR-016 R-IFIX1b) avec le bon namespace `llm:v2:museum-mode:{museumId}:` (`:47`). Texte d'audit d'origine conservé : *`invalidateMuseum` = dead code ; bouton admin purgeait le mauvais namespace `chat:llm:` ; édits musée stale 24h.* | `llm-cache.service.ts:93` + `cache-purge.route.ts:31` |
| ✅ **I-FIX2** | ◇◇ | *(DONE-DEV — #295, re-vérifié 2026-05-25 D2)* **Cross-artwork mis-serve corrigé** : `currentArtworkKey` est désormais inclus dans la clé canonique (`llm-cache.service.ts:164-165`) → 2 œuvres différentes = clés distinctes. Texte d'audit d'origine conservé : *`[CURRENT ARTWORK]` title dans le system prompt mais PAS dans la cache key ; réponse de l'œuvre A servie pour B ; bug de correctness.* | `llm-cache.service.ts:164` + `chat-message.service.ts:328` |
| ❌ **I-FIX3** | ◇ | **STT/TTS totalement non-métrés** (zéro cost recording) ; per-user cap = $0.002 fixe/requête HTTP (pas par call fan-out) ; anon bypass le cap per-user ; judge $5/jour s'épuise ~1100 MAU puis fail-OPEN (régression sécu déguisée en cap coût). | `llm-cost-guard.ts` + `text-to-speech.openai.ts` |

### Corrections honnêteté (UFR-013) issues du round 2

- **F3 backup "single point of failure" est STALE/FAUX** — le backup off-site GPG chiffré + restore drill mensuel sont shippés (2026-04-26). Corrigé en LATER ci-dessous.
- **Cost breaker docstring** "PHASE 2, NOT WIRED, no caller invokes recordCharge()" — `recordCharge()` EST wiré ; c'est l'enforcement (`canAttempt()`) qui manque (P0.A6). Docstring à corriger.
- **Migration double-run** : Wave B l'avait nié à tort (n'avait vu que les 2 `migration:run` CI prod/staging), grep confirme Wave A — le `CMD` boot-time du Dockerfile.prod relance bien les migrations (I-OPS3).

---

## NOW — Phase 1 Consolidation (sprint launch 2026-05-03 → 2026-06-07 min)

> Items C1…C9 ci-dessous sont la suite directe de P0 — verified shipped cochés, ouverts = bugs/finitions résiduelles ≤ V1.0.x hotfix window.

### V1.0.x post-launch (hotfix window 2026-06-07 → 2026-06-21)

Items shipped mais avec gap mineur cross-wave validé :

- [ ] **C3.5 wire `useCompareImage` hook dans actual UI** — orphan production (Theme 2 Agent 05 A+B). `metadata.compareResults` jamais peuplé FE.
- [ ] **C3.7 score-floor gate** — `fallbackVisualThreshold` parsé mais jamais lu (`env.visualSimilarity.fallbackVisualThreshold`). Sans floor, kNN retourne quality arbitraire post-seed.
- [ ] **C6.5 amend "503 fail-open" wording** dans roadmap/docs — actually fail-CLOSED HTTP 503 avec payload dans `error.details`. Behavior correct, wording lie.
- [ ] **C7.5 device TTS smoke iPhone** — manuel pre-TestFlight submit (5-10 min Tim)
- [ ] **C10 ChooseAnother button wiring** `app/(tabs)/home.tsx:96-109` (proactive banner medium-confidence band silently dismiss au lieu de route picker)
- [x] **C10 race condition `useChatSession.ts:106-124` expo-speech + `useAutoTts.ts:44-59` server TTS** *(DONE #298 — Speech.stop cleanup `useChatSession.ts:149-155` + partition content-type)* — ajouter `Speech.stop()` + unified path (Theme 3 Agent 04 B)
- [x] **C10 a11y SettingsAccessibilityCard.tsx:32-36 `<Switch>` no accessibilityLabel/Hint/Role/State** *(DONE #298 — role/label/state `SettingsAccessibilityCard.tsx:36-38`)* — WCAG 4.1.2 + EN 301 549 §9.4.1.2 violation. 30 min fix.
- [x] **C10 5 WCAG/EN 301 549 violations audio description path** *(DONE #298 — I-CMP3 5/5 fermés)* — 2.2.2 (no user-controlled stop), 3.3.2 (no AT props), 4.1.2 (accessibility label), 1.4.2-AA (no pause control), EN 9.4.1.2 (accessibility name). Theme 3 Agent 04 Wave B critical.
- [ ] **C10 FE→BE write of `audioDescriptionMode`** — read works via bootstrap, write returns zero callers. Cross-device sync broken.
- [ ] **Accept-Language `fr-FR` strict-equals bug `chat-compare.route.ts:77-82`** — French users get English rationale. + Nominatim `accept-language=fr` hardcoded (forward path L113).
- [ ] **Maestro `.maestro/audio-recording-flow.yaml` cassé** — refs UI labels qui n'existent pas (`Hold to talk`, `Play assistant response`). Soit fix soit replace par `museum-frontend/maestro/voice-record-and-tts.yaml` (orphan, NOT in `.maestro/`).
- [ ] **Maestro flows pour AI badge + voice-intro + paywall** — UFR-021 gap. ~3 flows × 1h.
- [ ] **`reviews.userName` FE field that BE ignores** — `useReviews.ts:110-113` branches sur `409 already_reviewed` mais BE never emits. Dead branch + ghost field.
- [ ] **TTS audio FE cache filename `.mp3` post-Opus** — `useTextToSpeech.ts:61,169`. Cache schema-version key OR rename to `.opus`. Theme 3 Agent 02 B.
- [ ] **W2.2 branding doc UFR-013 fix** — code stocke `museums.config.branding` mais mobile FE ne le consomme PAS (`ChatHeader.tsx` uses `useTheme()` global). Soit ship le consumer (Q3 2026), soit retirer la claim "W2.2 shipped".

### NEW V1.0.x small (smalls quick wins) cross-validés

- [ ] **`SUPPORTED_LOCALES` dedup BE+FE** — proper candidate pour `@musaium/shared/i18n` subpath (2 real consumers). Agent 03 Wave B Theme 7.
- [ ] **`hashEmail` 32-bit fold byte-identical FE+web** — flag for shared.
- [ ] **Brevo unsubscribe one-click UX** (en plus de P0.B2 backend) — `dictionaries/{en,fr}.json:334` promise pas backed.
- [ ] **`SwipeableConversationCard.tsx:121-122` RTL right-side-only borders bug** — round wrong edge sous RTL. Agent 09 Wave B Theme 7.
- [ ] **`audit-factory-coverage.mjs` orphan** — delete OR wire pre-push.
- [ ] **`metric-naming.mjs` duplicate root (221 LOC) vs museum-backend (145 LOC, diverged)** — consolidate to one.
- [ ] **`workspace-links.mjs` not in CI mirror** — add to `sentinel-mirror.yml`.
- [ ] **`reportUnusedDisableDirectives`** — set in BE/FE/Web ESLint configs.
- [x] **`AUDIT_AUTH_LOGIN_FAILED` raw email metadata** *(DONE #294 — domain-only `login-handler.helpers.ts:60-66`)* — Wave B Agent 04 Theme 4. Hash le email post-13mo, ou strip from metadata.
- [x] **EXPORT_PSEUDONYM_SALT mandatory in prod** *(DONE #293 — fail-fast ≥32 chars `env.production-validation.ts:170-171`)* — ~~currently optional with hardcoded fallback~~.
- [ ] **Admin `DeleteUserUseCase` upgrade to hard-delete** — currently soft-delete only, Art.17 admin path incomplete.
- [ ] **`AUDIT_ACCOUNT_DELETED` log AFTER cleanup** — currently emits BEFORE → lies if cleanup throws.
- [ ] **`promtail-config.yml` add PII redaction stages** — currently zero. Defense-in-depth.
- [ ] **`shouldDropBreadcrumb` add `verify-email|magic-link|confirm-email-change` paths + scrubUrl on breadcrumb.data.url** — Agent 10 Wave B.

### C — Cluster items NOW résiduels

- [x] **C1.1 Dashboard Grafana p50/p95/p99 per-stage STT/LLM/TTS** *(DONE `f6335fe52` — `chat-stages-latency.json` + métrique `chat_phase_duration_seconds`, Prometheus-backed)*.
- [ ] **C1.3 Optim data-driven** — après baseline C1.1 ≥7j bake.
- [ ] **C4.2 Threshold confidence tuning** — calibrer cutoff LLM judge V2 sur dataset réel prod (V1.1).
- [ ] **C8.1-C8.6 VDP/CRA** — security@ mailbox (P0.B13), CNIL dry-run (Tim 60 min), ENISA SRP onboarding (deadline 2026-09-11, 60 min), CERT-FR contact 1Password (15 min Tim), PGP key (P0.B12), renewal calendar 2027-04-15 (5 min Tim).
- [ ] **C9.8 Activate Presidio adapter** — code wired conditional `chat-module.ts:11,441-445`, manque sidecar Dockerfile + docker-compose. Decision : V1.1 OR V1 si pivot scale. **Pas P0 V1** (email/phone regex couvre 95% RGPD V1 ; PERSON/LOCATION = faux positifs sur artist names + museum cities).
- [ ] **C9.18 deep-link artworkId** — fallback `/museum-detail` shipped, route canonique `/museum/[id]/artwork/[artworkId]` = TD-NEW V1.1.

---

## NEXT V1.1 (Q3-2026, juin-août) — chat backend modernization + B2B polish + V2 Walk prep

> ~5-6 j-h/sem soutenable solo. Re-priorisation interne possible au moment du pivot.

### W5 — Voice decision review

- [ ] **W5.1** 4 sem post-launch, décider WebRTC V1.1 (NEXT) ou continue features. WebSearch Wave 3 §3 : WAIT — Realtime API ~5x cost + full guardrail re-architecture (V1 + V2 layers assument per-message scan). Recommandation : skip V1.1.

### W6 — Chat backend modernization V1.1

- [x] **W6.1 Llama-Prompt-Guard-2-86M wire vs delete** — **décision P0.D3 lock = DELETE V1** (user 2026-05-21). Adapter dormant supprimé (Lot 6) ; prompt-injection couverte par LLM Guard (`llm-guard.adapter.ts:85`) + promptfoo LLM07 ≥95 %. **Wire déféré V2/V1.1** conditionné à une chute du pass-rate promptfoo. Cf. [`V1_LOCKDOWN_LOTS.md`](V1_LOCKDOWN_LOTS.md) §D3.
- [ ] **W6.2 Localiser system prompt FR/JA/ZH/AR** — créer `buildSystemPrompt_fr/_ja/_zh/_ar` + dispatcher. Prompt actuel 100% EN avec directive unique `Respond in ${language}` (Theme 3 Agent 09 A+B confirmé).
- [ ] **W6.3 tsvector + RRF hybrid search** sur `artwork_embeddings` — Postgres 16 natif. Recall@10 78% → 91%.
- [ ] **W6.4 Anthropic provider + prompt caching middleware** — `@langchain/anthropic` + `anthropicPromptCachingMiddleware({ttl:'1h'})` cache read 0.1× base = -90% cost cached prefix Claude.
- [ ] **W6.5 Folder refactor chat 44→33-35 en 2.75-3j** *(re-cadré honest, Agents 10 A+B Theme 7)* — `git mv` + sed imports. Anti-DDD `domain/{entities,repositories}` fusion **rejetée** ; adapter `→ext/` fusion **rejetée**. Splits dans `adapters/primary/http/{helpers,routes,schemas}` flatten (depth 7→6).
- [ ] **W6.6 Few-shot examples** — 3-5 prompts injectés dans `buildSystemPrompt` (artist alone, photo+question, refusal off-topic). +500-1500 tokens/req compensé par OpenAI L2 cache si stable-prefix maintained.
- [ ] **W6.7 promptfoo per-locale smoke 50 × 10 locales + multi-turn + PII output tests** — daily-art smoke 10 prompts noisy (10% drop par fail).
- [ ] **W6.8 LangChain Langfuse callback handler officiel** — remplacer wrap manuel `withLangfuseTrace` par `langfuse-langchain` SDK natif (-30 LOC). **MAIS** doit landiq APRÈS P0.A4 mask (sinon worse PII).
- [x] **W6.9 FE↔BE distributed tracing** — shipped 2026-05-17 (Sentry tracePropagationTargets + BE middleware).
- [x] **W6.10 Guardrail fairness dashboard Grafana** — shipped 10 panels (overall block rate + per-locale + per-layer + heatmap + FPR proxy + per-category + per-locale decisions volume).
- [ ] **W6.11 LLM_CACHE_ENABLED env kill-switch + `outcome=cache_hit` propagation chat-message → chat.service** — ADR-036 §50 specs it, absent. Outcome metric never observes.
- [ ] **W6.12 Grafana panel `llm_cache_hit_ratio` global ratio + `llm_prompt_cache_hit_ratio`** — telemetry exist, viz missing.

### W7 — Voice persona + dynamic UX V1.1 (top 3 bets shippables)

- [ ] **W7.1 Multi-persona voice 3 personas** — Curator / Friend / Kid + TTS_VOICE map + system prompt branch. WebSearch Wave 3 confirme Herodot UX réussit avec persona selector. Piggyback sur `guideLevel` already plumbed `useChatSession → SendMessageContext`. Effort 5-8j.
- [ ] **W7.2 Dynamic WelcomeCard** — replace 3 fixed buttons par `useDynamicSuggestions()` (GPS + last artwork + hour + weather). Doctrine debt `project_hybrid_product_philosophy`. Effort 3j.
- [ ] **W7.3 Mid-conversation idle nudge** — silence > 30s côté FE → bot dit "tu sembles réfléchir, je peux en dire plus ?". Effort 3j.

### B2B polish V1.1

- [ ] **Multi-tenant scoping all admin routes** (pas juste CSV) — `museum_manager` full path. P0.C9 deferred.
- [ ] **NPS true 0-10 per museum** — si `reviews.museum_id` shipped P0.C7.
- [ ] **Admin DeleteUserUseCase hard-delete path** — Art.17 admin parity.
- [ ] **Drop dead 409 `already_reviewed` branch + dead `userName` field FE reviews**.
- [ ] **OpenAPI spec `/leads/*` paths missing** — add to spec.
- [ ] **Rate-limit Brevo per-pod** — currently per-process (5×N effective).
- [ ] **B2B page i18n parity** — museums admin pages English-only `STRINGS`.

### Sécurité hardening V1.1

- [ ] **Sentry `event.tags` walked by `scrubEvent`** — currently bypassed.
- [ ] **Hash-at-write IP via HMAC keyed** (vs 13mo anonymize cron).
- [ ] **Zero-width strip in user-message path** — sanitizePromptInput OR normalize update. Documented `payloads.ts:37` bypass.
- [ ] **Homoglyph fold `confusables` package** — Phase 5 TODO.
- [ ] **Locale re-validation at audio-transcriber + llm-guard.adapter boundaries**.
- [ ] **History re-sanitization on retrieval**.
- [ ] **Cross-museum QR replay vulnerability fix** — deeplink drops museumId silently. FE→BE add museumId + scope check (Theme 6 Agent 05 A+B).
- [ ] **Audit chain ADR-054 Phase 1+2** (UUIDv7 + drop lock → Merkle batcher 60s + RFC 3161 anchor V1.2). WebSearch Wave 2 §4. ~1 sprint.
- [ ] **Privilege escalation: admin promoting to super_admin** — add privilege comparison.

### Personnalisation Spec C deferred

- [ ] **LanguagePreference auto-detect UX surface** — BE-only shipped, ajouter toast FE "tu sembles parler français — passe en FR ?" (Theme 3 Agent 09 A+B).
- [ ] **SessionDuration P90** — BE shipped, prompt-hint only ; potentielle adaptation déterministe longueur réponses.

### Premium full (post-stub validation)

- [ ] **Stripe + iOS receipt + Android billing** — démarrage conditionné C6.5 data soft-paywall stub (taux conversion + retention free→premium).
- [ ] **Pricing décidé selon funnel data + benchmarks**.
- [ ] **Receipt validation BE + entitlement cache**.

---

## NEXT V2 — Walk hors-musée (sprint sep-nov 2026, ~4 semaines)

> **Démarrage conditionné fin Phase 1 + signal KR2 NPS ≥7/10 sur 50 sessions.** Tous les items hors-musée déplacés ici post-cadrage.

### V2 Walk MVP (cross-wave scope estimate)

- [ ] **`features/walk/` création** — directories absent, ~700 LOC FE neufs (state machine, screens, GPS-arrival detection, audio queue)
- [ ] **3-4 migrations** : `museum_pois`, `walk_routes`, `walk_progress`, optional `tour_step_audio_cache`
- [ ] **BE `walk` module** : directions adapter (OSRM self-host, ADR-recommended) + circuit breaker + audio sidecar
- [ ] **TTS audio streaming refonte** — port returns `Readable` not `Buffer`. Chunked encoding. Affecte chat-media.service.ts.
- [ ] **MapLibre polyline rendering** — `<LineLayer>` + `<ShapeSource>` GeoJSON. Glyph URL `demotiles.maplibre.org` → self-hosted prod-safe.
- [ ] **Pause-resume pattern VoiceMap-style** — `expo-av` queue + AsyncStorage position + iOS background audio mode (déjà partially declared via UIBackgroundModes:audio Info.plist).
- [ ] **Background GPS** — `expo-task-manager` + `requestBackgroundPermissionsAsync` (App Store re-review required, P0.B10 d'abord).
- [ ] **5 ADRs requis** : audio streaming model (chunked vs Realtime), directions provider, POI source (Overpass-runtime vs persisted), state machine library (XState vs reducer), background GPS day-1.

### V2 Catalog content

- [ ] **Tours hand-curated Bordeaux (démo)** — ~5 tours × 5-8 POI chacun pour MVP démo (aucun musée contracté — contenu démo)
- [ ] **Audio scripts FR/EN par tour** — copywriting + TTS pre-render OR live

---

## LATER — Q4 2026+ / Moonshots (NorthStar integration)

### Infra VPS hardening post-launch (incident 2026-05-20)

- [ ] **F1 Disque dédié /var/lib/docker** — OVH Additional Disk. 1j.
- [ ] **F2 Photos visiteurs sur S3/B2** — `museum_uploads` volume offload. 3-5j (mais adapter S3 déjà prêt + tests existent — réel work <1j post-IaC).
- [x] **F3 DB backups off-VPS** — ~~restic~~ SHIPPÉ 2026-04-26 : GHA `db-backup-daily.yml` (`pg_dump | gpg | s5cmd → S3`) + restore drill mensuel `db-backup-monthly-restore-drill.yml`. *Corrigé 2026-05-21 (claim "single point of failure" était stale/faux).* **Résiduels (→ I-OPS5)** : volume `uploads`/media non-backupé ; backups dans le même bucket que les médias (shared-fate) ; perte clé GPG = DR morte.
- [ ] **F4 Split VPS multi-tenant** — quand museum CPU avg > 50%. 1j + 5€/mo.
- [ ] **F5 Container resource limits docker-compose.prod.yml**.
- [ ] **F6 Disk-usage SLO + ratchet trimestriel**.

### M1 V1.2 B2B-ready (Q3-2026, ~130 j-h équipe 2 devs)

- [ ] **M1.1 Curator-overrideable LLM** — override-pack JSON pour 50 œuvres priorité. Pitch B2B critique. 15-20j.
- [ ] **M1.2 Dashboard analytics musée** — drop-off, top works, satisfaction agrégée, NPS par room. ROI mesurable côté musée. 30-40j (overlap avec P0.C8 multi-tenant fix).
- [ ] **M1.3 White-label / co-branding** — couleur primaire + logo + tier Starter/Branded/Premium. + Mobile FE consumer for `config.branding`. 20j.
- [ ] **M1.4 AR pilot 1 musée contracté** — ARKit + ARCore overlay 3D restoration. Match Smartify €1.8M move. 30j.
- [ ] **M1.5 Sign Language LSF/BSL overlay top 50 œuvres** — EN 301 549 §1.2.6. SignGuide-inspired. 25-40j.
- [ ] **M1.6 Voice pack artistes domaine public** — Cézanne / Monet / Renoir via ElevenLabs Iconic Marketplace. NPS bait + premium B2B upsell. **Picasso/Frida/Warhol = négo successions, ne pas DIY.**

### M2 V1.2 RAG modernization (triggered)

- [ ] **M2.1 Anthropic Contextual Retrieval** sur chunks Wikidata — WebSearch Wave 3 confirme tier S : -49 à -67% failed retrievals compoundé avec reranker C9.13. Trigger : KB miss rate > 20% mesuré Langfuse. 3-4 sem.
- [ ] **M2.2 GraphRAG Microsoft modular** sur Wikidata art-domain — +3.4x precision multi-hop. Trigger : queries multi-hop > 30% trafic. 4-6 sem.
- [ ] **M2.3 Jina-CLIP-v2 multilingual encoder swap** — 89 langues natif. Trigger : B2B EU non-EN onboarding (Uffizi, Prado, Reina Sofía). WebSearch Wave 3 tier S. 2-3 sem.
- [ ] **M2.4 gpt-realtime-mini split walk-mode** — 300ms E2E latence walk-mode uniquement (paywall 5min/jour freemium). Trigger : NPS-voice <7 sur 4 sem post-launch. **Décision conservatrice WebSearch Wave 3 : park V2.1+**, full guardrail re-arch requise.
- [ ] **M2.5 Exa.ai / Linkup.so eval parallèle vs Tavily** — hedge supply chain risk (Nebius rachat Tavily $400M Feb 2026).

### M3 V2.1+ moonshot 20-ans-avance (2027+)

- [ ] **M3.1 3DGS scan pivots œuvres** — Polycam pro / Luma AI ($5-50/œuvre). 1 œuvre offerte par musée contracté = pitch B2B wow. 1 sem POC + 2-3 sem industrialisation.
- [ ] **M3.2 Live multi-visitor co-presence "shared walk"** — indoor beacons + WebSocket. **Différenciateur UNIQUE marché.** RGPD opt-in strict. 2-3 sem.
- [ ] **M3.3 Generative AI re-mix œuvre** — DALL-E 4 / Flux 2. **Whitepaper droit d'auteur requis** (Picasso < 70 ans CE ambigu fair use). 3 sem.
- [ ] **M3.4 Affective computing emotion-adaptive** — front-cam 89% group. **⚠️ AI Act Art.5 prohibition workplace/school**. Musée loisirs zone grise → légal review obligatoire. Italian Garante 5M€ Replika signal. 2-3 sem POC.
- [ ] **M3.5 Wearable haptic feedback Apple Watch** — silent wayfinding multi-room + cadence. UX différenciateur silencieux musée bondé + a11y ADHD. 2 sem.
- [ ] **M3.6 Voice mood detection prosody** — F1 0.78-0.87. Bot adapte "veux-tu une pause ?". Strictly on-device opt-in. 2-3 sem R&D.
- [ ] **M3.7 Cross-museum visit graph & recommendation** — "tu as adoré Pollock à NYC, va voir Soulages à Pompidou". Déjà 80% bâti via `useResumableSession`. 2-3 sem.

### Réseau social museum-explorer / Spec D / autres

- [ ] **Réseau social museum-explorer** (partage balade, follow autres visiteurs)
- [ ] **Offline mode complet** (pack musée DL avant visite, sync diff retour Wi-Fi)
- [ ] **LLM cache cross-user warm** (réponses populaires partagées même musée)
- [ ] **Multi-langue extended FR/EN/ES/DE/IT/JP/AR** UI complète web (admin actuellement EN-only)
- [ ] **Realtime social** — visiteurs même musée se voient + chat groupe (nécessite M3.2)

### NE PAS planifier (raison documentée)

- BCI Neuralink — 2030+ pas commercial.
- Voice clone Picasso/Frida/Warhol DIY — négo successions only, jamais DIY.
- Persona AI manipulatrice émotionnelle (Replika antipattern, Italian Garante 5M€ 2025).

---

## KILLED (ne pas redécider sans signal nouveau)

| Item | Date kill | Raison |
|---|---|---|
| Spec D recall + cross-session affinity | 2026-05-03 | Solution chercher problème, pas use-case clair |
| Roadmap NL_LINKEDIN_* (4 plans) | 2026-05-03 | One-shot exécuté |
| Roadmap PROD_10_10 user-first | 2026-05-03 | Remplacée par cette roadmap |
| SSE streaming chat | 2026-04 (ADR-001 historique) | Replaced by sync chat — BE déjà déprécié ; FE burial P0.D1 |
| Garak orchestrator | 2026-05-17 | Coût réel ~$120/mois vs $2 estimé. Deferred V2.1 fast-path |
| Realtime API V1 walk-mode | 2026-05-20 | WebSearch Wave 3 : 5x cost + full guardrail re-arch. Park V2.1+ |
| Voice clone DIY succession-licensed artists | 2026-05-03 | Six-fig négo only |
| Hexagonal POJO 23 entities V1 | 2026-05-20 | 157 fichiers cross-importants, infaisable V1 |
| Chat éclatement 4 sous-modules V1 | 2026-05-20 | 909 LOC composition root sain |
| W6.5 folder 44→22 en 6j | 2026-05-20 | Fiction. Realistic 44→33-35 en 2.75-3j (kept) |

---

## Comment utiliser cette roadmap

1. **Début sprint** : /team lit ce fichier + ROADMAP_TEAM.md, propose features NOW à attaquer (Spec Kit obligatoire si non-trivial). NEXT bloquée tant que NOW incomplète, sauf hotfix V1.0.x.
2. **Pendant sprint** : coche `[x]` au merge. Bloqué = `[BLOCKED: raison]` inline.
3. **Pivot NOW → NEXT** : quand P0.A-D + items NOW tous cochés, NEXT V1.1 remonte au prochain `/team roadmap:rotate`.
4. **Fin sprint** : réécriture file complète (NOW vidé, NEXT remonte, LATER trié, KILLED preserve), commit `docs(roadmap): sprint <YYYY-MM-DD>`.
5. **Hors sprint** : nouvelle idée → LATER avec date. Promotion vers NEXT au tri suivant.
6. **Audit critique** (P0 launch / security / GDPR) : UFR-025 — Wave A + Wave B fresh-context. Consensus A+B = claim valide.

**Source de vérité unique pour produit.** CLAUDE.md pointe ici. /team consolide à chaque cycle (cf. ROADMAP_TEAM.md §Auto-consolidation). Toute modif majeure DOIT passer par UFR-024 (preuve `path:line`/`git show` reproductible).
