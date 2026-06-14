---
kind: roadmap
asof: 2026-06-14 — launch décalé 2026-06-07 → 2026-08-27 (décision Tim 2026-06-13)
gonogo: NOT_YET — qualité d'abord avant tout nouveau code
posture: quality-first (verrouiller les garde-fous AVANT les features)
blockers: P0 code + ops (Tim)
stats: done=9 partial=0 open=43 ops=7
---

# Roadmap Produit — Musaium

> **Source de vérité unique pour le produit.** État **vérifié-code** (on croit le code, pas la doc ni les marqueurs antérieurs).
> **Réécrite le 2026-06-14** après la **consolidation 360** (`artifacts/2026-06-14-consolidation-challenge-360.html`) : 21 claims de l'audit `2026-06-09` re-vérifiés par 2 agents fresh-context à hypothèses opposées (54 agents) + 3 deep-dives root-cause + triage des 11 retours terrain du test photo prod (22 agents) + 6 recherches sourcées. Preuve item-par-item : `file:line` ci-dessous (toute ancre re-lue par ≥2 agents, UFR-013).
>
> **Décalage launch : 2026-06-07 → 2026-08-27** (~11 semaines). Posture **qualité d'abord** : on ne reproduit pas le pattern de l'audit (« vrai-rouge ignoré » / « jamais-validé présumé vert »). On **verrouille les garde-fous et le système anti-mensonge AVANT de produire des features**.

---

## Décisions actées (2026-06-14)

| # | Décision | Choix | Pourquoi |
|---|---|---|---|
| D1 | Posture runway 11 sem | **Qualité d'abord** | Code applicatif bon, garde-fous morts → verrouiller d'abord. quality-not-speed. |
| D2 | Stryker (mutation) | **Ré-armer nightly hot-files** | Garantie kill-ratio sur le chemin critique IA/argent sans coût/flakiness par-PR. Décision UFR-016 datée (ferme TD-70). |
| D3 | Système anti-mensonge | **Dur** | Hook `Stop` /team bloquant + bans CI + diff-coverage bloquant. « Plus jamais de half-done/TODO/mensonge. » |
| D4 | Périmètre session 2026-06-14 | **Roadmap uniquement** | Cette session = consolidation + réécriture roadmap + intégration retours terrain + clôture dette. Pas d'exécution code. |
| D5 | `enforce_admins=false` + 0 review | **Conservé (posture solo-dev correcte)** | Vérifié live. Le défaut n'est PAS l'absence de 2e reviewer mais (a) le manifeste qui ment + (b) l'absence de garde push-sur-rouge → Q13/Q8. |
| D6 | Arabe V1 | **Fixer les pluriels CLDR (~5 lignes i18next), garder `ar`** | Coût faible, garde la locale. (À reconfirmer ; sinon retirer de V1 → V1.1.) |

---

## North Star

**Musaium V1 = compagnon culturel IA voice-first, dedans ET dehors.** Tu photographies une œuvre (musée) ou un monument/lieu (ville) → chat AI conversationnel voice-first (STT + TTS Opus), mêmes capacités in/out musée, + **suggestions de proximité** sans navigation. Carnet post-visite.

**V2 = parcours guidé navigué** (itinéraire GPS multi-POI + audio streaming auto). Sprint sep-nov 2026 si signal KR2 NPS positif.

**Audience** — B2C freemium (cible V1, soft-paywall **stub** assumé à valider data-driven). B2B musée = hypothèse future, 0 musée démarché (3 musées Bordeaux = démo). Institutionnel = backlog H2.

**OKR Q3** — KR1 pitch B2B démontrable · KR2 NPS post-session ≥7/10 · KR3 crash-free ≥99.5 % + chat p99 <5s · KR4 100 inscrits B2C semaine 1.

---

## Le flow de production V1 (doctrine — comment on exécute cette roadmap)

> Chaque item P0/P1 non-trivial passe par ce flow. **Fresh agent par tâche, preuve `file:line` ou exécution réelle, zéro guess.** Orchestré via `/team` (UFR-022) OU un `Workflow` multi-agents.

