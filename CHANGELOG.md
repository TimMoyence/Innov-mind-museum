# Changelog

All notable changes to Musaium are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Per-app changelogs (museum-backend / museum-frontend / museum-web) may also exist for app-scoped
> details. This root file aggregates lot-level / cross-cutting changes that span the monorepo.

---

## [Unreleased]

### Night-run debt closure — TD-46/27/47/48/34/22 + TD-40 deferred (2026-06-05)

Série autonome (fresh-context red→green→review adversarial par dette, zéro bypass hook).

#### Fixed / Security

- **TD-48** (`f6d96c06`) — validation W3C Baggage dans le middleware de trace-propagation BE : un `baggage` malformé (control chars, smuggling de newline, espaces internes, clé vide, >8 KB, >180 membres) est désormais rejeté silencieusement au lieu d'être attaché verbatim à l'attribut de span `musaium.parent.baggage`. Review fresh 2-passes (a chopé un sur-rejet OWS-avant-`;` corrigé) + parseur linéaire (scan code-point, pas de regex ReDoS-flaggée).
- **TD-47** (`75a8db25`) — `museum-web/src/lib/api.ts` `request()` forwarde `sentry-trace`/`baggage` via `Sentry.getTraceData()` sur le happy-path RSC server-rendered (corrélation BE↔FE ; double-injection client bénigne, le SDK préserve un header pré-existant).
- **TD-27** (`f4331705`) — le restore-drill mensuel vérifie l'intégrité de la chaîne de hash `audit_logs` post-restore (SOC2 CC7.3) : vérificateur canonique `pnpm audit-chain:verify` câblé après `pg_restore`, pas un `.cjs` redondant qui dériverait du sérialiseur v1/v2.

#### Changed

- **TD-46** (`440494fd`) — `VDP_RUNBOOK.md` §10 codifie la cadence opérationnelle post-launch Sentry P0 (daily J+1..J+7, weekly Mon, per-release 24 h).
- **TD-34** (`79723d0d`) — 3 flows Maestro stale silencieusement CI-skippés supprimés (paywall/voice supersédés par `.maestro/`, RTL/Arabe = gap e2e documenté) ; `maestro/` (sans dot) clarifié comme outillage screenshot dev/release (pas de couverture CI) via `maestro/README.md` + correction des inventaires de test.
- **TD-22** (`1843ce68`) — verified-moot : re-vérification de la méthodologie ADR-058 → **0 des 14 ports chat n'est inlinable** (chacun multi-impl prod ou test-swap concrètement utilisé depuis 2026-05-17) ; liste d'inline de l'ADR-058 superseded (addendum). Vérifié par un agent adversarial frais.

#### Deferred

- **TD-40** (`5a5435f6`) — `noUncheckedIndexedAccess` BE : scope réel **mesuré 921 sites** (146 src + 771 tests + 4 scripts), pas 35-50 (~18×). All-or-nothing (le `tsconfig.json` compile `tests/`) → impossible d'activer « par sous-lots ». Différé en effort dédié multi-session ; reste **OUVERT** avec scope corrigé.

### Backlog debt sweep — sécurité prompt + cluster geo (2026-06-04)

Lot de dettes backlog traitées en série (triage actionnable + red→green→review fresh sur le code applicatif).

#### Fixed / Security

- **TD-41** (`c03cc428`) — `sanitizePromptInput` defang désormais TOUS les délimiteurs de section du prompt LLM (system instructions / current artwork / visit context / user memory / image analysis / SECTION:<x> / local knowledge / web search / knowledge base), incl. préfixe `END OF`, suffixes em-dash in-bracket, crochets fullwidth et évasion par espaces — en swappant les crochets pour des parens. Exclus à dessein : `[EMAIL]`/`[PHONE]` (sortie du scrubber PII) et l'envelope nonce-gated `[UNTRUSTED EXTERNAL DATA]`. Matcher linéaire ReDoS-safe + test in-code. 3 passes de review adversariale fraîche (les 2 premières ont trouvé des marqueurs manquants → grep exhaustif → 3e APPROVED).
- **TD-43** (`98333b0f`) — `geo_detect_museum_total` ne confond plus une exception (catch → `{outcome=error}`) avec un vrai « no museum nearby » (`{outcome=miss}`).

