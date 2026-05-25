# DOMAINE 3 — LOT 2 : GDPR résiduel & consent — Findings

> Agent fresh-context vérification read-only (2026-05-25). Ref vérifiée : `dev`.
> Aucun code/doc modifié. Toutes les preuves lues via Read/Grep (UFR-013/024).
> **Synthèse** : le LOT 2 GDPR a été LARGEMENT fermé sur `dev` par le commit
> `71f103b35` "feat(p0-gdpr): close 8 V1 GDPR/consent gaps + reclassify I-SEC8 (#294)"
> + CI follow-ups `d6905a09f` (#296), `99148ec6a`. Contrairement à l'hypothèse
> "aucune branche dédiée → a priori OPEN", la majorité est DONE-DEV.

---

- **P0.B6** — Verdict: DONE-DEV
  - Preuve: `museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts:268-269` appelle `runConsentGate` (→ `checkThirdPartyAiConsent`) AVANT `ensureSessionAccess`/persist/enrichment ; `consent-gate.ts:62-80` collecte les scopes requis (`text` + `image` via `resolveActiveProviderForScope`) et refuse (`PrepareRefused`) si ANY scope non accordé ; `third-party-ai-consent-checker.ts:40-52` fail-CLOSED sur userId nullish (anon = refusé sans toucher le repo) ; wiring complet dans `chat-module.ts:695,723,834` (`buildThirdPartyAiConsentChecker` injecté dans ChatService). Donc PAS « seul location_to_llm gated » : text + image third_party_ai désormais enforced au pipeline LLM.
  - Ref vérifiée: dev
  - Action roadmap: recoche ✅. Corriger le texte « 8 scopes non enforced » → text+image gated au pipeline, audio gaté à la route media (cf B7), profile/google scopes couverts par `resolveActiveProviderForScope` (dispatch par scope actif). Note : seuls les scopes du provider ACTIF sont exigés (pas les 8 en aveugle) — sémantiquement correct.
  - Confiance: haute

- **P0.B7** — Verdict: DONE-DEV
  - Preuve: `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:61-71` — le handler audio (`POST /sessions/:id/audio`) résout `resolveActiveProviderForScope('audio')` puis `consentChecker.isGranted(currentUser?.id, audioScope)` et renvoie `res.status(403).json({error:'consent_required', scope})` AVANT l'appel STT (`chatService.postAudioMessage`). Checker injecté ligne 224 (`buildThirdPartyAiConsentChecker()`). Le commentaire (lignes 61-65) note explicitement le respect de l'ordering middleware (check read-only après isAuthenticated/rate-limit/costGuard/multer). Donc le toggle FE est désormais enforced BE.
  - Ref vérifiée: dev
  - Action roadmap: recoche ✅. Claim « zéro check BE » désormais FAUX sur dev.
  - Confiance: haute

- **P0.B10** — Verdict: DONE-DEV (FALSE-CLAIM résiduel sur le drift)
  - Preuve: `museum-frontend/ios/Musaium/Info.plist` ne contient QUE `NSLocationWhenInUseUsageDescription` (ligne 68) — AUCUNE clé `NSLocationAlways*`/`NSLocationAlwaysAndWhenInUse*` (grep exhaustif `NSLocation` = 1 seul hit). `museum-frontend/app.config.ts:161` (infoPlist) + `:342-345` (plugin expo-location `locationWhenInUsePermission`) déclarent when-in-use only. `UIBackgroundModes:['audio']` uniquement (pas `location`). Pas de drift → pas de risque App Store 5.1.1(i). Fix livré dans `71f103b35`.
  - Ref vérifiée: dev
  - Action roadmap: recoche ✅. Le claim « Info.plist garde NSLocationAlways* » est FAUX sur dev (corrigé).
  - Confiance: haute

- **P0.B15** — Verdict: DONE-DEV
  - Preuve: 3 surfaces alignées sur ~17-19 vendors. Web = source de vérité unique `museum-web/src/lib/legal/privacy-content.canonical.json` (`recipients: list 19` en EN ET FR), exposée via `museum-web/src/lib/privacy-content.ts:106-126` (liste docblock : OpenAI, Google Cloud, DeepSeek, OVH SAS, AWS, Expo, Brevo, Sentry, Apple, Tavily, Brave, Unsplash, Langfuse, CARTO, Wikidata, Wikimedia, Nominatim, OpenStreetMap Foundation, Better-Stack = 19) ; route `/subprocessors` existe (`museum-web/src/app/[locale]/subprocessors/page.tsx`) et consomme `getSubprocessors` (`privacy-content.ts:164-167`). HTML public `docs/privacy-policy.html` + FE `museum-frontend/features/legal/privacyPolicyContent.ts` portent les mêmes vendors (les soi-disant « manquants » Tavily/Brave/Unsplash/CARTO/Better-Stack/DeepSeek/Google Cloud présents partout, vérifié par grep). Footer web lie privacy/terms/subprocessors/cookies (`Footer.tsx:44,74,80,86`).
  - Ref vérifiée: dev
  - Action roadmap: recoche ✅. « 14 vendors manquants + créer /subprocessors » = FAUX sur dev (route créée, 19 vendors listés).
  - Confiance: haute (doute mineur : je n'ai pas diffé item-par-item les 19 entre HTML et canonical, mais design canonical-single-source + grep des noms historiquement manquants confirment la couverture)

- **P0.B16** — Verdict: DONE-DEV (FALSE-CLAIM sur âge + drift version)
  - Preuve: Âge = **15 ans** cohérent sur les 3 surfaces, jamais 16 : HTML `docs/privacy-policy.html:518,926,929,1027` (« 15 ans minimum », CNIL Délibération 2021-018) ; canonical json `privacy-content.canonical.json:114-116` (EN) + `:401-403` (FR) ; FE `privacyPolicyContent.ts:325-327`. Version synchronisée **1.0.0 / lastUpdated 2026-05-21** sur les 3 : HTML `:473-475,1029-1030`, canonical json `:2-3`, FE `privacyPolicyContent.ts:195-196`. FE docblock (`:14`) déclare dériver des « canonical tokens (version, lastUpdated, section ids, subprocessor names) » → drift structurellement empêché. (POLICY_VERSION BE = `2026-06-01` dans `policy-version.ts` = version de CONSENT persistée, distincte du n° de doc privacy — pas un drift.)
  - Ref vérifiée: dev
  - Action roadmap: recoche ✅. « HTML 16 vs correct 15 » + « 3-way drift » = FAUX sur dev (âge 15 partout, version synced 2026-05-21).
  - Confiance: haute

- **P0.B18** — Verdict: DONE-DEV
  - Preuve: route `/terms` présente `museum-web/src/app/[locale]/terms/page.tsx` (lit `terms-content.canonical.json`) ; route `/subprocessors` présente (cf B15) ; route `/cookies` présente `museum-web/src/app/[locale]/cookies/page.tsx`. Footer web lie les 4 (`Footer.tsx:44,74,80,86,89`). Test garde-fou `museum-web/src/components/shared/Footer.cookies-terms-subprocessors.test.tsx`. Cookie surface = page `/cookies` dédiée (bannière/contenu cookies). Fix livré `71f103b35`/`d6905a09f`.
  - Ref vérifiée: dev
  - Action roadmap: recoche ✅. « /terms absente + cookie banner web » = FAUX sur dev.
  - Confiance: moyenne (doute : j'ai confirmé l'EXISTENCE de la page `/cookies` et son lien Footer, mais pas inspecté si c'est une vraie bannière interactive de consentement cookies vs page statique de description — le claim « cookie banner » au sens consent-tool n'est pas tranché ; la page existe et le lien existe)

- **I-SEC8** — Verdict: OPEN
  - Preuve: `museum-backend/src/modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity.ts:14-68` — entité `ArtworkKnowledge` SANS colonne `museum_id` (colonnes : id uuid, title, artist, period, technique, description, historicalContext, dimensions, currentLocation, sourceUrls, confidence, needsReview, locale, `room_id`, timestamps ; unique index sur `[title,artist,locale]`). `findById` du repo (`typeorm-artwork-knowledge.repo.ts:19-20`) = `findOne({ where:{ id } })` par UUID seul, AUCUN scope musée. Appelé dans `prepare-message.pipeline.ts:357` (`resolveCurrentArtwork`) via `session.currentArtworkId` sans filtre tenant. Le knowledge d'un musée peut donc être injecté dans le system prompt d'une session d'un autre musée si l'UUID est connu. NB : la table est globale par design (KB partagée title/artist/locale), donc « cross-tenant » suppose un currentArtworkId pointant un row d'un autre tenant — gap réel mais à pondérer (pas de FK museum sur cette KB).
  - Ref vérifiée: dev
  - Action roadmap: reste P0/⚠️. Note doc : la roadmap doit refléter que la table est intentionnellement globale (pas de museum_id) ; le « fix » = soit scoper `findById` par musée (nécessite ajouter museum_id + migration), soit documenter que currentArtworkId est déjà tenant-trusté en amont. Décision produit requise. (NB : `#294` annonce « reclassify I-SEC8 » — l'item a été re-scopé mais le code reste sans museum_id.)
  - Confiance: haute (sur l'absence de museum_id + findById non scopé) / moyenne (sur la sévérité réelle : dépend de comment currentArtworkId est set en amont)

- **I-SEC9** — Verdict: FALSE-CLAIM (corrigé sur dev)
  - Preuve: `museum-backend/src/modules/knowledge-extraction/domain/ports/extraction-queue.port.ts:8-11` — `ExtractionJobPayload` = `{ url: string; locale: string }` UNIQUEMENT, plus de `searchTerm`. Docblock `:2-7` cite explicitement « I-SEC9 (R9/GDPR Art.5(1)(c)) — searchTerm (raw user chat text) removed in RUN_ID=2026-05-21-p0-gdpr ». Côté enqueue : `prepare-message.pipeline.ts:180-185` (`enqueueForExtraction`) n'enfile que `{ url, locale }` (`.map((r)=>({url:r.url, locale}))`) avec commentaire I-SEC9. Côté consumer : `extraction.worker.ts:63-66` destructure `{ url, locale }` tolérant (ignore tout legacy `searchTerm` en vol pendant la fenêtre de deploy). Donc le champ PII mort n'existe plus.
  - Ref vérifiée: dev
  - Action roadmap: recoche ✅. Le claim « searchTerm enqueue jamais consommé » = FAUX sur dev (champ retiré du payload, enqueue, et worker).
  - Confiance: haute

- **I-CMP2** — Verdict: FALSE-CLAIM (corrigé sur dev)
  - Preuve: comparaison programmatique des 52 clés `consent.*` + `settings.ai_consent*` (dont les 12 `settings.ai_consent_scope.third_party_ai_*` + `location_to_llm`, et le bloc bannière `consent.title/body/scope_*/accept_all/manage_*/...`) entre EN et de/es/it/ja/zh/ar/fr → **0 clé manquante dans CHAQUE locale** (52/52 présentes partout). Spot-check confirme de vraies traductions (de `consent.title`="KI-generierte Antworten", ja="AI生成の回答", ar="ردود مولّدة بالذكاء الاصطناعي"), pas des fallbacks anglais. Les 8 dossiers locales existent (`shared/locales/{ar,de,en,es,fr,it,ja,zh}/translation.json`). Le gate CI `check:i18n` qui « bloquerait déjà » est cohérent avec une couverture complète. Fix dans `71f103b35`/`99148ec6a`.
  - Ref vérifiée: dev
  - Action roadmap: recoche ✅. « 10 clés consent manquantes en de/es/it/ja/zh/ar » = FAUX sur dev.
  - Confiance: haute

---

## Comptage par verdict (9 items)

| Verdict | Items | N |
|---|---|---|
| DONE-DEV | B6, B7, B10, B15, B16, B18 | 6 |
| FALSE-CLAIM | I-SEC9, I-CMP2 | 2 |
| OPEN | I-SEC8 | 1 |

(B10/B16 sont DONE-DEV mais leurs sous-claims de drift/âge sont aussi des FALSE-CLAIM ; classés DONE-DEV par primauté du verdict « fix présent ».)

## Notes cross-domaine / pièges
- B6/B7 partagent l'infra `ThirdPartyAiConsentChecker` (`third-party-ai-consent-checker.ts`) + `provider-resolver` (scope du provider ACTIF) — généralise location-consent à text/image/audio/profile × openai/google.
- I-SEC8 : `#294` dit « reclassify I-SEC8 » — l'item a été re-scopé doc-side mais le CODE reste sans `museum_id`. Ne pas marquer ✅ sur la foi du titre de commit (UFR-024).
- Tout le LOT 2 vit sur `dev` (commit `71f103b35` #294 + CI #296/`99148ec6a`/`d6905a09f`) — l'hypothèse tasklist « aucune branche → OPEN » est infirmée pour 8/9 items.