**Les 4 temps (fresh-context, mappés aux phases UFR-022) :**
1. **Cadrage** (`architect` + `test-analyst` fresh) — user stories + feature rules + testing rules + **tous les invariants + tous les use-cases** (volume exhaustif, mode « comment ça casse »). Output : `spec.md` + `test-contract.md` (matrice UC adversariale, Tier ADR-012). Gate A.
2. **Tests** (`editor` fresh) — UN test qui FAIL par UC, basé sur les **factories partagées** (une factory est **modulable, pas figée** : on la fait grossir quand l'app grossit, mais elle DOIT laisser les autres tests verts ; si un test pré-existant devient rouge → **escalade**, on ne « corrige » pas le test). Output : tests + `red-test-manifest.json` UC-keyé. Gate B.
3. **Green** (`editor` fresh, zéro mémoire phase red) — code qui rend les tests verts. **Tests gelés byte-for-byte** (hook). Test suspecté faux → `BLOCK-TEST-WRONG` sans toucher → re-fresh phase red. Gates C/D (tier + incident-regression).
4. **Review + doc** (`reviewer` + `documenter` fresh) — verdict APPROVED/CHANGES/BLOCK, remonte les erreurs de code, met à jour la doc. **On reboucle à l'étape 1** depuis ses retours. Reviewer rejection loop **illimité**.

**Règles « les agents restent shift-left » :**
- **Convergence** : toute solution/feature/idée est validée par **2-3 agents qui convergent** ; s'ils divergent, on **reboucle** jusqu'à la bonne solution. Vérification = 2 agents fresh à hypothèses opposées.
- **Shift-left** : le défaut se fait attraper **le plus tôt possible** (lint < sentinelle < test < CI), jamais reporté « à la review » ou « post-launch ».
- **Lib-docs obligatoire** : tout agent qui touche/relit du code consulte `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` (refresh >14j via doc-cache).
- **Résilience** : un agent qui tombe (relogin / session-limit / throttle / socket closed) → **relancer le workflow** (complet, ou `resumeFromRunId` qui rejoue le préfixe caché).
- **Anti-raccourci** : « inline pour efficacité tokens », « j'ai utilisé mon training », « le test était faux je l'ai corrigé », « cap 2 boucles atteint » (au reviewer) = **REJET immédiat**. L'objectif est la qualité, pas la vitesse.

---

## Système anti-mensonge / anti-half-done (D3 = DUR)

> Principe directeur : **chaque mensonge attrapé devient une sentinelle qui le rend structurellement impossible à reproduire.** C'est la réponse à « transformer tous les mensonges de l'audit en résolutions permanentes ». Détail exécutable = lane **Q**.

**Les 6 couches (greffées sur l'existant, miroitées `sentinel-mirror.yml` anti-bypass UFR-020) :**
1. `eslint-plugin-no-only-tests` — bannit `.only`/`fdescribe`/`fit` (vert trompeur = 1 test au lieu de N).
2. Règle maison `musaium-test-discipline/no-skipped-or-empty-tests` — bannit `describe.skip`/`it.skip`/`xit`/`test.todo` non-baseline + tests vides.
3. `no-warning-comments` — bannit `TODO`/`FIXME`/`HACK` (half-done).
4. `no-empty` (catch vide) + anti-placeholder (`PLACEHOLDER`/`DO_NOT_SHIP`/`lorem`).
5. **diff-coverage bloquant** (lignes changées, `diff_cover`) en CI.
6. **Hook `Stop` /team bloquant** : impossible de finir une session avec un diff applicatif sans verdicts de gates A-D dans `state.json` + `red-test-manifest.json` UC-keyé (convertit les gates « prose » en blocage dur).

**Une sentinelle par classe de mensonge** (lane Q8) :

| Classe de mensonge (constatée dans l'audit) | Sentinelle qui la tue |
|---|---|
| Test qui se saute (IDOR) | `no-skipped-or-empty-tests` + « aucune suite `tests/integration` ne s'auto-skip » |
| Gate déclaré actif mais mort (Stryker, frozen-gates, alerting) | `stryker-job-honesty` + hook `Stop` + `prometheus-scrape-auth↔gating` |
| Doc qui ment (manifeste, TECH_DEBT, vitrines, CLAUDE.md) | `branch-protection-manifest-parity` + `tech-debt-closure-check` + `privacy-content↔code` + `doc-inventory-policy` |
| Binaire ≠ config déclarée (iOS/Android) | `ios-native-snapshot-parity` + `android-blocked-permissions` post-prebuild |
| Sortie générée hand-editée (design-system) | `tokens-build-fresh` (rebuild + `git diff --exit-code`) |
| Half-done / TODO / placeholder | `no-warning-comments` + anti-placeholder + diff-coverage |
| Fix vert sur main mais absent du binaire shippé | `ship-time-build-freshness` (build HEAD descendant du dernier commit app/features/shared) |

---

## 🚦 P0 — Avant launch (2026-08-27) · qualité d'abord

> Ordre d'attaque : **Q (système qualité) en premier** (tout le reste est exécuté SOUS sa protection), puis les P0 bugs/réglementaire/garde-fous. Chaque item : preuve `file:line` · correctif **durable** (sentinelle/hook, pas rustine) · **test credentialé** qui le verrouille · source.

### Lane Q — Système qualité & anti-dette (protège tout le reste)

- [ ] **Q1 — Anti-lie ESLint L1-L4** : `no-only-tests` + `no-skipped-or-empty-tests` (maison) + `no-warning-comments` (TODO/FIXME) + `no-empty`/anti-placeholder, sur les 3 `eslint.config.mjs`, miroir `sentinel-mirror.yml`. _Source R3. La règle maison s'ajoute à `eslint-plugin-musaium-test-discipline` (existe déjà). Test : self-test plugin + baseline shrink-only._
- [ ] **Q2 — diff-coverage bloquant** : `diff_cover` sur les lignes changées en CI (seuil de départ 80 %, ratchetable). _Source R3._
- [ ] **Q3 — Frozen-gate enforcé (hook `Stop`)** : enregistrer un hook `Stop` dans `.claude/settings.json` qui BLOQUE la fin de session si diff applicatif (`museum-backend/src`, `museum-frontend/{app,features,shared,components}`, `museum-web/src`, `tests/`) sans verdicts gates A-D dans `team-state/$RUN_ID/state.json` + `red-test-manifest.json` UC-keyé. _Source deep-dive FROZEN_GATES : les gates A-D (`daa403ea`) sont de la prose `SKILL.md:293/336/459/462`, jamais enregistrées ; seul `post-edit-green-test-freeze.sh` l'est (`settings.json:47`) ; les runs `team-reports/working/` contournent `team-state/$RUN_ID/`. Test : un run /team canonique end-to-end qui prouve les 4 exit codes dans `state.json`._
- [ ] **Q4 — IDOR/intégration un-skip** : dual-gate `RUN_E2E || RUN_INTEGRATION` sur les 5 suites `tests/integration/*` gardées `RUN_E2E` + sentinelle « aucune suite `tests/integration` ne s'auto-skip en CI ». _Source C11 : `idor-matrix.test.ts:20-21` ; prouvé runtime `RUN_INTEGRATION=true … → 9 skipped`. Template correct : `me-tts-voice.integration.test.ts:16`. Test : la matrice IDOR (9 assertions) DOIT exécuter dans le job integration._
- [ ] **Q5 — Hygiène doc (delete-or-sentinelize, hybride)** : `scripts/sentinels/doc-inventory-policy.mjs` — tout `*.md` doit être curé dans `doc-last-verified.json` OU match un archive-glob OU supprimé ; baseline **shrink-only**. _Source R2/C2 ; étend `doc-last-verified.mjs` (3 couches, pre-push Gate 25). Couvre les ~45 docs qui mentent sous 30j._
- [ ] **Q6 — Refonte mémoire agent** : reconstruire `MEMORY.md` (entrées ≤200 c, **zéro état git** dans l'index, détail → topic files), corriger l'entrée protection-branche (live = `enforce_admins=false`/0 review/11 checks), + sentinelle taille/format (échoue si >limite ou entrée >200c). _Source C5/F : 25 763 o → tronqué milieu ligne 97, 62/73 entrées >200c. Cure esquissée `03-memory.md`._
- [ ] **Q7 — Design-system SSOT** : câbler les component-tokens dans `design-system/build.ts` (`buttonTokens`/`emptyStateTokens`/`errorStateTokens`) + réconcilier la dérive bidirectionnelle (RN composants en avance, CSS web en retard) + sentinelle `tokens-build-fresh.mjs` (rebuild `build:tokens` + `git diff --exit-code` sur les 8 sorties) + corriger la commande CLAUDE.md + en-têtes « DO NOT EDIT ». _Source F-LIBS-02/C16/R4 ; `build.ts:15-19` n'émet jamais les component tokens, `tokens.generated.ts` hand-edité. Test : la sentinelle échoue si une sortie générée diverge de la source._
- [ ] **Q8 — Sentinelles anti-mensonge (1 par classe)** : `branch-protection-manifest-parity` · `tech-debt-closure-check` · `privacy-content↔code` · `ios-native-snapshot-parity` · `android-blocked-permissions` · `no-embedded-blob-in-docs` · `env-var-parity` · `stryker-job-honesty` · `prometheus-scrape-auth↔gating` · `ship-time-build-freshness`. _Toutes miroitées server-side. Détail = tableau « classe de mensonge »._
- [ ] **Q9 — Gouvernance archi (complexité, pas taille brute)** : étendre le pattern ESLint backend (`max-lines` 400/600 par couche + `sonarjs/cognitive-complexity` 15/20) à **FE + web** (zéro règle aujourd'hui) via les **bulk-suppressions** natives ESLint v9.24+ (grandfather) ; + `eslint-plugin-boundaries` FE (modèle BE) + sentinelle de cycles features FE. _Source C18/R1 : 400 lignes brut = instrument grossier (FE 7 fichiers >400, BE 24) ; FE = 44 imports inter-features, 5 cycles, 0 garde, chat = god-feature 122 fichiers. **Pas de cap de lignes brut** : cognitive-complexity primaire._
- [ ] **Q10 — Stryker ré-armé nightly hot-files (D2)** : basculer le job `mutation` `if:false` → cron nightly scopé `.stryker-hot-files.json` (8 fichiers banking-grade) ; décision UFR-016 datée (ferme TD-70) ; sentinelle `stryker-job-honesty` ; retirer le caller défangé `pre-commit-gate.sh:70,73`. _Source C12 (`ci-cd-backend.yml:414`)._
- [ ] **Q11 — Réparer la chaîne d'alerting + alerte deploy/santé (F-GAP2-06)** : (a) port métriques **interne** privé Docker (scrape sans JWT, `/metrics` public reste super-admin) + sentinelle `prometheus-scrape-auth↔gating` ; (b) **notifications deploy** Telegram succès+échec (`appleboy/telegram-action`) dans `ci-cd-backend.yml`/`web`/`mobile` ; (c) healthcheck cron (`healthchecks.io`) ; (d) `DASHBOARD_BASE_URL` au lieu de `{{ .ExternalURL }}` mort. _Source C1/C2/R5 : `/metrics` super-admin (`app.ts:336-337`) vs scrape sans cred (`prometheus.yml:24-44`) → 29/35 NoData. « Tu n'as jamais reçu d'alerte » = (b) inexistant. Test : smoke compose asserte `up{job=musaium-backend}==1`._

### Lane B — Bugs user (ton test photo prod) — P0

- [ ] **B1 — [P0] Échec photo en prod = 403 stockage objet + upload fatal** : (1) rendre l'upload image chat **NON-FATAL** (le LLM répond depuis le buffer base64) — wrap `imageStorage.save` (`image-processing.service.ts:106-116`) en try/catch, continuer avec `imageRef=''` (persistance dégradée), comme le fix `/chat/compare` ; (2) **réparer le 403 OVH/S3** (« AWS authentication requires a valid Date or x-amz-date header », `s3-operations.ts:105-107`, partie infra OPS-1). _Source triage T5 (conf medium ; root-cause réfuté = PAS « body already read » ; 403 ~195ms avant l'appel LLM ; commit diag `71b176bd` 06-14). Test : integration `imageStorage.save()` qui throw 403 → `postMessage` répond 201 dégradé, jamais 5xx._
- [ ] **B2 — [P1] Photo dupliquée ×4 au retry** : stamper une `Idempotency-Key` stable (`clientMessageId`) sur le chemin **live** (pas seulement offline-flush) via `buildOptimisticMessage` → `sendMessageStreaming` → `postMessage` ; `retryMessage` réutilise la MÊME clé (pas de `Date.now()` neuf) + garde re-entrance. _Source triage T4 : cause dominante = auto-retry axios (`httpClient.ts:335-367`, maxRetries=2, timeout 15s) qui renvoie SANS clé sur 4G lente → 2-3 messages serveur. `idempotencyMiddleware` backend existe. Test : timeout 4G simulé + retry → 1 seul message serveur._
- [ ] **B3 — [P1] `image-url` → 400** : ajouter l'id user persisté à `PostMessageResponse` (`chat.contracts.ts:81-110`) + re-keyer l'id optimiste user (`${Date.now()}-user`) vers l'UUID serveur (miroir du re-key assistant `sendMessageStreaming.ts:138-159`). _Source triage T6 : `isUuid(messageId)` rejette l'id optimiste avant DB (`session-access.ts:74-76`) → 400 9ms. Test : e2e credentialé envoie image → tape la fiche/carnet → `image-url` 200._
- [ ] **B4 — [P1] Image trop grande dans le chat** : capper/halver la taille de la bulle image. _Source triage T4._
- [ ] **B5 — [P1] Quota double-surface + modale off-brand** : 402 `QUOTA_EXCEEDED` = la **modale seule** (kind dédié `QuotaExceeded`, pas de bannière `error.validation`) + thémer `QuotaUpsellModal` avec les design tokens (retirer la palette hardcodée `:249-261`). _Source triage T1 : `httpClient.ts:291-311` ouvre la modale ET fall-through → `authCodeMessage` sans cas `QUOTA_EXCEEDED` → bannière khaki « Veuillez vérifier votre saisie ». Test : un vrai 402 createSession → SEULE la modale, pas de `error-notice`._
- [ ] **B7 — [P1] Badge confiance « Faible — IA seule » trompeur** : enterrer (UFR-016) le sous-système citation-chips/confiance (`CitationChip`, `CitationChips`, `citations.ts` confiance, `citation-telemetry.ts`) — vérifier 0 importeur restant. _Source triage T3 : confiance = heuristique FE sur `metadata.sources` ; backend prune les sources non-validées → réponse photo générale = sources vides → pill rouge « low » par défaut. « Juger les connaissances de l'IA » = hors-mission. Test : asserter l'ABSENCE du badge sur une bulle assistant._
- [ ] **B9 — [P1] Messages d'erreur EN + génériques (i18n)** : (1) cas `Unknown` explicite dans `getErrorMessage` → `t('error.unknown')` (FR existe `:694` mais jamais atteint) ; traiter les messages du mapper comme des **codes**, pas du copy ; (2) i18n « Guided mode »/« Standard mode » (`dashboard-session.ts:43`) + retirer le tag `en-US` brut ; (3) corriger le désync locale-session (défaut `fr`). _Source triage T11 : `httpErrorMapper.ts:218-224` met « Unexpected server error », `errors.ts:237-238` `error.message ||` fait gagner l'anglais. Test : `getErrorMessage(AppError{kind:Unknown})` avec fn FR → string FR._
- [ ] **B10 — [P1] Réparation réseau pas dans le binaire prod (deploy-lag)** : couper + shipper un nouveau build mobile depuis `main` (contient `60b6bcdc`) → corrige le bandeau « data économe » en 4G + le faux « hors ligne » ; + gate `ship-time-build-freshness`. _Source triage T10B : build `1.3.0+93` coupé 06-07 PREDATE la réparation 06-12 (`git merge-base --is-ancestor` exit 1) → tourne l'ancien `if(isConnectionExpensive) return 'low'`. (Cf Q8/Q11.)_
- [ ] **B12 — [P1] FaceID renvoie au login** : `BiometricGate` conscient de l'échec — brancher sur `refresh.kind` (success→home, transient→home offline, invalid→bannière « session expirée » i18n) au lieu de `unlockBiometric()` inconditionnel. _Source deep-dive FACEID : `BiometricGate.tsx:72-86` + `AuthContext.tsx:267-282` ; le test `BiometricGate.test.tsx:272-285` canonise le bug. Test : flow Maestro credentialé qui déverrouille Face-ID → atterrit sur home (vrai backend)._
- [ ] **B13 — [P1] Recherche musée / « View details » vide** : préserver l'`id` réel + la `description` dans `mapSearchEntryToMuseumWithDistance` (`useMuseumDirectory.ts:55-69`, garder l'id négatif synthétique uniquement pour les rows OSM sans id). _Source deep-dive MUSEUM_SEARCH : le mapper force `id:-(index+1)` + `description:null` → `museum-detail.tsx:50-53` voit id négatif → enrichissement désactivé + description vide. Le backend porte bien les données (DB locale + OSM Overpass + Nominatim — découverte NON limitée aux seeds). Test : e2e credentialé login→recherche→tap→fiche PEUPLÉE (couvre « Pointe-à-Callière »)._

### Lane R — Réglementaire / sécurité — P0

- [ ] **R1 — [P0] `/chat/describe` bypass guardrails + scrub PII** : décorateur `GuardedChatOrchestrator` UNE fois au composition root (`chat-module.ts:725`) injecté dans `buildChatService` ET `DescribeService` → « single source of truth » par construction. _Source C7 : `describe.service.ts:46` appelle `orchestrator.generate()` nu. Test : POST `/chat/describe` avec injection → bloqué comme le chemin chat._
- [ ] **R2 — [P0] Consent IA `profile` non-enforced (RGPD Art.7)** : gater le fetch mémoire **fail-CLOSED** sur le scope `profile` (`enrichment-fetcher.ts:78-84` / `user-memory.service.ts:131`) + canal `profile` dans `provider-resolver.ts`. _Source C13 : le bloc mémoire part au LLM quel que soit le consentement. Test : consent profile=false → 0 bloc mémoire au prompt._
- [ ] **R3 — [P0] Vitrines réglementaires fausses** : corriger le canonical JSON + store listings — rétention 180j (pas « durée du service »), refresh 14j (pas 30j), **Sentry EU `ingest.de`** (la politique ment en disant « US »), Plausible déclaré + opt-out réel, « photos jamais stockées » corrigé, « Japonais » (pas « Portugais ») ; + sentinelle `privacy-content↔code`. _Source C14 (5/6 confirmés ; Sentry NUANCÉ = audit inversé). Apple 2.3.1 = motif de rejet._

### Lane G — Garde-fous CI + parité native — P0

- [ ] **G1 — [P0] Playwright web bloquant** : `deploy.needs += playwright-pr` (`ci-cd-web.yml:387`) + entrée required `playwright-pr` dans `branch-protection/main.json`. _Source C4 (alerte + build-prod déjà corrigés `0f47a632`). Test : un rouge Playwright bloque merge ET deploy._

---

## 🟠 P1 — Premier mois post-verrouillage (fenêtre hotfix)

- [ ] **B6 — Monétisation unit-of-value** : tier-gater les tours de message vs la création de session (les routes message/media portent `llmCostGuard` $0.50/j + `dailyChatLimit` 100/j mais pas la différenciation tier). _Source triage T1 : design-debt, attend les données funnel._
- [ ] **B8 — Épuration écran chat** : supprimer `AiDisclosureFooter` (footer « Réponses générées par IA… » redondant) en **gardant** une disclosure AI Act Art.50 atteignable (badge IA + consent sheet) + fusionner `ArtworkHeroCard` dans `ChatHeader` (un seul header, l'œuvre détectée remplace le titre « Session artistique »). _Source triage T2 : `ChatSessionSurface.tsx:92`, `ChatHeader.tsx:67-94`, `chat.fallback_title`. Garde : Maestro asserte qu'une disclosure Art.50 reste visible._
- [ ] **B11 — Sidecar LLM-Guard fiabilité prod** : CPU floor (`deploy.resources`) dans `docker-compose.prod.yml` + UX de timeout bénin (le message « Service temporarily unavailable… not flagged » sur un timeout 1500ms est anxiogène). _Source triage T10A._
- [ ] **B14 — Bruit Google/Apple Sign-In cancel** : classer la cancellation comme outcome bénin (pas de `throw`/report Sentry) à la source (`socialAuthProviders.ts:107-113`) + filtre `beforeSend`. _Source triage T8._
- [ ] **B16 — Sentinelle anti-DOMException** : crash `new DOMException` **déjà enterré** (`134abe293`, absent du build 93) → ajouter une sentinelle CI bannissant `new DOMException` en source FE + résoudre l'issue Sentry historique. _Source triage T7 (STALE)._
- [ ] **G2 — Parité native iOS** : ré-activer `appConfigFieldsNotSyncedCheck` + sentinelle `ios-native-snapshot-parity` (prebuild variant prod + diff Universal Links / ATS strict / Certificate Transparency). _Source C8._
- [ ] **G3 — Android `blockedPermissions`** : déplacer en `android.blockedPermissions` top-level (`app.config.ts:277-282`) + sentinelle post-prebuild sur le manifeste généré. _Source C9._
- [ ] **G4 — Patchs Podfile pérennes** : promouvoir les 4 patchs inline-only en config-plugins (modèle `withFmtConstevalPatch`) + brancher la sentinelle info-plist orpheline. _Source C10 (5 patchs, dont `maplibre-spm-integration`)._
- [ ] **R5 — RETURNING DRY** : extraire `shared/db/raw-returning.ts` (`affectedFromReturning`/`rowsFromReturning`) + migrer les 7 sites + règle ESLint maison. **Ne PAS toucher `artKeyword.repository.typeorm.ts:44`** (lecture INSERT flat correcte, inflation réfutée). _Source C15._
- [ ] **Arabe V1 (D6)** : fixer les pluriels CLDR `ar` (~5 lignes i18next) OU retirer `ar` de V1. _Source audit F-LESSONS-01._
- [ ] **Web a11y** : `error.tsx`/`not-found.tsx` localisés + redirect locale 301→302/307 + `Vary`. _Source audit F-ARCH-WEB-04/05._
- [ ] **Scrub Sentry complet** : breadcrumbs `data.url` + `event.contexts` (URLs signées `?token=` peuvent fuiter) + arrondir lat/lng + proscrire free-text en logs (≥4 sites). _Source audit F-SAN-02/03._

---

## 🟡 P2 — Opportuniste

- [ ] **B15 — App Hang (diagnostic)** : `quality:1` sur les 3 pickers (optimisation ; le re-encode est off-main donc PAS la cause prouvée) + `profilesSampleRate` Sentry pour diagnostiquer (pas de JS stack). _Source triage T9._
- [ ] **Phantom vars** : supprimer les mentions prose `FEATURE_FLAG_KNOWLEDGE_EXTRACTION`/`FEATURE_FLAG_WEB_SEARCH` (les providers web-search Google CSE/SearXNG/DuckDuckGo sont **déjà construits**, #15 `5ce9e957`) + sentinelle `env-var-parity`. _Source C20._
- [ ] **`noUncheckedIndexedAccess` backend** (146 src + 771 tests, all-or-nothing, helper `requireIndex`) — TD-40, effort multi-session dédié.
- [ ] **DRY restant** : haversine, backoff, dates FE, `fetchWithTimeout` shadows.
- [ ] **Gouvernance méta-machinerie** : registre « attrapé/jamais déclenché » par sentinelle, gel inventaire 1-in-1-out, élagage sentinelles 0-catch après 90j.
- [ ] **CLAUDE.md corrections + README** : corriger le piège INSERT…RETURNING (`:161`, tuple = UPDATE/DELETE only) ; supprimer le blob SSH Raspberry `README.md:169` (gzip corrompu, pas un secret) + sentinelle `no-embedded-blob-in-docs`. _Source C21/C17._

---

## 🧑‍🔧 Ops — Tim (hors-code)

- [ ] **OPS-1 — Réparer le 403 OVH/S3 prod** (credentials/endpoint/date header) — débloque B1 côté infra. _Source triage T5._
- [ ] **OPS-2 — DPIA/ROPA** : mandater le DPO + signer (ou dater la décision go-launch motivée). _Source C14/F-REG-04._
- [ ] **OPS-3 — `security@musaium.com`** alias OVH→Gmail (clé PGP, breach-playbook, VDP).
- [ ] **OPS-4 — DPA Langfuse** confirmé (EU, auto-accepté au signup, archivé `docs/legal/dpa-signed/`).
- [ ] **OPS-5 — Révoquer la clé Anthropic** encore vivante côté secret-store.
- [ ] **OPS-6 — Plausible** : créer le site `musaium.com` + poser `PLAUSIBLE_DOMAIN`/`EXPO_PUBLIC_PLAUSIBLE_DOMAIN` AVANT launch (funnel KR4) + 1 restore-drill backup.
- [ ] **OPS-7 — Re-soumission stores** : age rating (age-gate 15 codé), metadata corrigées (R3) avant toute re-soumission Apple/Google.

---

## ✅ Livré & vérifié-code (sur `main`)

> Carry-over des clusters V1 livrés (détail `ROADMAP_AUDIT_TRAIL.md`) + ce qui a été corrigé/clôturé depuis l'audit 06-09.

- ✅ **Chemin critique IA/argent enterprise** (guardrails V1+V2, quota, scrubber, rate-limiter) — sécurité backend 0 critical/high/medium, typage 88 (audit).
- ✅ **Sécurité & PII, GDPR DSAR, feature-gates, stabilité, a11y/AI Act** — clusters P0.A/B/C/I/CMP livrés (audit trail).
- ✅ **Plateforme produit** — cache LLM v3, SigLIP+pgvector HNSW, KnowledgeRouter, paywall stub + quota, audio-description WCAG, refonte chat UX, géofence, RBAC, landing, distributed tracing, TTS Opus.
- ✅ **Corrigé depuis l'audit (l'audit est partiellement stale)** : Playwright alerte+build-prod (`0f47a632`) · 3 providers web-search #15 (`5ce9e957`) · worker enrichissement musée #16 · `/chat/compare` SigLIP+Wikidata (`056bb4c5`).
- ✅ **Dette clôturée 2026-06-14** : TD-36 (testIDs) · TD-41 (`c03cc428`) · TD-42/43/54 (`98333b0f`) — vérifiées code (consolidation C19).

---

## 🔭 V1.1 / V2 / LATER (carry-over)

- **V1.1 (Q3)** — system prompt localisé FR/JA/ZH/AR, tsvector+RRF hybrid search, provider Anthropic + prompt-caching, refactor dossiers chat, multi-persona voice, Premium full (Stripe, conditionné aux données soft-paywall), WebRTC Realtime (reco : skip).
- **V2 (sep-nov 2026)** — `features/walk/` (parcours navigué multi-POI), migrations POI, OSRM, TTS streaming, MapLibre polyline, background GPS. **Conditionné** : KR2 NPS ≥7/10 sur 50 sessions.
- **LATER** — infra VPS (disque dédié, photos S3, multi-tenant), B2B-ready, RAG modernization, moonshots 2027+.

## ⛔ KILLED (ne pas redécider sans signal nouveau)

| Item | Date | Raison |
|---|---|---|
| SSE streaming chat | 2026-04 | Remplacé par sync chat |
| Garak orchestrator | 2026-05-17 | Coût ~$120/mois vs $2 estimé |
| Realtime API V1 walk-mode | 2026-05-20 | 5× coût + ré-arch guardrail |
| MFA mobile user-facing | 2026-05-26 | Web-admin-only V1 (ADR-017) |
| Hexagonal POJO 23 entities V1 | 2026-05-20 | 157 fichiers, infaisable V1 |

---

## Comment cette roadmap est consommée

1. **Début sprint** — `/team` lit ce fichier + `ROADMAP_TEAM.md`. **Lane Q d'abord** (qualité d'abord) ; les autres lanes s'exécutent SOUS sa protection.
2. **Par item** — flow de production V1 (4 temps fresh-context, 2-3 agents convergents, preuve `file:line`). Un item = un run `/team` ou un `Workflow`.
3. **Au merge** — coche `[x]` + cite le commit. Bloqué = `[BLOCKED: raison]`.
4. **Rendu lisible** — `node scripts/render-artifact.mjs docs/ROADMAP_PRODUCT.md --out artifacts/roadmap.html`.
5. **Fin sprint** — réécriture complète, commit `docs(roadmap): sprint <date>`. Versions = `git log -- docs/ROADMAP_*.md`.
