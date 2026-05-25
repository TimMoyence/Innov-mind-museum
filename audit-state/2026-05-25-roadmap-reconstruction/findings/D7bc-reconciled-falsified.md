# DOMAINE 7bc — Items réconciliés ✅ (7b) + claims falsifiés (7c)

> Agent fresh-context read-only. Ref vérifiée : **`dev`** (HEAD `9aff378b0` "refactor(db): confidenceUpsert helper + sweep 2 KE repos (PR-16)"). UFR-013 : chaque verdict = preuve lue (Read/Grep) avec path:line réel. Aucune modif code/doc.

---

## (7b) — 14 items recochés ✅ le 2026-05-21 (étaient ❌) — RE-VÉRIFICATION sur dev

### B1 — deleteAccount.useCase.ts audio cleanup
- **Verdict: DONE-DEV**
- Preuve: `museum-backend/src/modules/auth/useCase/account/deleteAccount.useCase.ts:95-104` — étape 2 `await this.audioCleanup.deleteUserAudio(userId)` (best-effort try/catch), AVANT la cascade DB (étape 4), avec docstring R1-R3. Le fichier a migré `useCase/` → `useCase/account/` (le path:line:97 du tasklist était un point de départ, re-localisé par grep).
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### B2 — brevo-beta-signup.notifier.ts removeContact
- **Verdict: DONE-DEV**
- Preuve: `museum-backend/src/modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier.ts:82-110` — `removeContact(email)` `DELETE /v3/contacts/{email}` ; 404 → `not_found` idempotent (R5) ; api-key jamais loggée. `NoopBetaSignupNotifier.removeContact` aussi présent (l.127). Fichier migré sous `leads/adapters/secondary/notifier/`.
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### B3 — exportUserData.useCase.ts userMemory/auditLogs/...
- **Verdict: DONE-DEV**
- Preuve: `museum-backend/src/modules/auth/useCase/account/exportUserData.useCase.ts:82-138` — `Promise.all` inclut `userMemoryExport`, `auditLogExport`, `messageFeedbackExport`, `messageReportExport`, `socialAccountExport`, `apiKeyExport` ; mappers per-field allow-list (mapAuditLog EXCLUDES prevHash/rowHash, mapApiKey EXCLUDES hash/salt) ; `schemaVersion:'2'`. Fichier migré sous `useCase/account/`.
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### B4 — image-storage.s3.ts deleteByPrefix + index legacyFetcher
- **Verdict: DONE-DEV**
- Preuve: `museum-backend/src/modules/chat/adapters/secondary/storage/image-storage.s3.ts:116-149` — `deleteByPrefix(userId, legacyFetcher?)` : scan préfixe `user-<id>/` + delete des `legacyFetcher` keys DB-sourcées. Wiring : `museum-backend/src/modules/auth/useCase/index.ts:154-206` — `legacyImageRefLookupProxy.findLegacyImageRefsByUserId` → `getChatRepository()`, injecté dans `new DeleteAccountUseCase(..., legacyImageRefLookupProxy, ...)`. (path:line `index.ts:128` du tasklist = point de départ, wiring réel dans `auth/useCase/index.ts`.)
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### B5 — runS3OrphanPurge wiré index.ts cron
- **Verdict: DONE-DEV**
- Preuve: `museum-backend/src/index.ts:481` — `const s3OrphanPurgeCron = await startRedisCron(registerS3OrphanPurgeCron, env.s3OrphanPurgeRetentionDays, 's3_orphan_purge_cron_boot_skipped')`. `startRedisCron` (l.380-396) APPELLE bien le registrar (pas juste import). Le registrar `museum-backend/src/modules/chat/jobs/s3-orphan-purge-cron.registrar.ts:166` `registerS3OrphanPurgeCron` → BullMQ `upsertJobScheduler` (cron 04:30 UTC, l.21) → `runS3OrphanPurge` (job l.7). (path:line `index.ts:467` = point de départ, invocation réelle à :481.)
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### B8 — useAiConsent.ts clé namespacée + AuthContext clear
- **Verdict: DONE-DEV**
- Preuve: clé namespacée `museum-frontend/features/chat/infrastructure/consentStorageService.ts:37` — `return \`musaium.consent.aiAccepted.${userId ?? ANON_NAMESPACE}\`` (convention TD-AS-01). Clear logout : `museum-frontend/.../auth/.../AuthContext.tsx:120` `clearConsentAcceptedFlag()` dans `clearPerUserFeatureStorage()`, appelé AVANT `clearPersistedTokens()` (l.268-272, l.297-303) pour que le token soit encore lisible quand la clé per-userId est dérivée. (path:line `useAiConsent.ts:26` = re-export ; logique réelle dans consentStorageService.)
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### B9 — thirdPartyAiConsent.ts scope location_to_llm
- **Verdict: DONE-DEV**
- Preuve: `museum-frontend/features/chat/domain/consentScopes.ts:38` — `'location_to_llm'` présent dans `THIRD_PARTY_AI_SCOPES`, docstring (l.12-19) le distingue comme scope coarse-location (exception parmi les per-vendor grants). (Le fichier référencé `thirdPartyAiConsent.ts` a été consolidé dans `consentScopes.ts`.)
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### B11 — image-processing.service.ts fallthrough observable / boot assert
- **Verdict: DONE-DEV** (moyenne sur la partie "boot assert")
- Preuve: fallthrough observable `museum-backend/src/modules/chat/useCase/image/image-processing.service.ts:152-165` — `stripExif` : si pas de `imageProcessor`, retourne l'input untouched, docstring "intentionally observable so wiring regressions surface in CI". Wiring boot : `museum-backend/src/modules/chat/chat-module.ts:207` + `:801` `imageProcessor: new SharpImageProcessor()` (instancié inconditionnellement en prod).
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: moyenne — la partie "fallthrough observable" + wiring prod est claire ; le terme "boot assert" du tasklist est plus fort que la réalité (pas de `throw` hard si processor manquant en prod ; la garantie repose sur l'instanciation inconditionnelle à chat-module.ts:207/801, pas sur une assertion). Substantiellement satisfait.

### I-SEC4 — auth-api-keys.route.ts requireRole
- **Verdict: DONE-DEV**
- Preuve: `museum-backend/src/modules/auth/adapters/.../routes/auth-api-keys.route.ts:24-29` — POST `/api-keys` chaîne `isAuthenticatedJwtOnly` + `requireRole(UserRole.MUSEUM_MANAGER, UserRole.ADMIN)` (super_admin implicite, centralisé dans requireRole).
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### I-SEC6 — login-rate-limiter.ts hash email
- **Verdict: DONE-DEV**
- Preuve: `museum-backend/src/.../login-rate-limiter.ts:100-106` — `hashEmailForKey = createHash('sha1').update(email).digest('hex')` ; `slidingRedisKey`/`lockoutRedisKey` utilisent le hash → raw email jamais dans le keyspace Redis. eslint-disable justifié (SHA-1 = key identifier, pas password storage).
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### I-OPS1 — sentry-init.ts release/dist
- **Verdict: FALSE-CLAIM** (recochage ✅ = réfutation honnête, PAS un fix code)
- Preuve: `museum-frontend/shared/observability/sentry-init.ts:35-47` — `Sentry.init({ dsn, enabled, environment, tracesSampleRate, tracePropagationTargets, integrations, sendDefaultPii:false, beforeSend, beforeBreadcrumb })`. **Il N'Y A PAS de champ `release` ni `dist` explicite.** Le recochage (ROADMAP_PRODUCT.md:68 "I-OPS1 sentry-init.ts:33 conforme — doc pessimiste, RN mappe release/dist auto") s'appuie sur le fait que `@sentry/react-native` (`^8.9.1`) auto-dérive release/dist depuis les métadonnées de build natif, et le plugin `@sentry/react-native/expo` est configuré (`app.config.ts:355`). À distinguer du BE `museum-backend/src/shared/observability/sentry.ts:53,76` qui, lui, set `release: env.sentry.release` explicitement.
- Ref vérifiée: dev
- Action roadmap: garde ✅ mais le texte roadmap DOIT rester celui de la réfutation ("doc pessimiste, RN auto-mappe"), NE PAS le présenter comme "on a ajouté release/dist". Le recochage 2026-05-21 est **honnête** (claim original ❌ était faux). Pas de régression live.
- Confiance: moyenne — l'auto-mapping RN n'est pas vérifiable par lecture statique du repo (comportement runtime SDK + build natif) ; je confirme l'absence d'un `release`/`dist` littéral et la présence du plugin expo, mais l'attribution build effective dépend du runtime.

### I-CMP4 — tokens.semantic.ts badges web OK
- **Verdict: FALSE-CLAIM / DONE-DEV partiel** (recochage = refinement honnête)
- Preuve: `museum-frontend/shared/ui/tokens.semantic.ts:128-137` — `statusBadge: { textColor:'#FFFFFF', open:'#3B82F6', inProgress:'#F59E0B', resolved:'#22C55E', closed:'#6B7280', priorityLow/Medium/High }`. Tokens web miroir `museum-web/src/tokens.semantic.css` (badge vars). Le recochage (ROADMAP:68 "badges web OK ; contraste mobile non reproductible depuis les tokens — caveat conservé") reconnaît : web OK, caveat contraste mobile préservé.
- Ref vérifiée: dev
- Action roadmap: garde ✅ avec caveat contraste mobile maintenu (ne pas effacer le caveat).
- Confiance: moyenne — je confirme l'existence des tokens badge web ; le contraste mobile effectif n'est pas reproductible par lecture des seuls tokens (caveat légitime).

### P0.A1 — extractEmailDomain.ts + 3 sites (merge 71f103b35)
- **Verdict: DONE-DEV**
- Preuve: helper `museum-backend/src/shared/pii/extractEmailDomain.ts` existe ; callers (≥5, > "3 sites" annoncés) : `forgotPassword.useCase.ts`, `brevo-beta-signup.notifier.ts`, `submitPaywallInterest.useCase.ts`, `auth-password.route.ts`, `login-handler.helpers.ts`. Mergé sur dev via `71f103b35` "feat(p0-gdpr): close 8 V1 GDPR/consent gaps + reclassify I-SEC8 (#294)" (présent dans `git log dev`).
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

### P0.A2 — DOB hard-throw register.useCase.ts + auth.schemas.ts
- **Verdict: DONE-DEV**
- Preuve: `museum-backend/src/modules/auth/useCase/registration/register.useCase.ts:104-120` — `assertDigitalMajority` : `throw badRequest('dateOfBirth is required')` si absent (l.109), `throw badRequest('Invalid dateOfBirth')` si malformé (l.113), `throw new AppError({statusCode:422, code:'MINOR_PARENTAL_CONSENT_REQUIRED'})` si < 15 (l.116-120, `MINIMUM_AGE_FOR_REGISTRATION=15` l.18). Schéma : `auth.schemas.ts:17` `dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` REQUIRED (pas `.optional()`) → 400 si malformé/absent. Mergé via `71f103b35`.
- Ref vérifiée: dev
- Action roadmap: garde ✅
- Confiance: haute

---

## (7c) — 8 claims falsifiés (doivent rester FAUX / non-retentés)

### 7c-1 — Sentinel S1.2 SigLIP homogeneity (n'existe pas)
- **Verdict: FALSE-CLAIM** (claim falsifié confirmé — la chose n'existe toujours pas)
- Preuve: `find` sur `*.mjs` + `grep -l "siglip.*homogen|homogeneity"` sur tout le repo (hors node_modules) → 0 résultat. Aucun sentinel `siglip`/`homogeneity` dans `scripts/sentinels/`, `museum-backend/scripts/sentinels/`, `museum-frontend/scripts/sentinels/`.
- Ref vérifiée: dev
- Action roadmap: confirmer le statut falsifié — ne pas réintroduire un sentinel fictif.
- Confiance: haute

### 7c-2 — C9.16 "SSE résidus absent" (FAUX = résidus FE présents, recoupe D1)
- **Verdict: FALSE-CLAIM** (le claim "absent" est faux : les résidus SSE FE EXISTENT)
- Preuve: présents sur dev — `museum-frontend/features/chat/infrastructure/sseParser.ts`, `museum-frontend/features/chat/infrastructure/chatApi/stream.ts`, `museum-frontend/features/chat/application/sendStrategies/sendMessageStreaming.ts` (+ refs dans `sendStrategy.shared.ts`, `useChatSession.ts`, `sendStrategies/index.ts`). Le claim "SSE résidus absent" est donc FAUX. Recoupe D1 (burial SSE résiduel) — code dormant à enterrer, pas absent.
- Ref vérifiée: dev
- Action roadmap: corriger le claim (résidus présents) ; renvoyer au verdict D1 pour l'action burial.
- Confiance: haute

### 7c-3 — sentinel `museum-frontend-version-sync.mjs` (jamais existé)
- **Verdict: FALSE-CLAIM** (le sentinel nommé ainsi n'existe pas sur dev)
- Preuve: `find museum-frontend-version-sync.mjs` → 0 résultat. NB (anticipé par le tasklist) : `scripts/sentinels/fe-version-sync.mjs` EXISTE sur dev (nom différent). Le sentinel sous le nom exact du claim P0.G/A5 n'a jamais existé ; un sentinel version-sync différemment nommé est présent.
- Ref vérifiée: dev
- Action roadmap: corriger la référence (le sentinel s'appelle `fe-version-sync.mjs`, pas `museum-frontend-version-sync.mjs`). Cross-ref A5 (DOMAINE 1, à vérifier sur p0/security pour le wiring complet).
- Confiance: haute

### 7c-4 — DPO Art.37 V1 (non applicable, pas de code)
- **Verdict: FALSE-CLAIM** (statut falsifié confirmé : non applicable, aucun code DPO)
- Preuve: aucune logique DPO. La privacy policy DÉCLARE explicitement l'inverse du besoin : `museum-backend/src/shared/legal/privacy-content.canonical.json:14` "Pursuant to Article 37 GDPR, the designation of a Data Protection Officer (DPO) is **not required** for our organisation" (+ FR l.301, miroir `museum-web/src/lib/legal/privacy-content.canonical.json:14,301`). Les autres matches "DPO" sont des commentaires ("DPO dashboards" dans consent-audit-mapping.ts) — pas de fonction DPO.
- Ref vérifiée: dev
- Action roadmap: confirmer non applicable V1.
- Confiance: haute

### 7c-5 — C9.13 Reranker (V1 throws RerankerUnavailableError)
- **Verdict: FALSE-CLAIM** (statut falsifié confirmé : V1 = no-op qui throw)
- Preuve: `museum-backend/src/modules/chat/adapters/secondary/rerank/null-reranker.adapter.ts:24` — `throw new RerankerUnavailableError('reranker disabled by configuration')` ; docstring (l.2-3) "Production default RerankerPort implementation (C9.13). Always throws". Sélectionné par défaut prod (`env.rerank.provider='null'`, cf. chat-module.ts:174-175). Le reranker n'est PAS implémenté en V1 — c'est un signal "disabled by config".
- Ref vérifiée: dev
- Action roadmap: confirmer V1 throws (pas de reranker actif).
- Confiance: haute

### 7c-6 — Hexagonal POJO 23 entities (non fait)
- **Verdict: FALSE-CLAIM** (refactor non fait, correctement non retenté)
- Preuve: 24 entities portent toujours les décorateurs TypeORM (`grep -l "@Entity(" ... | wc -l` = 24, hors tests). Échantillon `audit_logs.entity.ts:7,9,12,...` : `@Entity`, `@PrimaryGeneratedColumn`, `@Column` — couplage TypeORM intact, aucune conversion POJO. La promesse "23 entities POJO hexagonales" est une fiction non implémentée.
- Ref vérifiée: dev
- Action roadmap: confirmer non fait (infaisable / non prioritaire V1).
- Confiance: haute

### 7c-7 — Chat éclatement 4 sous-modules / 44→22 (non fait, composition root intact)
- **Verdict: FALSE-CLAIM** (éclatement non fait)
- Preuve: `museum-backend/src/modules/chat/` = un seul module composition-root : `chat-module.ts` (941 lignes), `adapters/`, `domain/`, `useCase/`, `jobs/`, `index.ts`. Aucun sous-module chat créé (`find modules -maxdepth 1 -type d | grep chat` → seul `modules/chat`). Le "4 sous-modules / 44→22 deps en 6j" est une fiction.
- Ref vérifiée: dev
- Action roadmap: confirmer non fait (composition root intact).
- Confiance: haute

### 7c-8 — "5 alerts manquantes" llm-cost.yml (en fait 5 alerts SHIPPÉES)
- **Verdict: FALSE-CLAIM** (le claim "manquantes" est faux : 5 alerts shippées)
- Preuve: `infra/grafana/alerting/llm-cost.yml` existe et contient exactement **5 alerts** (`grep -c "^\s*- alert:"` = 5) : `cache_hit_rate_too_low` (l.28), `cache_hit_rate_critical` (l.64), `llm_cost_breaker_open` (l.96), `llm_guard_breaker_open` (l.130), `guardrail_budget_redis_fail_closed` (l.166). Le claim "5 alerts manquantes" est donc FAUX — elles sont présentes.
- Ref vérifiée: dev
- Action roadmap: corriger le claim (5 alerts présentes, pas manquantes).
- Confiance: haute

---

## Synthèse comptage

- **(7b) 14 réconciliés ✅** : **12 CONFIRMÉS faits** (DONE-DEV : B1, B2, B3, B4, B5, B8, B9, B11, I-SEC4, I-SEC6, P0.A1, P0.A2). **2 recochages = réfutations honnêtes**, PAS des fixes code (I-OPS1 release/dist → FALSE-CLAIM "doc pessimiste, RN auto-mappe" ; I-CMP4 → FALSE-CLAIM/refinement "badges web OK, caveat contraste mobile conservé"). Aucun faux-recochage trompeur détecté : les 2 cas sont étiquetés correctement dans la roadmap comme réfutations, pas comme implémentations.
- **(7c) 8 falsifiés** : **8/8 restent bien FAUX/non-retentés** (tous FALSE-CLAIM confirmés). 7c-2 et 7c-8 sont des claims "absent/manquant" qui sont eux-mêmes faux (les choses EXISTENT) → recoupent D1 (SSE) et corrigent le wording alerts. 7c-3 : nom de sentinel fictif, mais `fe-version-sync.mjs` existe (à cross-ref A5).
