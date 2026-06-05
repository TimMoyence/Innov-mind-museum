# Parcours guidé launch V1 — 2026-05-27

> Source : lecture **code** uniquement depuis `0711f0493` (dimanche matin) → `dev`. ~240 commits.
> **Re-vérifié 2026-05-28 (HEAD `0e3808a5`)** : BE build PASS · BE tests **6861** PASS · BE tsc PASS · as-any=0 · **FE lint+test PASS (340 suites / 3534 tests)** · **web lint+build+test PASS (77 fichiers / 683 tests)**. Les 3 apps vertes.
> Doctrine : pas de staging, prod = stage, bake ≥48h, smoke local Docker (cf. `project_no_staging_v1`).

---

## 0. État terrain (vérité, vérifiée ce jour)

| Gate | État | Preuve |
|---|---|---|
| `dev` vs `origin/main` | dev **+66** commits, main 0 unique | `git rev-list --left-right origin/main...dev` = `0  66` |
| Backend `pnpm build` | ✅ PASS (exit 0) | run ce jour |
| Web `pnpm build` | ✅ PASS (exit 0, toutes routes) | run ce jour |
| Backend tests | ✅ 6861 PASS | SessionStart hook 2026-05-28 |
| Backend `tsc` | ✅ PASS | SessionStart hook |
| Frontend lint/tests | ✅ PASS (340 suites / 3534 tests) | relancé 2026-05-28 (gap d'hier comblé) |
| Web lint/build/test | ✅ PASS (77 fichiers / 683 tests) | relancé 2026-05-28 |

**Déploiement = merge `dev` → `main`** (push sur main déclenche `ci-cd-backend.yml` deploy prod). L'ancienne note « ordre LOT 6→4→5 » est **obsolète** : tous les lots sont déjà mergés sur dev.

---

## 1. Résumé de ce qui a été développé depuis dimanche (code)

### Backend (`museum-backend/src`, ~33,6k lignes source)

1. **Module `leads/` (nouveau)** — capture lead B2B/beta/paywall, persistée DB AVANT notif Brevo, cron de redelivery BullMQ (backoff, cap 5), purge 90j (Art.17), dédup email/musée. Endpoints `POST /api/leads/{b2b,beta,paywall-interest}` (rate-limit 5/600s).
2. **Module `telemetry/` (nouveau)** — proxy Plausible côté BE (le mobile ne peut pas importer `next-plausible`). Consent header `X-Musaium-Analytics-Consent: granted` requis (fail-closed), strip PII à la frontière. `POST /api/telemetry/funnel`. → **KR4 funnel**.
3. **Détection musée géoloc (W3)** — `detect-museum.useCase.ts` : geofence PostGIS/JSONB (conf=1.0) puis fallback Haversine 500m. Colonnes `chat_sessions.current_room` + `current_artwork_id` (QR cartel deeplink → contexte LLM).
4. **Coût LLM + circuit breaker global** — `llm-cost-pricing.ts` (forfait vision ~1000 tok/image), `voice-cost-pricing.ts` (STT/TTS), `three-state-circuit.ts` (FSM réutilisé par 3 consumers : latency / cost / guardrail). Cap $/jour wiré (P0.A6 fermé).
5. **Reranker (scaffold V2)** — `RerankerPort` + `bge-reranker-v2-m3` + `null-reranker` (défaut prod = `null`, no-op). Pas de comportement V1.
6. **Consent gate chat (GDPR)** — `consent-gate.ts`, `third-party-ai-consent-checker.ts`, `provider-resolver.ts` : consent third-party-ai {text/image/audio}×{openai/google} vérifié avant persist + enrichment.
7. **STT prompt bias** — `stt-prompt-bias.ts` : noms d'artistes/œuvres injectés comme hint Whisper (~+15-30 % WER FR/EN), filtre PII défensif.
8. **NPS mesurable + multi-tenant** — échelle 0-10 (`getNps.useCase.ts`, `nps-scale-epoch.ts`), `tenant-scope.ts` (museum_manager scopé au claim JWT museumId). → **KR2**.
9. **Auth durci** — denylist access-token Redis (logout/MFA), `assertPasswordReauth.ts`, TOTP `last_used_step` (anti-rejeu RFC 6238), `single-use-email-token.ts`.
10. **Observability** — `trace-propagation.middleware.ts`, `langfuse-langchain.ts`, `strip-free-text.ts` (masque PII Langfuse), `derive-tier.ts`.

**13 migrations DB nouvelles** (voir §6 Parcours B). **Build verifié PASS.**

### Frontend (`museum-frontend`, ~10k lignes source)

- **Magic links** : écrans `verify-email`, `confirm-email-change`, `reset-password` + `+native-intent.tsx` (`mapMagicLinkPath` rewrite `https://musaium.com/[fr|en]/verify-email?token=` et `musaium:///…`). `TokenExchangeFlow.tsx` (4 états).
- **`museums-picker.tsx`** : fallback quand la géo-détection échoue → liste tri distance → `startConversation`.
- **Co-branding musée** : `museum-branding.ts` (parse couleur #RRGGBB + logo HTTPS, contraste WCAG), `useBrandedTheme`, `MuseumLogo`.
- **Chat UI** : composer colonne mic+attach à gauche ; fix bottom-sheet outside-tap dismiss (ADR-066, `pointerEvents box-none`) sur 6 routes.
- **AsyncStorage namespacing** (TD-AS-01) : 10 clés namespacées + migration legacy one-shot.
- **Paywall** : `QuotaUpsellModal` (email + consent explicite + honeypot) → `POST /api/leads/paywall-interest`.
- **Routes dev** (gated `__DEV__`) : `paywall-preview`, `offline-prompt-preview`.
- **Maestro** : flows `magic-link-verify-email`, `magic-link-reset-password`, `museum-picker-flow`.

### Web (`museum-web`, ~11,7k lignes)

- **Admin** : dashboard NPS (`/admin/nps`, recharts), routes musées (`/admin/museums`, `/new`, `/[id]/branding`), nav restreinte museum_manager (4 routes), 2 fuites BOLA fermées (`/admin/stats` + reviews/tickets cross-tenant).
- **Légal** : source de vérité = `privacy-content.canonical.json` (backend) + copie web byte-équivalente (sentinel `privacy-content-drift.mjs`). Terms + subprocessors (19) publics.
- **a11y EAA** : skip-link `<a href="#main">`, AI-Act Art.50 disclosure contraste corrigé, SBOM cosign attest.

---

## 2. Décisions produit & techniques

### Prises (lockées)
- **V1 = monument-photo + suggestions de proximité** (réactif). **V2 (juin-août) = parcours guidé navigué** multi-POI. `features/walk/` n'existe pas → V2.
- **B2C-first.** B2B = hypothèse, **0 musée démarché**. Les 3 musées Bordeaux = démo.
- **Reranker V1 = `null` provider** (scaffold seulement, V2-deferred-honest).
- **Pas de feature flags pré-launch** (UFR-015).
- **DeepSeek bloqué en prod UE** sauf flag conscient `DEEPSEEK_EU_TRANSFER_APPROVED=true` (Schrems II).
- **MFA = web-admin only** (retiré du mobile — `mfa-enroll.tsx` supprimé).

### À continuer / à trancher (post-test)
- **Soft-paywall freemium** (3 sessions/mois) = stub à valider data-driven via Plausible (KR4). Décision pricing = après signal.
- **C3 image-compare promis sur Aquitaine seul** (~133 œuvres licence-libre ; CAPC + Cité du Vin = carto-only). Décider si on communique image-compare au-delà d'Aquitaine.
- **Câbler-ou-enterrer** (UFR-016) les helpers BE sans call-site FE : `C3.5 useCompareImage`, `PATCH /me/preferences` (5 champs + audioDescriptionMode), `reviews.userName` ghost. Pattern récurrent de fausse-complétude.
- **NPS per-musée** : axe `users.museum_id` encore inerte (stats cross-tenant = no-op documenté, P0.C8). OK pour V1 global ; câbler si pitch B2B.

---

## 3. Où en est la roadmap

**P0 launch readiness** (`docs/ROADMAP_PRODUCT.md`) : la quasi-totalité est **mergée sur dev**. Lots 1 (sécurité #293), 2 (GDPR #294), 3 (feature-gates #295), KR (#301), auth (#302), chat-hardening (#305), zéro-défaut (#306) tous sur dev.

### ✅ Items que la roadmap croit ouverts mais que le code de HEAD prouve fermés (roadmap stale)
- **B9 location brute** → fermé (`llm-prompt-builder.ts:204` drop coords si consent refusé).
- **I-SEC8 bleed cross-tenant KB** → fermé (`prepare-message.pipeline.ts:359` findById scopé museumId).
- **B12 PGP placeholder** → fermé (vraie clé Ed25519 dans `.well-known/pgp-key.txt`).
- **I-OPS7 indexes manquants** → fermé (migration `AddOpsStabilityIndexes`).

> **Drift roadmap corrigé 2026-05-28** : `docs/ROADMAP_PRODUCT.md` affirmait encore que le LOT 4 (#300 `34bf280fc`) était « NON DÉMARRÉ / commits orphelins non-ancêtres » et marquait I-SEC8/I-OPS7 `❌`. **Faux** — `git merge-base --is-ancestor 34bf280fc HEAD` ✓. Marqueurs B9/B12/I-SEC8/I-OPS7/P0-FA5 flippés + clauses datées (preuves path:line), sentinel `roadmap-claim-resolves.mjs` = PASS.

### ⚠️ Réellement ouvert (à traiter)
| Item | Type | Bloquant launch ? |
|---|---|---|
| **P0-FA5** images daily-art | contenu | Non — **STALE** : sentinel `artwork-image-liveness.mjs` re-curlé 2026-05-28 = `PASS, 30/30 live (2xx)`. Le « 14/30 cassées » de l'audit ne se reproduit plus. Sentinel DÉJÀ câblé CI (`artwork-image-liveness.yml` : cron lundi 06:00 UTC + PR-paths + dispatch). Seul reste non-bloquant : pas de fallback icône `DailyArtCard.tsx` (hotlinks Wikimedia fragiles). |
| **B13** mailbox `security@musaium.com` | ops | Oui (sinon SECURITY.md ment) |
| **B14** DPA Langfuse signé + row SUBPROCESSORS | ops/légal | Oui si `LANGFUSE_ENABLED=true` prod |
| **B19** S3 Public-Access-Block | ops | **Oui — boot bloqué** sans `S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true` |
| **Anthropic key** `.env:108` non révoquée | sécu | **Oui — secret live exposé** |
| **C4** seed prod (Aquitaine) + no-drift | ops | Oui (sinon catalogue vide) |
| **C7.5** smoke device TTS iPhone | ops | Oui avant TestFlight |
| **P1** cost-breaker dailySpend wipe, TTS non consent-gated, Langfuse vision PII, Accept-Language `fr-FR`, Maestro flows stale | code | Non (hotfix window V1.0.x) |

---

## 4. PARCOURS A — Tester en local

> Objectif : valider les nouvelles features avant push. Ordre conseillé.

### A.1 — Sanity dev (5 min)
```bash
# Backend
cd museum-backend && pnpm install && pnpm lint && pnpm build
# Web
cd ../museum-web && pnpm install && pnpm lint && pnpm build
# Frontend (NON relancé cette session — à faire)
cd ../museum-frontend && npm install && npm run lint && npm test
```

### A.2 — Stack local + DB no-drift (10 min)
```bash
docker compose -f docker-compose.dev.yml up -d        # Postgres :5433 + Adminer :8082
cd museum-backend && pnpm migration:run               # applique les 13 nouvelles migrations
node scripts/migration-cli.cjs generate --name=Check  # DOIT être vide (zéro drift)
pnpm dev                                               # API :3000 (boot BullMQ → Redis requis)
pnpm smoke:api                                         # smoke endpoints
```
⚠️ `pnpm dev` boot BullMQ eager → Redis requis (sinon ECONNREFUSED 6379). Health = `/api/health`.

### A.3 — Backend : nouveaux endpoints (`test.http` ou curl)
- `POST /api/leads/paywall-interest` (+ beta, b2b) → 202 + persist DB (vérifier table `leads` via Adminer).
- `POST /api/telemetry/funnel` avec header `X-Musaium-Analytics-Consent: granted` → 202 ; sans header → rejet.
- `GET /api/admin/nps?museumId=…` (JWT admin) → distribution 0-10.
- Détection musée : `POST /api/museums/detect` avec coords Bordeaux → match Aquitaine/CAPC/Cité du Vin.

### A.4 — Mobile : happy paths (device/emulator)
| Flow | Comment |
|---|---|
| Magic-link verify | deep-link `musaium:///verify-email?token=<fixture>` → auto-submit → success → CTA |
| Reset password | `musaium:///reset-password?token=<fixture>` → new+confirm → submit → success |
| Museum picker | forcer échec géo → picker → tap musée → entre dans chat |
| Soft-paywall | épuiser quota OU `musaium:///(dev)/paywall-preview` → email+consent → submit |
| Composer | chat → mic+attach en colonne gauche ; bottom-sheet → tap backdrop ferme |
| Co-branding | musée avec brand color → thème CTA/header adapté |
| **Chat texte-seul** | envoyer un message texte → **bulle assistant remplie** (régression P0-FA1, à re-tester) |

### A.5 — Maestro (si Android dispo)
```bash
cd museum-frontend && maestro test .maestro/magic-link-verify-email.yaml
# + magic-link-reset-password.yaml, museum-picker-flow.yaml
```
⚠️ `audio-recording-flow.yaml` + `onboarding-flow.yaml` = stale (labels inexistants) — ignorer ou réparer.

---

## 5. PARCOURS B — Mettre en prod

> Ordre **strict** : ops bloquants → .env → seed/no-drift → merge → mobile → bake.

### B.1 — Ops bloquants AVANT tout (toi, dashboards)
- [ ] **🔴 Révoquer la clé Anthropic** `sk-ant-api03-…` (dashboard Anthropic). Dead dans le code, exposée par l'audit. 5 min.
- [ ] **S3 Public-Access-Block** activé sur le bucket prod OVH (voix biométrique + EXIF) → puis `S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true` en env (sinon **le backend refuse de booter**).
- [ ] **Mailbox `security@musaium.com`** : alias OVH → Gmail + smoke RFC 9116.
- [ ] **DPA Langfuse** signé + archivé `docs/legal/dpa-signed/` + row SUBPROCESSORS (si `LANGFUSE_ENABLED=true`).

### B.2 — `.env` prod (autoritatif, vérifié dans `env.production-validation.ts`)

**REQUIS — le boot throw si absent/invalide :**
```
JWT_ACCESS_SECRET            ≥32 ch., distinct de refresh
JWT_REFRESH_SECRET           ≥32 ch.
CSRF_SECRET                  ≥32 ch., distinct de tous les autres
MEDIA_SIGNING_SECRET         distinct de JWT_*
MFA_ENCRYPTION_KEY           ≥32 ch., distinct
MFA_SESSION_TOKEN_SECRET     ≥32 ch., distinct de MFA_ENCRYPTION_KEY + JWT
EXPORT_PSEUDONYM_SALT        ≥32 ch.   (openssl rand -hex 32)
PGDATABASE
CORS_ORIGINS
OPENAI_API_KEY               (si LLM_PROVIDER=openai, défaut)
REDIS_PASSWORD               ≥32 ch., distinct + REDIS_URL ou REDIS_HOST
S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true   ← NOUVEAU gate (+ S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY)
AUTH_EMAIL_SERVICE_KIND=brevo  (PAS 'test') + BREVO_API_KEY
PASSWORD_BREACH_CHECK_ENABLED ≠ false
```
⚠️ Si `OPENAI_USER_DAILY_USD_CAP>0` (défaut 0.5) → Redis DOIT être activé, sinon boot bloqué.

**À AJOUTER (sinon no-op silencieux) :**
```
PLAUSIBLE_DOMAIN + PLAUSIBLE_ENDPOINT_URL   (KR4 funnel BE)
NPS_SCALE_EPOCH                             (défaut 2026-05-27, OK)
```
**FE / EAS (`EXPO_PUBLIC_*`) :**
```
EXPO_PUBLIC_SENTRY_DSN_ANDROID + _IOS       (KR3 crash-free — absents de .env.production.example)
EXPO_PUBLIC_PLAUSIBLE_DOMAIN                (KR4 funnel FE)
EXPO_PUBLIC_API_BASE_URL_PROD
```
**CI / Docker build-arg :**
```
SIGLIP_ONNX_SHA256   (sinon /chat/compare = 503 ; provisionner GCS musaium-models-public ou bake dans l'image)
```
**À RETIRER (dead) :** `ANTHROPIC_API_KEY`, `JWT_SECRET` (ignoré), `TTS_ENABLED`, `GOOGLE_CSE_*`, `SEARXNG_INSTANCES`, `SMTP_BREVO`, `FEATURE_FLAG_WEB_SEARCH`.

### B.3 — Seed prod + no-drift
```bash
# sur la prod (après migration:run au boot Docker)
# seed Aquitaine (ingest-viable) + 3 Bordeaux démo + Pont de Pierre
pnpm migration:run
node scripts/migration-cli.cjs generate --name=Check   # DOIT être vide
```

### B.4 — Merge dev → main → deploy
```bash
git checkout main && git pull
git merge dev          # 66 commits
git push origin main   # déclenche ci-cd-backend.yml : Trivy + Sentry + smoke prod
```
Surveiller : déploiement OVH, `/api/health` 200, **`/chat/compare` retourne du contenu réel** (pas 503 → preuve SigLIP provisionné).

### B.5 — Mobile (après C7.5)
- [ ] Smoke device TTS iPhone réel.
- [ ] `eas build` → store submit (cf. `docs/MOBILE_INTERNAL_TESTING_FLOW.md`).
- [ ] Vérifier Pods committés + patch Podfile post_install (gotcha Xcode Cloud).

### B.6 — Post-deploy (bake ≥48h)
- [ ] Sentry crash-free ≥99.5 % (KR3).
- [ ] Funnel Plausible reçoit `paywall_*` (KR4).
- [ ] Supprimer le compte smoke seedé en prod (P1-FA13).

---

## 6. Migrations DB à appliquer en prod (13)

`AddMuseumGeofence` · `SeedPilotMuseumGeofences` · `AddChatSessionCurrentRoomAndArtwork` · `AddArtworkKnowledgeRoomId` · `AddWikidataQidToMuseums` · `AddTotpLastUsedStep` · `AddMuseumIdToReviews` · `AddMuseumIdToSupportTickets` · `AddCacheKeyToChatMessages` · `AddMuseumIdScopeToArtworkKnowledge` · `AddOpsStabilityIndexes` (CONCURRENT) · `AddSessionIdToReviews` · `CreateLeads`.

⚠️ `pgvector halfvec(768)` exige extension ≥0.7.0 (image `pgvector/pgvector:pg16`). `AddOpsStabilityIndexes` = `CREATE INDEX CONCURRENTLY` (hors transaction).