#### Changed / Tests

- **TD-54** (`98333b0f`) — `_resetGeofenceModeCacheForTests()` câblé dans le `beforeEach` top-level (le singleton de cache geofence ne fuit plus entre tests).
- **TD-42** (`98333b0f`) — documenté que le cache geofence-mode est volontairement boot-permanent (prod migre avant boot ; un TTL coûterait des requêtes `information_schema` sur le hot-path pour un scénario que le modèle de déploiement ne produit pas).
- **TD-36** — déjà résolu (commit `02a0e920`, testIDs `quota-upsell-*` présents) ; confirmé.

### Audit 360 — clôture dette HIGH→LOW (TD-63→70) + reprise post-crash (2026-06-04)

Clôture du lot de dette issu du contrôle qualité 360 pré-launch, via `/team` UFR-022 fresh-context (workflow
`wf_06958ad2-beb`, sérialisé par lot : red → green → review adversariale fraîche → commit). Une panne machine
a interrompu le workflow à l'étape commit du dernier lot ; la reprise a re-vérifié l'état réel contre le dépôt
(rien de perdu — la sérialisation par-lot laisse un état révocable), landé le travail déjà reviewé, et complété
les trous (orphan-sweep TD-69, script seed, TD-68 jamais fait, tests TD-65 orphelins).

#### Fixed

- **TD-66** (`5912b5e`) — le snippet d'audit guardrail scrub la PII (email/phone → `[EMAIL]`/`[PHONE]`) AVANT
  `slice(0,64)` ; le fingerprint sha256 hashe toujours le texte brut (dédup forensique préservé).
- **TD-67** (`11981930`) — `ThreeStateCircuit.releaseProbe()` + flag `hasOutstandingProbe` : plus de lock-out
  permanent si une exception fuit entre `canAttempt` et `recordOutcome`.
- **TD-68** (`f7c7e801`) — le scrubber Sentry (`@musaium/shared`) scrub les query-strings sensibles des URL
  imbriquées sous clé non-sensible dans `extra`/`request.data` (plus seulement `tags`/`request.url`). Hash de
  parité ré-épinglé ; review adversariale fraîche 7/7.
- **TD-65** (`d529450c` + `59790c79`) — `ForgotPasswordUseCase` n'émet plus de token reset à un compte
  soft-deleted ; +3 garde-régression d'identité (changeEmail/register vérifiés déjà sûrs).
- **TD-63** (`776215ec`) — job CI bloquant `guardrail-failclosed` (sans sidecar ni clé) qui gate `deploy-prod`.
- **TD-71** (`fb2d8640`) — `scrubRequest` scrub désormais le champ dédié `request.query_string` (params sensibles),
  avec strip défensif d'un `?` initial. Surfacé puis durci par la review adversariale de TD-68.

#### Removed

- **TD-69** (`16a2932a` + `9bd785ed`) — enterrement du dead-code `TenantRateLimiter` (classe + câblage + bloc
  env + métrique + fixture) et suppression de `scripts/seed-pilot-museums.sh` (vocabulaire « pilot » Louvre/
  Orsay/Pompidou contredisant le North Star « 0 musée démarché ») ; P0.C4 du ROADMAP repointé sur le seed réel.

#### Docs / honnêteté

- **TD-70** (`776215ec`) — `ROADMAP_PRODUCT.md` acte explicitement que Stryker est DÉSARMÉ (kill-rate inconnu).
- **TD-64** — clos **faux positif** : `INSERT…RETURNING` renvoie les rows seules (le tuple `[rows,count]` est
  réservé à UPDATE/DELETE) ; `artKeyword` + résidu leads/support/review étaient déjà corrects.

