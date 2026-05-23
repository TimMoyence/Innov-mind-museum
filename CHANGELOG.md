# Changelog

All notable changes to Musaium are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Per-app changelogs (museum-backend / museum-frontend / museum-web) may also exist for app-scoped
> details. This root file aggregates lot-level / cross-cutting changes that span the monorepo.

---

## [Unreleased]

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
