# A6 — Engineering Docs Audit (2026-05-26)

Auditor: Claude Sonnet 4.6 (read-only). Source de vérité : code + configs + CI.

---

## Tableau de synthèse

| Fichier | État | Confiance | Preuve (doc→code) | Action |
|---|---|---|---|---|
| `docs/ARCHITECTURE.md` | **À MODIFIER** | HIGH | Omission module `telemetry` (présent sous `src/modules/telemetry/`, structure hexagonale identique) ; module list dit « admin/auth/leads/museum/review/support » mais ne cite pas `telemetry`. Reste exact. | Ajouter `telemetry` à la liste des modules barrel |
| `docs/CONTRIBUTING.md` | **À MODIFIER** | HIGH | Pre-commit : doc dit 5 gates, réel = 8 (gates 6–8 workspace-links/compose-parity/fe-version-sync absents). Pre-push : doc dit 10 gates budget < 30 s, réel = 21 gates budget < 2 min (gates 11–21 manquants : Sentry-scrubber parity, gitleaks push range, contract OpenAPI, migration down(), ast-grep, OpenAPI breaking, affected tests ×3, metric-naming, roadmap-claim-resolves, ai-tests count). | Mettre à jour les deux tableaux de gates + budget |
| `docs/MIGRATION_GOVERNANCE.md` | **OK** | HIGH | `migration-cli.cjs` exists (`scripts/migration-cli.cjs`). `migration:run --transaction each` / `migration:revert --transaction none` dans `package.json:43–45`. Migration `1777568348067-AddCriticalChatIndexesP0.ts` existe. | Rien |
| `docs/LINT_DISCIPLINE.md` | **OK** | HIGH | Plugin `eslint-plugin-musaium-test-discipline` exists (`tools/…`). Règle `no-undisabled-test-discipline-disable` confirmée dans `src/rules/` + `src/index.ts`. Toutes les catégories justifiées vérifiées dans le plugin. | Rien |
| `docs/TEST_FACTORIES.md` | **À MODIFIER** | HIGH | `makeSession` existe bien dans `tests/helpers/chat/message.fixtures.ts:18` (nom correct). `buildChatTestService` dans `chatTestApp.ts` ✓. `createRouteTestApp` dans `route-test-setup.ts` ✓. `createE2EHarness` dans `e2e-app-harness.ts` ✓. FE factories dans `__tests__/helpers/factories/` ✓. MAIS : « Phase 7 reduces this list » — Phase 7 = migration FE factories (ADR-012:63), plan non encore exécuté côté FE (le doc laisse penser que la réduction est planifiée sans dire si c'est done/pending). Faible risque. | Clarifier statut Phase 7 (pending) |
| `docs/TEST_INDEX.md` | **À MODIFIER** | HIGH | Sentinel path wrong : doc dit `museum-frontend/scripts/sentinels/screen-test-coverage.mjs` + `museum-frontend/package.json:21`. Réalité : sentinel = `scripts/sentinels/screen-test-coverage.mjs` (ROOT) + wiring = `package.json:22` (ROOT). `museum-frontend/scripts/sentinels/` ne contient que `info-plist-location-keys.mjs`. Statuts ⏳ pre-push gate / CI / sentinel-mirror confirmés NOT wired (0 refs dans `.husky/pre-push`, `ci-cd-mobile.yml`, `sentinel-mirror.yml`). | Corriger path sentinel : ROOT `scripts/sentinels/screen-test-coverage.mjs` + ROOT `package.json:22` |
| `docs/TEST_COVERAGE_INVENTORY.md` | **À MODIFIER** | HIGH | Même erreur de path : « `museum-frontend/scripts/sentinels/screen-test-coverage.mjs` ». Les 26 routes app + 4 Screen.tsx non-routés vérifiés existants (museums-picker, guided-museum-mode, offline-maps, BiometricLockScreen, MfaChallengeScreen, MfaEnrollScreen, MuseumPickerScreen). | Corriger path sentinel |
| `docs/TESTING_DISCIPLINE_PROPOSAL.md` | **À MODIFIER** | HIGH | §3.1 : chemin correct (`scripts/sentinels/…` ROOT). Mais status block (lignes 11–16) dit `museum-frontend/scripts/sentinels/screen-test-coverage.mjs` — incohérence interne doc. Les statuts ⏳ pré-push/CI/mirror confirmés NOT wired. La note « DELETE this file only once those wire » est encore applicable. | Corriger la référence de path dans le bloc status |
| `docs/TESTING_PHASE2_PLAN.md` | **À MODIFIER** | HIGH | Path sentinel wrong (`museum-frontend/scripts/sentinels/screen-test-coverage.mjs`) dans 3 occurrences (lignes 9, 39, 119). Phase 2 wiring (pre-push, CI, mirror) confirmé NOT wired. Doc dit « STILL THE PENDING PLAN » — honnête, à conserver. | Corriger les 3 occurrences de path |
| `docs/CI_CD_SECRETS.md` | **À MODIFIER** | HIGH | **CONTRADICTION POLICY** : ligne 48 dit « `--no-verify` est toléré en dernier recours mais à documenter ». Or UFR-020 (CLAUDE.md) + CONTRIBUTING.md §8 disent ZÉRO bypass tolérée, sans exception. Ce claim contredit la doctrine en vigueur. Sinon : `db-backup-daily.yml` ✓, `db-backup-monthly-restore-drill.yml` ✓, `tls-renewal.yml` ✓, `tls-cert-monitor.yml` ✓, `deploy-privacy-policy.yml` ✓, `codeql.yml` ✓, `semgrep.yml` ✓. `_deploy-backend.yml` correctement signalé comme supprimé. | Supprimer la phrase autorisant `--no-verify` ; remplacer par renvoi UFR-020 |
| `docs/GITHUB_ACTIONS_SHA_PINS.md` | **OK** | HIGH | SHA `de0fac2e4500dabe0009e67214ff5f5447ce83dd` pour `actions/checkout` vérifié présent dans 37 occurrences dans les workflows. Toutes les autres actions citées vérifiées par sampling dans `ci-cd-backend.yml`. Le commentaire `# v6` est la convention du repo (tag interne, non le tag officiel GitHub) — cohérent avec la note « annotated tags » en bas du doc. | Rien |
| `docs/PASSWORD_HASH_MIGRATION.md` | **À MODIFIER** | MEDIUM | Principe et stratégie corrects. `bcrypt.ts` ✓, `bcrypt-cost-factor.test.ts` ✓, `seed-smoke-account.ts` ✓. MAIS : numéros de lignes décalés. `resetPassword.useCase.ts` : doc dit `:31`, réel `:30`. `recoveryCodes.ts` : doc dit `:42`, réel `:50`. `seed-smoke-account.ts` : doc dit `:46`, réel `:141`. Les patterns restent vrais, les lignes ont drifté (refactoring post-rédaction). | Actualiser les line refs OU supprimer les numéros de lignes (pattern suffit) |
| `docs/SOCIAL_AUTH_SETUP.md` | **OK** | HIGH | `socialAuthProviders.ts` existe à `features/auth/infrastructure/socialAuthProviders.ts`. `expo-apple-authentication` + `expo-web-browser` dans `museum-frontend/package.json` ✓. Pas de `socialAuthService.ts` (doc correct). Architecture server-mediated OAuth (pas de client-side Google SDK) cohérente avec la source. | Rien |
| `docs/ROADMAP_FE_RN_BEST_PRACTICES.md` | **À MODIFIER** | HIGH | F11 : thresholds `91/78/80/91` confirmés dans `jest.config.js:61–64` ✓. F5 : `noUncheckedIndexedAccess: true` dans `tsconfig.json` ✓. F3 : `MuseumSheet.tsx` existe ✓. MAIS : F11 dit « cf. CLAUDE.md §Coverage uplift gates » — ce section n'existe PAS dans CLAUDE.md (introuvable via grep). Les thresholds sont dans `jest.config.js`, pas dans CLAUDE.md. F7 : « 11 flows + sharding 4 voies » — stale (27 flows aujourd'hui) mais c'est une roadmap vivante avec items cochés, drift attendu. IOS26_CRASH_DIAG.md ✓. | Corriger le cross-ref F11 vers `museum-frontend/jest.config.js` (pas CLAUDE.md §Coverage uplift gates) |