### Hexagonal boundaries — garde-fou ré-armé (domain) + sentinel indépendant (ARCH-01/ARCH-02 / TD-62 W1) (2026-06-04)

Run `/team` UFR-022 fresh-context (`2026-06-04-hexagonal-boundaries-enforcement`), wave 1. Reviewer APPROVED
(weightedMean 91.9). Cf. [ADR-071](docs/adr/ADR-071-hexagonal-boundaries-resolver-sequenced-arming-independent-sentinel.md).
Aucun changement DB / OpenAPI / runtime (relocations type-only, identity-preserving).

#### Fixed

- **fix(arch): re-arm hexagonal boundaries (domain) + independent purity sentinel, close ARCH-02 (TD-62 W1).**
  Le bloc `eslint-plugin-boundaries` n'avait pas d'`import/resolver` → les alias `@modules/*` résolvaient en
  `external` → la règle ne firait jamais (no-op prouvé ; commentaire affirmant le contraire = faux). W1 câble le
  resolver (`eslint.config.mjs:117-120`), arme l'arm `domain` strict (arms `application`/`infrastructure` commentés
  avec TODO daté W2/W3 — **arming séquencé par vague, pas un ratchet/allow-rule**), ferme la fuite réelle ARCH-02
  (`KnowledgeRouterSource` descendu au domain, `chat-orchestrator.port.ts:7`), descend 5 ports/consts au `domain/`
  (vraie inversion de dépendance), ajoute un **sentinel fs ESLint-indépendant** (`hexagonal-domain-purity.mjs`,
  défense-en-profondeur qui survit à une re-régression de la config) câblé pre-push Gate 32 + CI + mirror, et une
  fixture-garde prouvant que la règle mord. `pnpm lint` (BE) vert à J-3. W2 (DI composition roots → module-root) +
  W3 (untangle chat + arm infrastructure + close complet TD-62) = post-launch.

### Audit chain — collision sur metadata imbriqué fermée (AUDIT-01 / TD-61) (2026-06-04)

Run `/team` UFR-022 fresh-context (`2026-06-04-audit-chain-nested-hash`). Reviewer APPROVED
(weightedMean 92.3). Cf. [ADR-070](docs/adr/ADR-070-audit-chain-canonical-deep-serializer-hash-version.md).
Migration DB : `1780564269011-AddAuditLogHashVersion` (`ADD COLUMN hash_version`, non destructif).

#### Fixed

- **fix(audit): close nested-metadata hash collision in audit chain (AUDIT-01/TD-61) — canonical deep serializer + versioned `hash_version`.**
  `computeRowHash` sérialisait `metadata` via un replacer-allowlist `JSON.stringify(meta, Object.keys(meta).sort())`
  appliqué récursivement mais alimenté des seules clés top-level → tout objet imbriqué (`breach.{…}`,
  `provider.{…}`) sérialisé `{}` → **collision** (deux payloads forensiques différents, même `row_hash`),
  divergence runtime↔migration, et oracles de test buggés (AUDIT-02). Fix : `canonicalStringify` deep-recursif
  (clés triées code-unit à tous les niveaux), **source unique** partagée runtime+migration ; dispatch versionné
  par colonne `hash_version` **hors-payload** (legacy v1 figé → zéro faux BREAK, aucun recompute, valeur
  forensique préservée) ; oracles de test indépendants. Chemin CNIL Art. 33-34 désormais couvert par sa
  propre signature d'intégrité. Aucun impact OpenAPI.

### Quota free-tier mensuel — 402 désormais émis à la limite (2026-06-01)

