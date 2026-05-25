# L17 — Audit fine-grain : P0.D4, P0.D5, TD-AS-01

- **Scope** : `docs/ROADMAP_PRODUCT.md` items P0.D4, P0.D5, TD-AS-01
- **Branch/HEAD** : `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`
- **Méthode** : re-dérivation from scratch, zéro confiance aux marqueurs antérieurs. Toutes preuves reproductibles ci-dessous.
- **Date** : 2026-05-25

---

## P0.D4 — 3 `describe.skip` morts supprimés → **VERDICT : DONE (CONFIRMÉ)**

Commit `0d0b2fda5` : `test(backend): delete 3 dead unconditional describe.skip suites (D4, 238 LOC)`, `3 files changed, 238 deletions(-)`.

**Preuve — fichiers absents du tree :**
```
git ls-files | grep -E "art-keyword-repo-atomic-upsert|AddCriticalChatIndexesP0|AddP1FKAndTokenIndexes"
# → seules les 2 MIGRATIONS source matchent :
#   src/data/db/migrations/1777568348067-AddCriticalChatIndexesP0.ts
#   src/data/db/migrations/1777617893834-AddP1FKAndTokenIndexes.ts
# → AUCUN .test.ts / .spec.ts (les 3 suites supprimées). CONFIRMÉ.
```
Les 2 matches résiduels sont les fichiers de migration TypeORM (`.ts`), PAS les specs supprimées (`.spec.ts`) — homonymie de basename, pas un faux négatif. `0d0b2fda5` a supprimé `tests/.../AddCriticalChatIndexesP0.spec.ts` et `AddP1FKAndTokenIndexes.spec.ts`, les migrations source restent (normal).

**Claim "streaming.e2e.test.ts retiré de la liste"** : correct — c'est un gate conditionnel valide (`shouldRunE2E ? describe : describe.skip`), pas un hard-skip. N'existe pas en FE. Non touché à raison.

### Autres `describe.skip` / `it.skip` non-conditionnels résiduels (grep call-sites réels)
```
grep -rnE "^\s*(describe|it|test)\.skip\s*\(" --include=*.ts --include=*.tsx \
  museum-backend/ museum-frontend/ museum-web/ | grep -v node_modules ...
```
2 résiduels, **AUCUN dans le scope D4**, chacun justifié :

1. `museum-backend/tests/unit/security/prompt-injection.test.ts:86` — `describe.skip('KNOWN BYPASSES — TODO variant analysis')`. **Skip délibéré documenté** : payloads connus pour passer le guardrail keyword ; structural defenses limitent le blast radius ; `@TODO Phase 5` pour flip les assertions. Auditable sans faire échouer la CI. **KEEP — débt traçable légitime (Phase 5).**
2. `museum-web/src/app/[locale]/admin/users/[id]/__tests__/user-detail-tier-wire.test.tsx:127` — `it.skip('page renders TierToggleButton…')`. Justifié : redondant avec `TierToggleButton.test.tsx` (2 couches vertes), React 19 + Vitest interaction immature. `Approved-by: dispatcher 2026-05-15`. **KEEP — defer honnête approuvé.**