---

## Findings notables

### F1 — CRITIQUE : `CI_CD_SECRETS.md` autorise `--no-verify` (contradiction UFR-020)
**Fichier:** `docs/CI_CD_SECRETS.md:48`
**Claim faux:** *« `--no-verify` est toléré en dernier recours mais à documenter »*
**Réalité code:** `CLAUDE.md § Hook bypass interdit (UFR-020)` + `CONTRIBUTING.md §8` + `.claude/settings.json permissions.deny` interdisent **toute** forme de bypass sans exception.
**Risque:** Un contributeur lisant uniquement CI_CD_SECRETS.md croit que le bypass est autorisé avec documentation, crée un précédent de contournement.
**Action:** Supprimer la phrase de tolérance, remplacer par « UFR-020 — bypass interdit sans exception, voir CLAUDE.md § Hook bypass interdit ».

### F2 — CONTRIBUTING.md : gates pré-commit et pré-push massivement outdatés
**Fichier:** `docs/CONTRIBUTING.md §8`
**Claim faux:** 5 gates pré-commit (budget < 5s), 10 gates pré-push (budget < 30s).
**Réalité code:** `.husky/pre-commit` = 8 gates. `.husky/pre-push` = 21 gates, budget = < 2 min (confirmé ligne 10 du hook).
**Gates manquants pré-commit:** 6 workspace-links, 7 compose-parity, 8 fe-version-sync.
**Gates manquants pré-push:** 10 Sentry-scrubber parity, 11 gitleaks push range, 12 contract OpenAPI, 13 migration down(), 14 ast-grep, 15 OpenAPI breaking, 16–18 affected tests ×3, 19 metric-naming, 20 roadmap-claim-resolves, 21 ai-tests count.
**Risque:** Onboarding trompeur, contributeur surpris par les vrais délais de push.

