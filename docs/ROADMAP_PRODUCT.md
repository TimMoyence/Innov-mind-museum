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
| **B2C visiteur** | Freemium (3 sessions/mois free, abonnement Premium illimité) | Hypothèse — soft-paywall stub V1 (C6 shipped) pour valider data-driven via PostHog (P0.F2) |
| **B2B musée** | Licence annuelle + co-branding optionnel | **0 musée démarché à ce jour.** Capacité B2B (image-compare + multi-tenant + co-branding + analytics) en préparation pour pitch — hypothèse future, aucun contrat |
| **Institutionnel** | Subvention culture / appel à projets | Backlog 2026 H2 |

---

## OKR Q2-2026 (Mai-Juin) — re-cadré 2026-05-20

**Objective** : Lancer Musaium V1 le 7 juin 2026 (minimum) avec une expérience compagnon culturel IA in/out musée (œuvres + monuments/lieux) qui donne envie de revenir + une capacité B2B démontrable (image-compare + co-branding + analytics par musée) — aucun musée démarché à ce jour, le B2B est une hypothèse future.

| KR | Cible | Mesure |
|---|---|---|
| **KR1 — Pitch B2B prêt** | Capacité B2B démontrable (démo image-compare + co-branding + analytics par musée) — **aucun musée démarché, aucune cible contrat V1** (démarchage = après que l'app soit utilisable) | Démo fonctionnelle prête |
| **KR2 — Companion NPS** *(re-cadré : était "Walk V1 NPS")* | NPS post-session ≥7/10 sur 50 sessions test ; benchmark B2B SaaS 2026 = +45 médian | Survey in-app — **BLOCKER : `reviews` table sans `museumId`, NPS true 0-10 non implémenté.** Voir P0.B7. |
| **KR3 — Stabilité** | Crash-free ≥99.5% + chat p99 <5s + 0 P0 bug | Sentry + Langfuse + Grafana |
| **KR4 — Adoption** | 100 visiteurs B2C inscrits semaine 1 post-launch | Funnel PostHog/Plausible (P0.F2 P0 bloquant) |

---

## P0 Launch Readiness (2026-06-07 minimum)

> **Verdict cross-wave A+B** : ~30-35 items réellement ouverts P0 (security/GDPR/code/compliance). Effort dev cumulé ~50-70h + ~5h ops Tim.
>
> **Codes** : ✅ = verified shipped Wave A+B consensus. ❌ = verified open. ⚠️ = partial.
>
> **🔁 Réconciliation doc↔code 2026-05-21** (vérifiée grep/read — détail + lots de dev dans [`V1_LOCKDOWN_LOTS.md`](V1_LOCKDOWN_LOTS.md)) : 12 items ci-dessous étaient marqués `❌` mais sont en fait **mergés ou réfutés** → re-marqués `✅`. Le texte d'audit d'origine de chaque ligne est conservé tel quel ; le marqueur ✅ + ce bloc font foi.
> - **B1** `deleteAccount.useCase.ts:97` audio cleanup · **B2** `brevo-beta-signup.notifier.ts:81` removeContact · **B3** `exportUserData.useCase.ts:86` (userMemory/auditLogs/messageFeedback/…) · **B4** `image-storage.s3.ts` deleteByPrefix + legacyFetcher · **B5** `runS3OrphanPurge` wiré `index.ts:467` · **B8** `useAiConsent.ts:26` clé namespacée + AuthContext clear · **B9** `thirdPartyAiConsent.ts:25` scope location_to_llm · **B11** `image-processing.service.ts:162` fallthrough observable.
> - **I-SEC4** `auth-api-keys.route.ts:29` a déjà `requireRole(MUSEUM_MANAGER,ADMIN)` (claim STALE) · **I-SEC6** `login-rate-limiter.ts:100` hash déjà l'email SHA-1 (claim « plaintext » RÉFUTÉ).
> - **I-OPS1** `sentry-init.ts:33` conforme (doc pessimiste — RN mappe release/dist auto) · **I-CMP4** badges web OK ; contraste mobile non reproductible depuis les tokens (caveat conservé).
> - **Déféré V1.1** : I-SEC11 (SSRF latent, `urlHeadProbe` undefined au V1).

### P0.A — Security & PII (dev ~20-25h)

| ID | Item | Preuve code (cross-wave) | Effort |
|---|---|---|---|
| ✅ **P0.A1** | **Email clair-texte** — créé `@shared/pii/extractEmailDomain.ts` + patché les 3 sites in-scope (`forgotPassword.useCase.ts`, `login-handler.helpers.ts`, `auth-password.route.ts`) → `emailDomain` only. Merge `71f103b35` (#294 squash). Follow-up : `auth-email.route.ts:47` `newEmail` brut (LOW, hors scope). | Agent 01 confirmé. Logger sans scrub layer ; audit metadata `LooseRecordSchema`. | 60-90 min |
| ✅ **P0.A2** | **DOB bypass exploitable curl direct** — drop `.optional()` `auth.schemas.ts` + drop fallback `if(!dateOfBirth) return` `register.useCase.ts` (hard-throw 400) + OpenAPI `required[]` + tests réalignés (unit+e2e+perf+contract). Merge `71f103b35` (#294 squash). | Exploit confirmé `curl -X POST /api/auth/register -d '{"email":"minor@test.fr","password":"V1"}'` → 201 + null DOB | 2-3h |
| ❌ **P0.A3** | **Sentry tag URL leak + `event.tags` NON scrubbé** — utiliser `scrubUrl` dans `error.middleware.ts:94,102,120` + ajouter `code`, `state`, `email`, `phone` à `SENSITIVE_QUERY_KEYS` + scrubber `event.tags` chokepoint dans `beforeSend` (PAS juste `scrubEvent` qui ne walk que request/user/extra). Upstream `redactQueryString` decode-semantics dans `scrubUrl` puis delete duplicate | OAuth `/api/auth/google/callback?code=<authcode>&state=<jwt>` leak | 60-90 min |
| ❌ **P0.A4** | **Langfuse `mask:` SDK option NOT wired + `updateRoot:true` hazard** — wire `LangfuseCoreOptions.mask` `langfuse.client.ts:55` ctor + `stripFreeText(data)` blacklist `data.input.messages[]`/`data.output.text` + sentinel PII-seed test. WebSearch Wave 2 §1 recommande dual-pass regex+Presidio + sentinel CI. Required SI `LANGFUSE_ENABLED=true` prod (default false, hotfix 2026-05-17) | `langfuse-langchain.ts:61` `updateRoot:true` confirmé ; grep `mask:` = 0 hits | 60-90 min |
| ❌ **P0.A5** | **Version drift Android `app.config.ts:121` literal `'1.2.3'` vs `package.json:4` `1.2.4`** — dynamiser `version: require('./package.json').version as string` + **créer** `scripts/sentinels/museum-frontend-version-sync.mjs` (sentinel NEVER EXISTED malgré claim audit antérieur, vérifié Wave A+B) | finding A7 cross-validé | 45-60 min |
| ❌ **P0.A6** | **Cost circuit breaker fail-OPEN confirmed** — `LlmCostCircuitBreaker.canAttempt()` `llm-cost-circuit-breaker.ts:107-114` JAMAIS appelé (grep `costBreaker.canAttempt(` = 0 hits ; seul guardrail breaker `llm-guard.adapter.ts:226`). Wire `if (!await this.costBreaker.canAttempt()) throw new CostCircuitBreakerOpenError()` AVANT `invokeSection`. **Le claim original "telemetry only" est correct, l'incident type avril 2026 ($437/nuit retry loop, WebSearch Wave 1 §6) confirme l'urgence.** | Agents 02, 05 A+B confirmés. 5 alerts Prom wirees, 0 enforcement. | 2-3h |
| ❌ **P0.A7** | **Walk path bypasses circuit breaker** — `langchain.orchestrator.ts:373-467` `generateWalk` ne check PAS `circuitBreaker.state === 'OPEN'` (main path L249 check). Cost containment bypassable. | NEW finding cross-wave Theme 1 Agents 01 A+B | 1h |
| ❌ **P0.A8** | **Honesty docstring fixes (UFR-013)** — (a) `llm-cost-circuit-breaker.ts:1-6` "PHASE 2 PRIMITIVE, NOT WIRED" est mensonger (`recordCharge` shipped 0635b883d) ; (b) `deleteAccount.useCase.ts:63-64` comment "chat_sessions removed first" partiellement faux (FK `onDelete:SET NULL` mais code explicit DELETE in txn — comment doit refléter réalité) | Agents 05, 10 A+B | 30 min |
| ❌ **P0.A9** | **OAuth callback `code` in SENSITIVE_QUERY_KEYS** — subsumed by P0.A3 mais explicite : ajouter `code`, `state` (réellement absents) | grep `SENSITIVE_QUERY_KEYS` `sentry-scrubber.ts:23-31` | Inclus P0.A3 |

### P0.B — GDPR + Anonymisation (dev ~12-18h, Ops Tim ~2h)

| ID | Item | Preuve | Effort |
|---|---|---|---|
| ✅ **P0.B1** | **TTS audio orphans on user delete (GDPR Art.17)** — `audio-storage.s3.ts:43-48` keys `chat-audios/YYYY/MM/<uuid>` SANS user prefix. `AudioStorage` n'a pas `deleteByPrefix`. `DeleteAccountUseCase` ZERO appel audio cleanup. Voice content survit l'erasure. | Cross-wave Agents 02 A+B confirmés | 2-3h |
| ✅ **P0.B2** | **NO Brevo unsubscribe on user delete (Art.17 + e-Privacy)** — Seul `subscribe()` existe `brevo-beta-signup.notifier.ts:28-72`. Wire `DELETE /v3/contacts/{email}` + appel dans `DeleteAccountUseCase` | Agents 02 + Leads 09 cross-validés. UI claim "One-click unsubscribe" `en.json:334`/`fr.json:334` non backed. | 2-3h |
| ✅ **P0.B3** | **DSAR export incomplet (Art.15)** — manquent `UserMemory` (favoriteArtists/museumsVisited/notableArtworks JSONB/summary), `AuditLog` rows attribuables, moitié colonnes `User`+`ChatSession` (coordinates/visitContext/museumId/currentRoom/currentArtworkId), `message_feedback`, `message_reports`, `social_accounts`, `api_keys`. | Agents 02 A+B + Wave B G-6b/c/d/e/f | 3-4h |
| ✅ **P0.B4** | **S3 prefix mismatch bug** — writer `chat-images/yyyy/mm/user-<id>/...` vs `deleteByPrefix` scan `chat-images/user-<id>/`. **Art.17 erasure scan = ZERO match production.** Fix: scanner utilise `Prefix=chat-images/` + filter substring `/user-<id>/`. + Wire `legacyImageRefLookup` 3rd arg dans `auth/useCase/index.ts:128` (proxy strips le legacy fetcher) | Agents 03 A+B + 10 A+B confirmés | 2h |
| ✅ **P0.B5** | **`runS3OrphanPurge` NEVER wired in `src/`** — exists + 10 tests dans `museum-backend/src/modules/chat/jobs/s3-orphan-purge.job.ts:193` mais grep BE = 0 callers. Wire dans `index.ts` cron. | Cross-wave Agents 10 + Wave B 02 TTS | 30 min |
| ❌ **P0.B6** | **BE consent NOT enforced at LLM call site** — seul `location_to_llm` gated (`location-resolver.ts:196-200`). 8 third_party_ai scopes (4 cat × 2 providers OpenAI/Google) NOT enforced. Wire `ThirdPartyAiConsentChecker` port + scope check dans `prepare-message.pipeline.ts` mirror `LocationConsentChecker`. Audit chain prouve la revoke mais BE l'ignore = Art.7(3) violation symbolique. | Agents 06 A+B + 07 A+B + ADR-053 §follow-ups #2 | 3-4h |
| ❌ **P0.B7** | **Audio consent NOT enforced sur `POST /sessions/:id/audio`** — scope `third_party_ai_audio_openai` collecté `AiConsentSheetContent.tsx:75-80`, zero check BE. Refuser peut quand même submit à OpenAI. Wire `ConsentChecker(third_party_ai_audio_openai)` OR remove the toggle (UFR-013). | Agents 01 A+B Theme 3 + 06 A+B | 1h |
| ✅ **P0.B8** | **Consent inheritance bug FE (cross-user)** — `useAiConsent.ts:7` `CONSENT_KEY = 'consent.ai_accepted'` sans userId namespace. `clearPerUserFeatureStorage` `AuthContext.tsx:109-120` clear cache/daily-art/biometric mais PAS `clearConsentAcceptedFlag()` (qui existe `useAiConsent.ts:16-22`). User A grant → logout → user B logon même device → sheet n'ouvre pas. **GDPR Art.7(1) broken + Apple 5.1.2(i) bypass shared devices.** One-line fix. | Agents 06 A+B cross-wave | 30 min |
| ✅ **P0.B9** | **`location_to_llm` consent FE UI absente** — scope dans BE `userConsent.entity.ts:25` mais ABSENT de FE `THIRD_PARTY_AI_SCOPES` `thirdPartyAiConsent.ts:13-22`. Pas dans `SettingsAiConsentCard` ni `AiConsentSheetContent`. **En prod la BE retourne false toujours → location SILENTLY DROPPED de chaque chat.** Ship le toggle OR retirer le scope + simplifier BE. | Agents 02 + 07 Wave B cross-validés | 60-90 min |
| ❌ **P0.B10** | **iOS Info.plist drift `NSLocationAlwaysUsageDescription`** — `ios/Musaium/Info.plist:68-71` + dernière `.xcarchive` shippent `NSLocationAlways*` malgré `app.config.ts:316-319` declarant uniquement `locationWhenInUsePermission`. **App Store Review 5.1.1(i) risk.** Code ne fait jamais `requestBackgroundPermissions`. Re-prebuild propre OR retire les keys du Info.plist. | Agent 07 Wave B Theme 6 confirmé | 30-60 min |
| ✅ **P0.B11** | **EXIF strip `imageProcessor` optional fallthrough silent** — `image-processing.service.ts:162-165` claim "observable" mais pas de log/metric. Composition root oubli = EXIF intact shipped silencieusement. Add boot assert dans `chat-module.ts`. | Agent 03 Wave A + 10 Wave B | 30 min |
| ❌ **P0.B12** | **PGP key real OR remove `Encryption:` line** — `museum-web/public/.well-known/pgp-key.txt` body = literal `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP`. Soit gen Ed25519 2y + remplace, soit retire `Encryption:` line de `security.txt`. CI gate à ajouter. | Agents 09 A+B | 30 min Tim |
| ❌ **P0.B13** | **`security@musaium.com` mailbox provisioned + smoke RFC 9116** — alias OVH → Gmail Tim. Bloque launch (sans, `SECURITY.md` ment). | Cross-wave + C8.1 | 30 min Tim |
| ❌ **P0.B14** | **Langfuse DPA + SUBPROCESSORS.md** — Langfuse Cloud actif `museum-backend/.env:180-183` (URL `https://cloud.langfuse.com`, keys committed) mais `docs/compliance/SUBPROCESSORS.md` 20 vendors, 0 Langfuse row. Sign DPA + ajouter row + créer `docs/legal/dpa-signed/` archive (n'existe pas). | Agents 05 A+B | 60 min Tim |
| ❌ **P0.B15** | **Privacy policy : 14 vendors missing on 3 public surfaces** — HTML / Web / FE in-app listent 5-6 sur 20. Manquent : **Brevo + Sentry + Apple + Tavily + Brave + Unsplash + Langfuse + CARTO + Wikidata + Wikimedia + Nominatim + OSMF + Tavily-disabled + Better-Stack**. **GDPR Art.13(1)(e) failure.** Ajouter aux 3 surfaces + créer `/subprocessors` route public. | Agents 05 + 09 A+B cross | 2-3h |
| ❌ **P0.B16** | **Privacy policy version sync** — 3-way drift `1.0.0` à 3 dates (HTML 18-mars / Web 17-mai / FE 18-mars). Bump à `2026-06-07` partout + une source of truth. HTML §10 dit `16 ans` (faux), Web/FE disent `15 ans` (correct CNIL Délib. 2021-018). | Agent 09 A+B | 60-90 min |
| ❌ **P0.B17** | **`ANTHROPIC_API_KEY=sk-ant-…` in `museum-backend/.env:108` mais ZERO usage** — pas de `@anthropic-ai/sdk` deps, 0 .ts refs, pas parsé `env.ts`. **Soit credentials leaked → REVOKE immédiat, soit dead config → DELETE.** | Agent 05 A+B | 15 min |
| ❌ **P0.B18** | **`/terms` route absente museum-web + cookie banner web** — Footer.tsx liste Privacy/Support/Accessibility/Security/B2B sans Terms. Web utilise cookies admin (auth) sans banner — e-Privacy Art.5(3) risque si analytics script joins. | Agents 09 A+B | 2-3h |
| ❌ **P0.B19** | **S3 bucket PAB IaC** — `docs/incidents/BREACH_PLAYBOOK.md:217` admet "operator responsibility". `infra/` pas de Terraform. **Une console misclick = world-readable bucket avec keys embeded `user-<userId>` enumerable.** Terraform OR CI sentinel boot-check `GetPublicAccessBlock`. | Agent 03 A+B | 1-2h |

### P0.C — Feature gates launch-critical (dev ~8-12h)

| ID | Item | Preuve | Effort |
|---|---|---|---|
| ❌ **P0.C1** | **SigLIP model provisioning** — `Dockerfile.prod:38` runs `fetch-models.sh` mais script avale 404 silencieusement quand `SIGLIP_ONNX_SHA256` unset. GCS bucket `musaium-models-public` TODO `fetch-models.sh:36-40`. Prod default `EMBEDDINGS_PROVIDER=siglip-onnx` → cold start /chat/compare = 503. Soit bake dans Docker, soit provision GCS + pin SHA256. | Agents 01 A+B Theme 2 | 1-2h |
| ❌ **P0.C2** | **SPARQL license classifier 100% reject silent** — `catalog-ingest.ts:175-183` `classifyLicense` compare contre slugs `'public-domain'|'cc-0'|'cc-by-sa'`, mais SPARQL Wikidata returne `?license` = URIs `http://www.wikidata.org/entity/Q19652`. Le test fixture `catalog-ingest.test.ts:108` injecte directement le slug → bug invisible. Fix mapping URI→slug. | Agents 03 A+B Theme 2 | 2-3h |
| ❌ **P0.C3** | **`catalog-ingest.ts:310-317` écrit `museum_id=NULL`** — pas de `--museum-id=<int>` CLI flag. `museums` table n'a pas `wikidata_qid` column → impossible de resolve UUID via SPARQL Q-code. **Cross-tenant leak post-B2B.** Ajouter migration `museums.wikidata_qid` + CLI flag + lookup. | Agents 03 A+B | 2-3h |
| ❌ **P0.C4** | **Seed démo (PAS de pilots contractés — 0 musée démarché)** — 3 musées Bordeaux de démo dans `seed-museums.ts:91-115` (slugs+adresses 33000/33300) **sans Q-codes**. Q-codes résolus 2026-05-21 (wikidata.org, vérifiés) : Aquitaine **Q3329534** / CAPC **Q2945071** / Cité du Vin **Q16964634**. ⚠️ `scripts/seed-pilot-museums.sh` **N'EXISTE PAS** (claim audit antérieur faux) — les Q-codes Paris (Louvre Q19675/Orsay Q23402/Pompidou Q193554) à retirer sont dans `catalog-ingest.helpers.ts` + `seed-museums.ts`. **Ajouter aussi 1 monument exemple (Pont de Pierre, Bordeaux)** pour exercer le cas in/out musée. | Q-codes vérifiés + paths re-checkés 2026-05-21 | exec dev 2-3h |
| ❌ **P0.C4b** | **RISQUE CONTENU image-compare (C3) sur les musées démo Bordeaux** — `catalog-ingest` tire les œuvres par appartenance collection Wikidata + filtre licence-libre + image P18. **Aquitaine + CAPC = peu d'œuvres, Cité du Vin (centre culturel vin, pas musée d'art) ≈ zéro œuvre Wikidata exploitable.** C3 image-compare (différenciateur "wow") risque `no_visual_neighbor` systématique même P0.C1-C3 fixés. **Action : query SPARQL count `wdt:P195 <musée> + wdt:P18` AVANT de promettre C3 dans la démo.** Si < quelques dizaines/musée → seed manuel curaté OU descope C3 de la démo. | Conséquence directe du seed démo Bordeaux | Vérif 30 min + décision |
| ❌ **P0.C5** | **Telemetry conversion funnel (KR4)** — install PostHog self-hosted OU Plausible + 3 FE events (`paywall_modal_shown`, `paywall_cta_clicked`, `paywall_email_captured`) + 1 BE (`quota_exceeded`) + consent gate GDPR + dashboard simple. C6.5 confirmed ABSENT par Wave B (grep `posthog\|plausible` = 0). | Agents 10 A+B Theme 5 | 6-10h |
| ❌ **P0.C6** | **`.env` corrections release** — CORS_ORIGINS, BREVO_API_KEY, APP_VERSION, GOOGLE_OAUTH_CLIENT_ID, drop dead vars (TTS_ENABLED, ANTHROPIC_API_KEY, GOOGLE_CSE_*, SEARXNG_INSTANCES, SMTP_BREVO + ANTHROPIC_API_KEY P0.B17). Mirror `.env.example` → `.env.production.example`. + `FEATURE_FLAG_WEB_SEARCH=true` unread → delete (UFR-015). | Agents 07 + 02 A+B | 60 min |
| ❌ **P0.C7** | **Reviews + Tickets + SupportTickets `museum_id` columns MANQUANTES** — bloque KR2 NPS per-museum + W3.3 moderation claim "scope museum-admin verified" (faux). Ajouter migration + scope all read+update paths. **OU** descope KR2 à NPS global V1. Tim décide. | Agents 08 A+B + 04 RBAC A+B | 4-6h dev OU 0 si descope |
| ❌ **P0.C8** | **Multi-tenant leak `/api/admin/analytics/*`** — 3 endpoints + `/api/admin/stats` SANS `museumId` scoping. Zod `strictObject` rejects `museumId=` query → FE selector 400. SQL never filters `WHERE museum_id`. **`admin` role peut voir TOUS tenants.** Fix : ajouter `museumId` Zod field + SQL filter + RBAC scope check. | Agents 05 A+B Theme 5 | 3-4h |
| ❌ **P0.C9** | **`museum_manager` paper role — not in AdminShell allow-list** — `AdminShell.tsx:195-201` allow `['admin','moderator','super_admin']`. Museum_manager 403 sur entry. Soit ajouter au allow-list + scope ; soit dropper le role pre-launch. | Agents 02 + 04 A+B | 1-2h |

### P0.D — Honesty / dead-code (dev ~3-5h)

| ID | Item | Preuve | Effort |
|---|---|---|---|
| ❌ **P0.D1** | **SSE residuals burial `museum-frontend/features/chat/`** — backend SSE supprimé 2026-05-17 (commits `e433741f8` + `62feca482`). FE garde ~1000 LOC dormant : `sseParser.ts` (81), `chatApi/stream.ts` (214), `sse-parser.test.ts` (139), `chatApi.test.ts` SSE blocks (~600), `streaming.e2e.test.ts` (119, references deleted `chat-message.sse-dormant.ts`), `sendMessageStreaming.ts` (185 misnamed). Roadmap C9.16 "SSE résidus déjà absent" est FAUX pour FE. **UFR-013 + UFR-016 violation. P0 burial.** | Agents 07 A+B Theme 3 + 02 Wave B | 1-2h delete |
| ❌ **P0.D2** | **Stryker incremental cache committed 18MB** — `museum-backend/reports/stryker-incremental.json` force-tracked malgré `.gitignore`. `git rm --cached` + bump root .gitignore. | Agent 02 Wave A Theme 7 | 15 min |
| ❌ **P0.D3** | **Llama-Prompt-Guard adapter 521 LOC + tests dormant** — fully implemented `llama-prompt-guard.adapter.ts:42-183` mais NOT imported `chat-module.ts`. Décision UFR-016 : (a) Wire avec sidecar Docker (WebSearch Wave 2 §3 fournit le pattern FastAPI CPU ~800MB) **OR** (b) Delete adapter + tests + docker-compose stub. | Agents 02 A+B Theme 1 | 1h delete OR 2-3d wire+sidecar |
| ❌ **P0.D4** | **3 unconditionally `describe.skip` tests** — `art-keyword-repo-atomic-upsert`, `AddCriticalChatIndexesP0`, `AddP1FKAndTokenIndexes` + `streaming.e2e.test.ts` (refs deleted file). 238 LOC. Delete ou re-enable. | Agent 02 Wave A | 30 min |
| ❌ **P0.D5** | **Doc UFR-013 fixes** — TD-LF-02 (Langfuse activation), TD-17/18/19/20/28/30/RN-01/RN-03/47/52 stealth-closed (code fixed, doc says open). 7-19 items (Wave A 19, Wave B 7 — chevauchement). Rotate vers `TECH_DEBT_ARCHIVE.md`. + ADR-036 §50 update v1→v2 KEY_VERSION. + `AI_DISCLOSURE_AUDIT.md` ref obsolète `AiDisclosureModal.tsx` → `AiDisclosureSheetContent.tsx`. + TD-41 renumbered TD-56. | Agents 01 A+B Theme 7 | 1h |

### P0.E — Exit criteria honest V1 launch (verified)

1. ✅ P0.A1-A9 dev fixes mergés + tests verts (BE tsc + tests + ESLint + OpenAPI validate)
2. ✅ P0.B1-B19 GDPR fixes + Tim ops complétés (DPA PDFs archivés, security@ smoke OK, PGP réelle, S3 PAB confirmed)
3. ✅ P0.C1 SigLIP model provisionné + /chat/compare retourne contenu réel
4. ✅ P0.C2-C4 catalog seed exec ≥3 musées prod (Bordeaux OR Paris décision Tim)
5. ✅ P0.C5 telemetry funnel émis + dashboard
6. ✅ P0.C6 .env corrections prod validées
7. ✅ P0.C7-C9 multi-tenant scope ou descope decisions
8. ✅ P0.D1-D5 dead code + honesty fixes (~3000 LOC removed)
9. ✅ Smoke prod local Docker ≥48h : auth + chat + photo + DSAR + geofence + Maestro audio-recording flow réparé
10. ✅ Tim sign-off device TTS test iPhone réel (C7.5)

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
- ❌ "C9.16 SSE résidus absent" → FALSE pour FE (~1000 LOC residuals, Agents 07 A+B + 02 Wave B)
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
| ❌ **I-SEC1** | ◇◇ | **Redis prod sans `maxmemory`/eviction → `noeviction`** : à l'OOM les writes sont rejetés ; le cost-counter `INCRBYFLOAT` échoue → fail-CLOSED → **tout le chat bloqué**. Un event mémoire cache = panne chat+auth. Instance unique partagée. Fix : pin `maxmemory` + policy + isoler les compteurs (ADR). | `deploy/docker-compose.prod.yml:358-379` (grep confirmé : `--appendonly` présent, zéro `maxmemory`) |
| ❌ **I-SEC2** | ◇◇ | **Cost estimation en byte-length, pas tokens** : `Math.ceil(payloadBytes/4)` ; pour une image inline le base64 est sérialisé → ~350k-1M "tokens" enregistrés vs ~1100 réels. La télémétrie coût est fausse → aggrave P0.A6 (le breaker, même wiré, lirait des chiffres faux). | `llm-cost-pricing.ts:65` (grep confirmé) |
| ❌ **I-SEC3** | ◇ | **`POST /chat/art-keywords` upsert 100 keywords du guardrail AI-safety V1 — `isAuthenticated` seul, no role, no rate-limit, no museum-scope.** Tout visiteur (ou clé `msk_` qui défaut `role:visitor`) peut polluer/évader le guardrail cross-tenant. Gate `requireRole('admin','moderator')` + limiter. | `chat-message.route.ts:184` |
| ✅ **I-SEC4** | · | **`POST /auth/api-keys` : tout user authentifié (free visitor inclus) forge une clé API B2B `msk_`** — no role/tier check. | `auth-api-keys.route.ts:20-42` |
| ❌ **I-SEC5** | ◇◇ | **`EXPORT_PSEUDONYM_SALT` fallback littéral committé `'musaium-admin-export-v1'` même prod, no gate** → SHA-256 des userId (petits entiers) avec sel public = **pseudonymisation GDPR réversible** dans les exports CSV admin. | `admin-export.repository.pg.ts:21` + `exportChatSessions.useCase.ts:26` (grep confirmé, `env.production-validation.ts` n'a aucun gate) |
| ✅ **I-SEC6** | ◇◇ | **Login sliding-window Redis key = email plaintext** `login-attempts:<raw-email>` (le lockout key, lui, est SHA-1). Le commentaire "raw emails never appear in Redis" ne vaut que pour le lockout. PII en keyspace/AOF 10min. | `login-rate-limiter.ts:96` (grep confirmé) vs `:99-101` |
| ❌ **I-SEC7** | ◇ | **TOTP code rejouable ~90s** (`window:1`, `markUsed` jamais relu) + **access token non-révocable** (logout/password-change/suspend ne tuent que le refresh ; JWT valide jusqu'à 15min). RFC 6238 §5.2. | `totpService.ts:37-55` + `token-jwt.service.ts:68-94` |
| ❌ **I-SEC8** | ◇ | **KE knowledge base sans `museum_id` → cross-tenant bleed** : `findById(currentArtworkId)` (UUID client) injecte le `[CURRENT ARTWORK]`/`[LOCAL KNOWLEDGE]` d'un autre musée dans le system prompt. Thème récurrent (= reviews/tickets aussi, cf P0.C7). | `artwork-knowledge.entity.ts:14-67` + `prepare-message.pipeline.ts:308` |
| ❌ **I-SEC9** | ◇ | **KE : message chat brut de l'utilisateur persisté dans Redis** (`ExtractionJobPayload.searchTerm`), **jamais consommé** (worker l'ignore `_searchTerm`), rétention 500 jobs. PII dead-data qui ne fait que fuiter. Fix : drop le champ. | `prepare-message.pipeline.ts:163,168` → `extraction.worker.ts:118` |
| ❌ **I-SEC10** | · | **KE scraper OOM/DoS** : `response.text()` sans guard `Content-Length`, `maxContentBytes` = `.slice()` post-download → body multi-GB OOM le worker. URLs influençables (web-search sur input visiteur). | `html-scraper.ts:299,334` |
| ❌ **I-SEC11** | ↓ | **SSRF citation URL HEAD probe — DÉGRADÉ : latent, pas live V1.** `urlHeadProbe?` optionnel, `undefined` au V1 (`message-commit.ts:28`, "V1.1 rollout"), gardé `if(...&&urlHeadProbe)`, `new UrlHeadProbe`=0 hit. **Wave A l'avait sur-évalué comme live.** → pré-condition V1.1 : valider host/IP avant d'activer. | grep confirmé |
| ❌ **I-SEC12** | ◇ | **Deps : `ws@8.18.1` (GHSA-58qx-3vcg-4xpx) + `brace-expansion@5.0.5` moderate**, 0 HIGH/CRITICAL. Fix override 1 ligne, pas de breaking. **CVE-2025-29927 (Next.js) NON vulnérable** (15.5.18). **Aucun secret git-tracké.** | `pnpm/npm audit --prod` exécuté A+B |

### P0.I.B — Stabilité / KR3 (crash-free + p99)

| ID | Conf | Item | Preuve |
|---|---|---|---|
| ✅ **I-OPS1** | ◇ | **KR3 crash-free non-mesurable mobile** : `ci-cd-mobile.yml` zéro Sentry ; `Sentry.init` RN sans `release`/`dist` → la métrique KR3 phare n'a pas d'attribution build fiable. | `sentry-init.ts:33-48` + grep mobile workflow |
| ❌ **I-OPS2** | ◇ | **Aucune alerte API 5xx / `up{backend}==0` / DB-down / Redis-down.** Un backend qui 500 ou crash-loop ne page personne (seul node-exporter a `up==0`). Alert-routing = un Telegram, pas de severity split (doc dit PagerDuty). | `infra/grafana/alerting/*.yml` (grep) |
| ❌ **I-OPS3** | ◇◇ | **Migrations exécutées 2× par deploy** : CI `migration:run` + boot-time `CMD ["sh","-c","node ...run-migrations.js && node ...index.js"]` → un échec migration au boot crash-loop sous `restart:unless-stopped` au lieu d'un rollback propre. (Wave B avait raté le CMD ; mon grep tranche.) | `deploy/Dockerfile.prod:101` (grep confirmé) |
| ❌ **I-OPS4** | ◇ | **KR3 p99<5s tenu seulement sur cache-hit.** LLM timeout 10s×2 retries (budget total 25s > `REQUEST_TIMEOUT_MS=20s`, incohérent) + 2 sidecars guardrail V2 **en série** (input 1500+500ms, output 1500ms) autour du call LLM. | `env.ts:164-166` + `guardrail-evaluation.service.ts:118,154` |
| ❌ **I-OPS5** | ◇ | **Volume `uploads`/media non-backupé** (DB backup off-site GPG + restore drill = OK, voir correction F3). + backups dans **le même bucket que les médias** (shared-fate SPOF). + perte clé GPG = DR silencieusement morte. | `DB_BACKUP_RESTORE.md:46-47,61` |
| ❌ **I-OPS6** | ◇ | **pgvector ≥0.7.0 jamais gaté en code** : `CREATE EXTENSION vector` + `halfvec(768)` sans version check → fail/revert silencieux sur 0.6.x (contredit gotcha ADR-037). | `1778406339944-AddArtworkEmbeddings.ts:39,53` |
| ❌ **I-OPS7** | ◇ | **Indices manquants** : chat-purge cron full seq-scan (`purgedAt`/`updatedAt` non-indexés sur la + grosse table) ; `api_keys.user_id` CASCADE FK non-indexé ; `listSessions` sans composite `(userId, updatedAt DESC)`. P1 scale. | migrations + `chat.repository.typeorm.ts:265` |
| ❌ **I-OPS8** | ◇ | **CI gates partiellement théâtre** : `ai-tests` documenté required mais `if:workflow_dispatch` (never PR) ; **`sentinel-mirror` absent de la liste required-check** (→ anti-bypass UFR-020 = théâtre si pas configuré GitHub Settings) ; web/mobile `paths-filter` "pending forever" ; Expo Doctor `continue-on-error` ; pas de CI gate anti-drift migration. | `.github/workflows/*` |

### P0.I.C — Compliance / a11y / GDPR

| ID | Conf | Item | Preuve |
|---|---|---|---|
| ❌ **I-CMP1** | ◇◇ | **AI Act Art.50 disclosure footer échoue contraste AA** : `opacity:0.7` sur `textSecondary` → 3.55-4.09:1 (< 4.5). Notice légalement obligatoire. Fix 1 ligne (retirer l'opacity → 8.34:1). Le badge lui-même passe AA (le "~8:1" documenté était faux, réel 4.92-6.84:1). | `AiDisclosureFooter.tsx:33-37` |
| ❌ **I-CMP2** | ◇◇ | **10 clés GDPR consent (cookie-banner Accept-all/Manage) manquantes en 6 locales** (de/es/it/ja/zh/ar) → consentement rendu en anglais. Le gate `check-i18n-completeness.js` (ci-cd-mobile) **échoue déjà** sur le commit local — bloquera la CI avant prod. Le test Jest ne couvre que fr↔en (redondance à élargir). | `shared/locales/*/translation.json` (diff committé) |
| ❌ **I-CMP3** | ◇◇ | **Audio-description a11y : 5-7 violations** (consensus A+B + round-1) — `Speech.stop()` zéro caller (1.4.2/2.2.2), double-playback race 2 moteurs TTS, Switch sans accessibilityLabel (4.1.2), réponse streamée sans live region (4.1.3), bubble label masque le texte (1.3.1), FE→BE write absent. La feature vendue "for accessibility" exclut sa cible. | `useChatSession.ts:106-124` + `SettingsAccessibilityCard.tsx:32` + `ChatMessageBubble.tsx:188` |
| ✅ **I-CMP4** | ◇ | **Status/priority badges white-on-amber/green 2.15-2.28:1** (mobile tickets). Web admin OK. | `tokens.semantic.ts:128-137` |
| ❌ **I-CMP5** | ◇ | **Web : skip-link absent (2.4.1, axe ne catch pas) + statement a11y pointe `musaium.app`/`support@musaium.app` alors que le code = `musaium.com`** → contact a11y injoignable = défaut EAA §6. axe-core CI bien wiré (23 specs wcag2aa). | `accessibility-statement-*.md:31` |
| ❌ **I-CMP6** | ◇ | **SBOM généré mais jamais attesté/signé** (CycloneDX en artifact 90j, pas `cosign attest`) ; web+mobile zéro SBOM. Image cosign+SLSA-L3 OK. Gap CRA Art.13 (deadline 2027-12-11). | `ci-cd-backend.yml:99-110` |

### P0.I.D — Correctness / coût (non-sécurité mais réels)

| ID | Conf | Item | Preuve |
|---|---|---|---|
| ❌ **I-FIX1** | ◇◇ | **Aucune invalidation cache LLM ne marche** : `invalidateMuseum` = dead code (0 caller) **ET** le bouton admin cache-purge purge le **mauvais namespace** (`chat:llm:` = TTS, pas `llm:v2:` = LLM). Édits musée servis stale jusqu'à 24h. | `llm-cache.service.ts:77` + `cache-purge.route.ts:25` |
| ❌ **I-FIX2** | ◇◇ | **Cross-artwork mis-serve** : `[CURRENT ARTWORK]` title est dans le system prompt mais **PAS dans la cache key** → 2 visiteurs même prompt devant des œuvres différentes partagent une clé → réponse de l'œuvre A servie pour B. Bug de correctness, pas juste coût. | `llm-prompt-builder.ts:71` vs `chat-message.service.ts:373-401` |
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
- [ ] **C10 race condition `useChatSession.ts:106-124` expo-speech + `useAutoTts.ts:44-59` server TTS** — ajouter `Speech.stop()` + unified path (Theme 3 Agent 04 B)
- [ ] **C10 a11y SettingsAccessibilityCard.tsx:32-36 `<Switch>` no accessibilityLabel/Hint/Role/State** — WCAG 4.1.2 + EN 301 549 §9.4.1.2 violation. 30 min fix.
- [ ] **C10 5 WCAG/EN 301 549 violations audio description path** — 2.2.2 (no user-controlled stop), 3.3.2 (no AT props), 4.1.2 (accessibility label), 1.4.2-AA (no pause control), EN 9.4.1.2 (accessibility name). Theme 3 Agent 04 Wave B critical.
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
- [ ] **`AUDIT_AUTH_LOGIN_FAILED` raw email metadata** — Wave B Agent 04 Theme 4. Hash le email post-13mo, ou strip from metadata.
- [ ] **EXPORT_PSEUDONYM_SALT mandatory in prod** — currently optional with hardcoded fallback. `deployment-invariants.ts` fail-fast.
- [ ] **Admin `DeleteUserUseCase` upgrade to hard-delete** — currently soft-delete only, Art.17 admin path incomplete.
- [ ] **`AUDIT_ACCOUNT_DELETED` log AFTER cleanup** — currently emits BEFORE → lies if cleanup throws.
- [ ] **`promtail-config.yml` add PII redaction stages** — currently zero. Defense-in-depth.
- [ ] **`shouldDropBreadcrumb` add `verify-email|magic-link|confirm-email-change` paths + scrubUrl on breadcrumb.data.url** — Agent 10 Wave B.

### C — Cluster items NOW résiduels

- [ ] **C1.1 Dashboard Grafana p50/p95/p99 per-stage STT/LLM/TTS** — partiellement shipped (HTTP request panel). Compléter panels per-stage Langfuse-backed.
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