(`chat-citations.integration.test.ts:32` = simple commentaire mentionnant `it.skip()`, PAS un call-site. Faux positif d'un grep naïf.)

**Debt D4** : aucune. Les 2 skips résiduels sont des choix documentés hors-scope, pas des morts à enterrer.

---

## P0.D5 — ADR-036 `llm:v1`→`v2` + `AiDisclosureModal` purgé → **VERDICT : DONE pour le scope listé, mais brief "grep llm:v1 = 0" FALSE (résiduels hors-scope D5)**

Commit `af2d31468` : `docs: honesty fixes — ADR-036 llm:v2 key shape + AiDisclosureModal->AiDisclosureSheetContent (D5)`.

**Source de vérité (clé prod)** : `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:119` → `llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256}`. Confirmé par CLAUDE.md gotcha (`d54552beb` a bumpé v1→v2 le 2026-05-19).

### (a) `llm:v1` — scope D5 corrigé, MAIS 2 docs hors-scope encore stale
```
grep -rn "llm:v1" docs/ museum-backend/src/
```
- ✅ `ADR-036-llm-cache-strategy.md:15` et `:56` → maintenant `llm:v2:` (le scope EXACT listé par D5). **CORRIGÉ.**
- ❌ `ADR-038-anti-hallucination-citations-websearch.md:76` → dit encore `llm:v1:` ET claim affirmatif **"LLM cache key shape unchanged… continues to apply"**. C'est une affirmation d'état-courant FAUSSE (la clé EST v2). Violation UFR-013 résiduelle.
- ❌ `ADR-065-redis-volatile-ttl-with-bullmq-caveat.md:20` → liste `key shape llm:v1:…` comme état courant. Stale.

Le commit `af2d31468` ne revendique QUE ADR-036 (cf. message). Les 2 autres docs n'étaient PAS dans le périmètre D5 (D5 ne listait que `ADR-036:15,56`). **Donc D5 = exécuté conformément à son scope**, mais le brief audit "grep llm:v1 = 0" est **faux** : il en reste 2 (+ les références meta dans ROADMAP/V1_LOCKDOWN qui sont des trackers, légitimes).

### (b) `AiDisclosureModal` purgé des docs légaux → CONFIRMÉ
```
grep -n "AiDisclosureModal" docs/legal/AI_DISCLOSURE.md docs/legal/AI_DISCLOSURE_AUDIT.md
# → 0 (CLEAN). Renommés en AiDisclosureSheetContent.
```
Composant réel vérifié : `museum-frontend/features/chat/ui/AiDisclosureSheetContent.tsx` existe (route `ai-disclosure`).

Références `AiDisclosureModal` restantes, toutes **contextuellement correctes (non-bugs)** :
- `docs/adr/ADR-055-bottomsheet-router-state-machine.md:21` — énumération historique "avant refactor" (liste littérale des anciens modals remplacés). Intentionnellement non touché. **OK.**
- `docs/TECH_DEBT.md:514,519` — TD-57, note de rename qui dit explicitement que `AiDisclosureModal.tsx` **n'existe plus** (référence pédagogique correcte). **OK.**
- `docs/V1_LOCKDOWN_LOTS.md:273` + `docs/ROADMAP_PRODUCT.md:150` — trackers de la tâche D5 elle-même. **OK.**
- `museum-frontend/features/chat/ui/AiDisclosureSheetContent.tsx:21` — commentaire "Replaces the previous `<AiDisclosureModal>`". Correct. **OK.**
- `museum-frontend/coverage/lcov-report/...AiDisclosureModal.tsx.html` — artefact de coverage **gitignored/stale** (le composant n'est plus dans le tree source). Cosmétique, régénéré au prochain `npm test --coverage`. **Debt mineur.**

**Debt D5** :
- **TD-DOC-D5-RESIDUAL** (LOW, doc-honesty) : `ADR-038:76` et `ADR-065:20` claiment encore `llm:v1` comme état courant. `ADR-038:76` est le plus grave (affirmation "unchanged" explicite). À corriger v1→v2 OU annoter "historique". Hors-scope D5 mais réel.
- Coverage HTML stale `AiDisclosureModal.tsx.html` (cosmétique, non versionné).

---

## TD-AS-01 — 10 clés AsyncStorage namespacées + `migrateStorageKey()` reader no-overwrite → **VERDICT : DONE (CONFIRMÉ, qualité élevée, ZÉRO perte de données)**

Commit `15abcc94d` : `feat(storage): namespace 10 AsyncStorage keys + one-shot legacy migration reader (TD-AS-01)`.

### Reader `migrateStorageKey()` — `museum-frontend/shared/infrastructure/migrateStorageKey.ts`
Contrat vérifié ligne par ligne :
- L33-37 : read `newKey` ; si non-null ET non-vide → return (**idempotent + no-overwrite**, jamais d'écrasement).
- L39-43 : read `legacyKey` ; si null/vide → return (**no-op sur legacy absente**).
- L45-46 : `setItem(newKey, legacyValue)` puis `removeItem(legacyKey)` (carry-forward + cleanup).
- L19-22 : copie **opaque-string** (pas de parse/re-serialize) → JSON préservé byte-for-byte.
- L47-50 : try/catch tout swallow → **best-effort**, ne crash jamais le read path (fallback defaults).

### 10 clés re-préfixées = 8 migrées + 2 cleanup-only (réconcilie le "10")
| # | New key | Legacy | Fichier | Migré ? |
|---|---|---|---|---|
| 1 | `musaium.theme.mode` | `app.themeMode` | `ThemeContext.tsx` | ✅ migrate L37 |
| 2 | `musaium.runtime.defaultLocale` | `runtime.defaultLocale` | `runtimeSettings.ts` (+ `I18nContext.tsx`) | ✅ L61 + L58 |
| 3 | `musaium.runtime.defaultMuseumMode` | `runtime.defaultMuseumMode` | `runtimeSettings.ts` | ✅ L62 |
| 4 | `musaium.runtime.guideLevel` | `runtime.guideLevel` | `runtimeSettings.ts` | ✅ L63 |
| 5 | `musaium.settings.resumptionBannerDismissedUntil` | `settings.resumption_banner_dismissed_until` | `useResumableSession.ts` | ✅ L111 |
| 6 | `musaium.museum.lastCameraView.v1` | `museum.lastCameraView.v1` | `mapCameraCache.ts` | ✅ L64 |
| 7 | `musaium.dailyArt.savedArtworks` | `@musaium/saved_artworks` | `useDailyArt.ts` | ✅ L16,41 |
| 8 | `musaium.dailyArt.dismissed` | `@musaium/daily_art_dismissed` | `useDailyArt.ts` | ✅ L40 |
| 9 | `musaium.runtime.apiBaseUrl` | `runtime.apiBaseUrl` | `runtimeSettings.ts` | ⚪ cleanup-only (design §9 D-Q4) |
| 10 | `musaium.runtime.apiEnvironment` | `runtime.apiEnvironment` | `runtimeSettings.ts` | ⚪ cleanup-only (env build-driven) |

Les 2 clés API override sont **délibérément non migrées** (env désormais build-driven, rien à porter) — `cleanupLegacyApiOverrideKeys()` les purge. Choix correct, pas une perte de données utilisateur (aucune préférence persistée légitime).

### Câblage read-path : migrate-AVANT-read sur les 6 sites → PAS DE PERTE 1er BOOT
- `runtimeSettings.ts:60-73` — `Promise.all([migrate×3])` PUIS `getItem×5`. ✅
- `ThemeContext.tsx:37-39` — `migrate().then(getItem)`. ✅
- `I18nContext.tsx:58-59` — `migrate().then(getItem)`. ✅
- `useResumableSession.ts:111-114` — `await migrate` PUIS `getItem`. ✅
- `mapCameraCache.ts:64-66` — `await migrate` PUIS `getJSON`. ✅
- `useDailyArt.ts:16 / 40-43` — `await migrate` PUIS `getJSON/getItem`. ✅

**Double-migration de `musaium.runtime.defaultLocale`** (I18nContext + runtimeSettings) = **order-safe** : `migrateStorageKey` idempotent + no-overwrite → premier exécutant gagne, second = no-op. Documenté dans le commentaire I18nContext L54-56. Pas de race destructrice.

### `consentStorageService` — NON migré, INTENTIONNEL (pas un bug data-loss)
`features/chat/infrastructure/consentStorageService.ts:37` utilise déjà `musaium.consent.aiAccepted.${userId}` (conforme). Commentaire L17-18 : la legacy globale `consent.ai_accepted` est **délibérément JAMAIS consultée** → un device avec seulement la clé legacy **re-prompt** le consentement. Décision GDPR (interdiction d'héritage de consentement silencieux à travers un rename — cohérent avec gotcha CLAUDE.md "consent inheritance interdit"). **Pas une perte de données : un re-prompt voulu.**

### Preuve test reproductible
```
cd museum-frontend && npm test -- --testPathPattern=migrateStorageKey
# → Test Suites: 330 passed, 330 total ; Tests: 3385 passed, 3385 total
# → inclut __tests__/infrastructure/migrateStorageKey.test.ts ET consentStorageService.test.ts
```
(Le "worker force exited" en fin = open-handle leak connu non-bloquant, suites toutes vertes.)

### Sanity : aucun renamed-key oublié
```
grep -rhoE "(getItem|setItem|getJSON|setJSON|removeItem)\(['\"][^'\"]+" museum-frontend/{features,shared}
# → seul literal inline = 'musaium.runtime.defaultLocale' (I18nContext). Tout le reste via consts nommées.
```
Aucune clé non-namespacée renommée sans migration → pas de risque de perte data résiduel.

**Debt TD-AS-01** : aucun bug. Cohérence parfaite avec `docs/TECH_DEBT.md:1253-1259` (RESOLVED). Note : le doc TD-AS-04 (redéfinitions mock test) reste un débt séparé, hors-scope ici.

---

## Synthèse verdicts

| Item | Verdict | Note |
|---|---|---|
| **P0.D4** | ✅ DONE (confirmé) | 3 specs supprimées du tree. 2 skips résiduels ailleurs = justifiés/hors-scope. |
| **P0.D5** | ✅ DONE pour le scope listé | ADR-036 corrigé + AiDisclosureModal purgé des légaux. MAIS brief "llm:v1 = 0" FAUX : `ADR-038:76` + `ADR-065:20` encore stale (hors-scope D5). |
| **TD-AS-01** | ✅ DONE (qualité élevée) | 8 migrées + 2 cleanup-only ; reader idempotent no-overwrite ; câblé migrate-avant-read sur 6 sites ; consent intentionnellement re-prompt (GDPR) ; tests verts. Zéro perte de données 1er boot. |

**Nouveau débt ouvert** :
- **TD-DOC-D5-RESIDUAL** (LOW) : `ADR-038:76` (claim "unchanged" + `llm:v1`) + `ADR-065:20` (`llm:v1`) stale vs clé prod `llm:v2`. UFR-013.
- Cosmétique : `museum-frontend/coverage/.../AiDisclosureModal.tsx.html` stale (non versionné, régénéré).