Run `/team` UFR-022 fresh-context (`2026-06-01-quota-tuple-402`). Reviewer APPROVED 1er pass
(weightedMean 92.0). Security PASS (ferme OWASP API4:2023). Aucun ADR (fix de défaut, contrats
`MonthlyQuotaRepo` + HTTP 402 inchangés). Aucune migration DB.

#### Fixed

- **Backend — le cap mensuel free-tier n'était jamais appliqué (402 jamais émis).**
  `POST /api/chat/sessions` renvoyait **201 au lieu de 402 QUOTA_EXCEEDED** à la limite
  (`FREE_TIER_MONTHLY_SESSION_LIMIT`, défaut 3), et `sessions_month_count` n'était pas incrémenté.
  Cause racine : `PgMonthlyQuotaRepo.tryConsume` lisait le retour de
  `dataSource.query("UPDATE…RETURNING")` comme un tableau de rows plat, alors que TypeORM 0.3.28
  renvoie le **tuple `[rows[], affectedCount]`** — `result.length` valait toujours 2 (garde over-limit
  jamais déclenchée) et `result[0]` (tableau vide à la limite) était traité comme une row truthy.
  Fix : garde `Array.isArray(result[0])` (tuple vs forme plate) ⇒ `rows.length === 0` ⇒ `null` ⇒ 402.
  SQL `UPDATE…WHERE…RETURNING` byte-identique (atomicité préservée). Confirmé live :
  `count=3 → 402`, cycle `0→3 = 201` puis `402`. Dual RED (unit tuple-replay + intégration real-pg)
  ferme le faux-vert du test middleware mocké (UFR-017).

### Museum picker — local `id` exposed + OSM rows selectable (2026-06-01)

Run `/team` UFR-022 fresh-context (`2026-06-01-museum-picker-osm-select`). Reviewer APPROVED 1st pass
(weightedMean 92.85). Décision produit Option B. Cf. [ADR-069](docs/adr/ADR-069-museum-search-id-osm-generic-conversation.md).

#### Fixed

- **Mobile — museum-picker affichait toujours « Aucun musée trouvé ».** Cause racine : la projection
  BE `SearchMuseumEntry` ne portait pas l'`id` DB des entrées `source:'local'`, donc le FE `toPickable`
  filtrait 100 % des lignes ; les entrées `source:'osm'` (POI OpenStreetMap, sans ligne DB) étaient en
  plus structurellement non-sélectionnables. Le picker rend désormais les lignes locales **et** OSM.

#### Added