### F3 — Sentinel `screen-test-coverage.mjs` : path incorrect dans 4 docs
**Fichiers:** `TEST_INDEX.md:151`, `TEST_COVERAGE_INVENTORY.md` (multiple), `TESTING_DISCIPLINE_PROPOSAL.md` (bloc status), `TESTING_PHASE2_PLAN.md:9,39,119`
**Claim faux:** `museum-frontend/scripts/sentinels/screen-test-coverage.mjs` + wired dans `museum-frontend/package.json:21`.
**Réalité code:** Sentinel = `scripts/sentinels/screen-test-coverage.mjs` (ROOT). Wiring = `package.json:22` (ROOT). `museum-frontend/scripts/sentinels/` ne contient que `info-plist-location-keys.mjs`.
**Phase 2 wiring** (pre-push gate, CI step, sentinel-mirror) : confirmé NOT wired (0 occurrences dans `.husky/pre-push`, `ci-cd-mobile.yml`, `sentinel-mirror.yml`). Les statuts ⏳ dans les docs sont exacts.

### F4 — ARCHITECTURE.md omet le module `telemetry`
**Fichier:** `docs/ARCHITECTURE.md`
**Claim incomplet:** Liste « admin/auth/leads/museum/review/support » pour les modules barrel ; `chat/KE` pour composition-root. `telemetry` absent.
**Réalité code:** `museum-backend/src/modules/telemetry/` existe avec structure hexagonale standard (adapters/composition/domain/index.ts).

### F5 — ROADMAP_FE_RN broken cross-ref « §Coverage uplift gates »
**Fichier:** `docs/ROADMAP_FE_RN_BEST_PRACTICES.md` item F11
**Claim faux:** « cf. CLAUDE.md §Coverage uplift gates » (section introuvable dans CLAUDE.md).
**Réalité:** Les thresholds `91/78/80/91` sont configurés dans `museum-frontend/jest.config.js:61–64`. CLAUDE.md ne mentionne pas ce ratio.

### F6 — PASSWORD_HASH_MIGRATION : line refs décalées (mineur)
**Fichier:** `docs/PASSWORD_HASH_MIGRATION.md §2`
**Claim décalé:** `resetPassword.useCase.ts:31` (réel :30), `recoveryCodes.ts:42` (réel :50), `seed-smoke-account.ts:46` (réel :141). Patterns et stratégie restent corrects. Risque faible (doc = plan post-launch, pas référence opérationnelle).

---

## Statut global

**3 OK / 8 À MODIFIER / 0 À SUPPRIMER**

Aucun fichier à supprimer — tous 14 décrivent des réalités opérationnelles actives ou des plans post-launch utiles.

### Priorité de correction

| Priorité | Fichier | Finding |
|---|---|---|
| P0 | `CI_CD_SECRETS.md` | F1 — contradiction UFR-020 sur --no-verify |
| P1 | `CONTRIBUTING.md` | F2 — gates pré-commit/pré-push massivement outdatés |
| P2 | `TEST_INDEX.md`, `TEST_COVERAGE_INVENTORY.md`, `TESTING_DISCIPLINE_PROPOSAL.md`, `TESTING_PHASE2_PLAN.md` | F3 — path sentinel wrong (4 fichiers, même correction) |
| P3 | `ARCHITECTURE.md` | F4 — module telemetry absent |
| P3 | `ROADMAP_FE_RN_BEST_PRACTICES.md` | F5 — cross-ref CLAUDE.md §Coverage uplift gates inexistant |
| P4 | `PASSWORD_HASH_MIGRATION.md` | F6 — line refs décalées (plan post-launch, faible risque) |
| P4 | `TEST_FACTORIES.md` | Phase 7 pending non signalé explicitement |