- **Mobile — sélection d'une ligne OSM démarre une conversation générique.** Ligne `source:'local'` →
  conversation contexte-musée (`museumId`, favoritable) ; ligne `source:'osm'` → conversation générique
  **sans** `museumId` (non favoritable, le nom OSM externe n'atteint pas le prompt LLM). Contrat FE
  `onSelect` élargi en union discriminée `local | osm` (`switch(kind)` exhaustif, caller compris).
- **[ADR-069](docs/adr/ADR-069-museum-search-id-osm-generic-conversation.md)** — `GET /api/museums/search`
  expose `id` (additif) ; modèle de sélection OSM=conversation-générique (alternatives rejetées dont
  OSM-favoritable, réexaminable V2 parcours guidé).

#### Changed

- **API contract (additive, non-breaking) — `GET /api/museums/search`.** Le schéma d'item de recherche
  expose désormais `id` (integer) en **optional**, présent uniquement pour les entrées `source:'local'`
  (= `Museum.id`, déjà public via `/api/museums/directory`), jamais ajouté à `required`. Types FE
  régénérés (`MuseumSearchEntry.id?: number`). Aucune migration DB (changement de projection).

### Lot P0 — a11y AA & supply-chain SBOM attestation (2026-05-25, V1 close-out)

Run `/team` UFR-022 9-phase fresh-context (`2026-05-25-p0-a11y-compliance`, branch `p0/a11y`).
Closes 4 audit findings (I-CMP1/3/5/6) from `audit-state/2026-05-25-roadmap-reconstruction`.
Reviewer APPROVED 1st pass (weightedMean 91.2). No backend application code; LOT 6 boundary
(`sseParser.ts` / `chatApi/stream.ts`) untouched.

#### Fixed

- **Mobile — chat a11y AA corrections (I-CMP1, I-CMP3 5/5 sub-violations).** Disclosure-footer
  contrast/opacity raised to AA; audio-description (expo-speech) double-playback race resolved by
  partitioning by content type (expo-speech owns image-description messages, server-TTS owns body
  text); streaming body exposed as a live region with the cursor excluded; chat-bubble masking label
  removed so body text reaches the accessibility tree; `Settings` audio-description control given
  Switch role + label + state.
- **Web — skip-link (WCAG 2.4.1 "Bypass Blocks") (I-CMP5).** Keyboard-reachable "skip to content"
  anchor added as the first focusable element of `museum-web/src/app/[locale]/layout.tsx`, jumping
  focus to the `<main id="main">` landmark (Tailwind `sr-only focus:not-sr-only`, copy from
  `dict.a11y.skipToContent`). Playwright a11y spec `public-skip-link.a11y.spec.ts` added.
- **Docs — accessibility statement domain + skip-link self-admission (I-CMP5).** `musaium.app` →
  `musaium.com` corrected in `docs/legal/accessibility-statement-{en,fr}.md`; the now-stale
  "No skip-link is implemented" assertion (§3.1) updated to reflect the shipped WCAG 2.4.1 skip-link.

#### Added

- **CI — SBOM CycloneDX attestation across the 3 apps (I-CMP6, user decision Q3 "Tout faire").**
  Backend + web ship signed, digest-bound CycloneDX attestations via `cosign attest --type cyclonedx`
  (additive, `continue-on-error`, existing `cosign sign` / SLSA-attest / verify left byte-unchanged
  and still blocking). Mobile ships a CycloneDX SBOM as a CI artifact (`sbom-mobile`); no sigstore
  attestation because EAS exposes no local OCI digest. Contract guard:
  `scripts/sentinels/sbom-attest-check.mjs`.
- **[ADR-068](docs/adr/ADR-068-sbom-attestation-strategy-mobile-gap.md)** — SBOM attestation strategy:
  digest-bound where possible, mobile-binary attestation gap deferred to **EU CRA Art. 13 (11 Dec
  2027)**, tracked in TECH_DEBT.

#### Tech debt opened

- **TD-CMP6-SBOM-ATTEST** (CRA 2027) — mobile store binary has no signed SBOM attestation bound to
  its digest (EAS exposes no local OCI digest). SBOM ships as CI artifact only; signed-attestation
  delta to close before CRA Art. 13 enforcement. Tracked in `docs/TECH_DEBT.md`.

### Chat composer + modal dismiss audit (2026-05-23, V1 close-out)

Run `/team` UFR-022 9-phase fresh-context (`2026-05-23-chat-composer-buttons-modal-dismiss`). Reviewer
loop 1 CHANGES_REQUESTED (79.3) → loop 2 APPROVED (89.9). Trois défauts UX-mobile chat + audit complet
des 16 surfaces modal/sheet de `museum-frontend/features/**/ui/*.tsx`.

#### Fixed

- **Mobile chat — `attachment-picker` ferme désormais au tap extérieur.** Bug pointer-events sur
  `<BottomSheetContainer>` (`Animated.View` wrap + outer `absoluteFill` absorbaient les taps avant
  le sibling backdrop). Fix : `pointerEvents="box-none"` sur les containers layout/animation +
  `pointerEvents="auto"` (défaut) sur le slab visible interactif. Les 5 autres routes C4
  non-bloquantes héritent du fix : `browser`, `context-menu`, `summary`, `ai-disclosure`,
  `cartel-scanner`. Routes blocking (`consent`, `voice-intro`, `daily-limit`) préservées
  (gate reducer côté machine, indépendant des hit-tests).
- **Mobile — VoiceOver/TalkBack double-announce du titre sur backdrop scrub.** Backdrop héritait
  du `accessibilityLabel` du sheet hôte. Désormais : prop `dismissLabel` distincte sur
  `<BottomSheetBackdrop>` ; le wrap garde l'announce label du dialog.
- **Mobile — `<OfflinePackPrompt>` n'abort plus un téléchargement actif au tap backdrop.**
  `handleBackdropPress` gated sur `packState.status === 'active'` → tap = no-op pendant le
  download, `onDismiss` ré-autorisé dès `idle` / `complete` / `error`.

#### Changed

- **Mobile chat — Composer layout.** Les boutons mic + `+` migrent en **colonne verticale leading**
  (mic au-dessus du `+`, les deux à gauche de `<ChatInput>` en LTR, à droite en RTL). Affordance
  voice + attachment regroupées sur la même main, plus de hand-shift en usage une-main. Audio-pill
  reste sibling de l'input (D2). RTL-safe (`start/end` logical-side props).
- **Mobile — `<BottomSheetBackdrop>` a11y label.** Le backdrop accepte maintenant une prop
  `dismissLabel` distincte ; fallback `accessibilityLabel` pour back-compat.

#### Added

- **Mobile — clé i18n `a11y.bottomSheet.dismiss`** (FR `"Fermer la feuille"` / EN `"Dismiss sheet"`).
  6 autres locales (ar, de, es, it, ja, zh) suivent via translator-of-record post-launch.
- **Audit modal/sheet — 7 regression-guard tests** (`MuseumSheet`, `BiometricSetupSheet`,
  `SourceCitation`, `OfflinePackPrompt`, `QuotaUpsellModal`, `ArtworkHeroModal`,
  `ImageFullscreenModal`) garantissant qu'un futur refactor ne réintroduit pas l'absorber-overlay
  bug ni ne casse les surfaces `intentionally-no-backdrop-dismiss`.
- **[ADR-066](docs/adr/ADR-066-rn-modal-pointer-events-routing.md)** — convention
  `pointerEvents="box-none"` sur containers `absoluteFill` avec backdrop dismissable + slab
  interactif sibling. Documente when-to-apply, when-NOT-to-apply (centered cards, pinch-zoom
  viewers).

#### Tech debt opened

- **TD-A11Y-COMPOSER-CREATEELEMENT** (V1.1) — `Composer.tsx` utilise `React.createElement('View')`
  pour les layout containers (frozen-test contract `react-test-renderer` composite-layer gotcha,
  documenté inline ligne 49-76). Investiguer host-primitive flatten helper côté `__tests__/helpers/`.
- **TD-BACKDROP-DISMISS-R6** (V1.1) — `backdrop-dismiss.test.tsx` parametrize sur 4/6 routes
  non-bloquantes (manque `ai-disclosure` + `cartel-scanner`). Extension 2-line dans fresh red phase.
- **TD-LINT-FROZEN-COMPOSER** (V1.1) — 2 warnings `@typescript-eslint/require-await` frozen dans
  `backdrop-dismiss.test.tsx:46-47`.

---

### Lot P0 — feature-gates & data-integrity (2026-05-21 → 2026-05-22, V1 close-out)

Lot multi-vagues verrouillant les pré-requis V1 (launch 2026-06-07). 6 commits sur `p0/feature-gates`
(`5a2da5f94` Wave A, `61838dcf2` Wave C, `5f417685f` TD-SEC-WAVEA-01, `d128df275` Wave B,
`048fd904d` Wave C6, `6c985f6fe` Wave C5). Pipeline 9-phase fresh-context UFR-022, 0 BLOCK-CONTEXT-LEAK,
0 BLOCK-TEST-WRONG, tous reviewers APPROVED 1er essai.

#### Added

- **Backend — `museums.wikidata_qid` column + migration M1** (`AddWikidataQidToMuseums.ts`) :
  `varchar(16) NULL UNIQUE`, propagée à `Museum` entity (`museum.entity.ts`) et seed
  (`seed-museums.ts`). Migration minimaliste (drift baseline isolé, documenté in-place).
- **Backend — License URI mapper `mapLicenseUriToSlug`** (`scripts/catalog-ingest.helpers.ts`) :
  table 6 URIs Wikidata → slugs internes (`public-domain`/`cc-0`/`cc-by-4.0`/`cc-by-sa-4.0`/`cc-by`/`gfdl-1.2`),
  `Object.freeze`. Corrige la fixture trompeuse qui injectait des slugs au lieu d'URIs.
- **Backend — `catalog-ingest --museum-id=<int>` flag** : lookup `Qid → museums.id` puis propagation
  `museumId` dans `ArtworkEmbeddingRow`, intégrant l'ingest au scoping multi-tenant.
- **Backend — Seed Q-codes vérifiés** : 3 musées Bordeaux (`Q3329534` Aquitaine, `Q2945071` CAPC,
  `Q16964634` Cité du Vin) + monument `Q1773424` Pont de Pierre (vérifié SPARQL — `Q1576946` était
  faux training data = "Hans Kaiser"). Commentaire défensif documente le trap long-terme.
- **Backend — migrations M2 + M3 multi-tenant** : `reviews.museum_id` + `support_tickets.museum_id`
  (FK indexée, scoping requis pour BOLA closure).
- **Backend — RBAC `museum_manager`** : ajout + scope `museumId` JWT claim FORCED dans admin
  analytics/stats. Allow-list d'entrée `AdminShell.tsx:196` web, OpenAPI, ExportCsvButton.
- **Backend — Runbook SigLIP provisioning** : `museum-backend/docs/operations/SIGLIP_PROVISIONING.md`
  (8 sections, placeholder SHA pre-prod-publish).
- **Backend — Module hexagonal telemetry funnel** : domain ports + use-cases + adapters HTTP
  (`telemetry/adapters/primary/http/routes/funnel.route.ts`) avec Plausible primary adapter.
- **Frontend mobile — shared analytics consent hook** : `museum-frontend/shared/analytics/useAnalyticsConsent.ts`
  + strings i18n FR/EN. **Hook shipped, banner UI NON shippé** → mobile funnel signals = 0 jusqu'à
  TD-C5-MOBILE-CONSENT-01.
- **Web — Plausible script intégration** + funnel telemetry, dashboard doc
  `museum-backend/docs/observability/PLAUSIBLE_FUNNEL.md`.
- **Lib-docs — `lib-docs/plausible/`** : PATTERNS.md + LESSONS.md + INDEX.json bump (109 libs)
  via doc-fetcher + doc-curator (UFR-022 §15 obligation).
- **.gitignore — whitelists** : `museum-backend/docs/operations/` et `museum-backend/docs/observability/`
  exposés (étaient capturés par le glob `docs/**` gitignored — gotcha CLAUDE.md "`docs/` whitelisted
  dans .gitignore").

#### Changed

- **API contract BREAKING (superset back-compat)** : review rating `1-5` → `0-10` NPS-style.
  Valeurs `1-5` restent valides (superset). OpenAPI regen requise côté FE/Web.
- **Backend — Admin analytics `museumId`** : Zod `strictObject` + scope RBAC FORCED via JWT claim
  (PAS via body/query). BOLA-secure : un admin scopé `museum:42` ne peut pas lire `museum:99`.
- **`.env.production.example`** : ajout `CORS_ORIGINS`, `APP_VERSION`, `GOOGLE_OAUTH_CLIENT_ID`
  (mirror prod-template manquait).
- **`.env.example`** : drop 5 dead vars (vérifié `0` refs `museum-backend/src/**`).
- **`tests/helpers/integration/integration-harness.ts`** : seed museums avec `id=42` + `id=99`
  pour fixtures cross-tenant (contract figé via frozen-test).

#### Fixed

- **I-FIX1 — Cache purge namespace** : bouton admin cache-purge câblé sur `invalidateMuseum`
  (use-case existant, dead code resuscité) au lieu de `delByPrefix('chat:llm:…')` (mauvais
  namespace — réel = `llm:v2:`). Refacto DRY, plus de duplicate inline.
- **I-FIX2 — Cache key chat texte** : threading `currentArtworkKey` dans `ChatMessageService`
  (`systemSection='chat-default'` était constant → cache leak cross-visitor sur même musée).
- **TD-SEC-WAVEA-01 — Validation Wikidata Qid** : `validateWikidataQid` (regex `/^Q[1-9][0-9]{0,18}$/`)
  ajoutée defense-in-depth aux 2 couches (`parseCliArgs` + `buildArtworksOfMuseumSparql`).
  Corrige asymétrie CLI : `--museum-id=<int>` était strict-validé mais `--museum=<Qid>` interpolé
  raw dans le template SPARQL. Corpus 27 cases (4 accepts, 9 malformed, 3 injection) PASS.

#### Security

- **BOLA SECURE** (Wave B) : admin scope `museumId` FORCED via JWT claim, body/query overrides
  ignorés. 0 cross-tenant leak. RBAC `museum_manager` ajouté + scopé.
- **SPARQL injection guard** : `validateWikidataQid` ferme la surface CLI-operator-only de
  Wave A SEC-M1 (TD-SEC-WAVEA-01 CLOSED).
- **GDPR consent gate Plausible** : cookieless + consent-first FE (hook `useAnalyticsConsent`).
  Banner UI mobile encore non shippé (TD-C5-MOBILE-CONSENT-01 HIGH shipBefore V1).

#### Tech-debt opened (V1-blocking)

15 TDs ouverts au total. **5 shipBefore V1-launch 2026-06-07** (cf `docs/TECH_DEBT.md`) :

- `TD-C5-MOBILE-CONSENT-01` (HIGH) — mobile consent banner UI consumer.
- `TD-COR-WAVEB-02` (MEDIUM) — `createTicket` route `req.user.museumId` plumb (~15 LOC).
- `TD-C5-CONSENT-HEADER-01` (MEDIUM) — BE `X-Musaium-Analytics-Consent` header defense-in-depth.
- `TD-C5-PROXY-TEST-01` (MEDIUM, bundle w/ consent-header) — BE proxy route integration test.
- `TD-SEC-WAVEA-02` (MEDIUM) — bump `brace-expansion>=5.0.6` + `ws>=8.20.1` (CVE baseline).

Les 10 autres LOW (TD-COR-WAVEB-01/03/04/05, TD-DOC-WAVEC-01 fixed inline, TD-C5-AUTH-FUNNEL-01,
TD-C5-LINT-FROZEN-01, TD-C5-CSP-NONCE-01, TD-C5-PRIVACY-POLICY-01, TD-SEC-LANG-01) sont
post-launch ou triviaux ; non listés ici.

#### Doc

- **`CLAUDE.md` § Pièges connus** : fix gotcha cache key `llm:v1:` → `llm:v2:` (stale doc
  vs code réel `llm-cache.service.ts:103`). Closes `TD-DOC-WAVEC-01`.

---

## Historique pré-CHANGELOG

Avant ce fichier, les releases étaient suivies via :
- `git log` (historique commits, source de vérité immuable),
- `docs/PHASE_HISTORY.md` (consolidation phases Maestro/Web a11y/Stryker/Auth e2e/Chaos/Coverage),
- `docs/ROADMAP_PRODUCT.md` (features cochées au merge),
- `.claude/skills/team/team-reports/` (runtime artefacts `/team`).

Ces sources restent valides pour l'historique antérieur au 2026-05-22.
