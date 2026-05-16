# S3 Tasks — Tests Quality (Audit 360, 2026-05-16)

**Source** : `.claude/skills/team/team-reports/working/2026-05-16-audit-360/S3-tests-quality.md`
**Launch V1** : 2026-06-01 (J-16)
**Doctrine** : UFR-013 honnêteté, UFR-017 vérifier tests avant classer bug, UFR-020 zero hook bypass.

---

## P0 — Pré-launch (J-16 → J-2, ~12h)

### T3.1 — Mitigation open handles auth scope (CRITIQUE)

- **Pourquoi** : 100 % timeout sur 45 fichiers `src/modules/auth/**` sous Stryker. Mutation score auth = 0 %. Bugs latents probables sur password reset, MFA enrollment, refresh token.
- **Action** : créer `museum-backend/tests/helpers/auth/jest-env.setup.ts` (mirror `tests/helpers/admin/jest-env.setup.ts`) avec `EXTRACTION_WORKER_ENABLED=false` + `CACHE_ENABLED=false`. Wire dans `museum-backend/stryker/config.mjs` via `setupFiles` + `extraTestPathIgnorePatterns` pour le scope auth.
- **Validation** : `pnpm stryker:run --mutate 'src/modules/auth/**/*.ts'` → score auth > 0 %.
- **Effort** : 1-2h.
- **Owner** : @backend.

### T3.2 — Mitigation open handles chat + museum scopes

- **Pourquoi** : `src/modules/chat/jobs/chat-media-purger.ts` (65 mutants, 0 killed), `chat-purge.job.ts` (72 mutants, 1 killed), `s3-orphan-purge.job.ts` (75 mutants, 5 killed). Jobs background = fire-and-forget = risque silent failure post-launch.
- **Action** :
  - `museum-backend/tests/helpers/chat/jest-env.setup.ts` + `extraTestPathIgnorePatterns: ['tests/unit/routes/museum-enrichment.route.test.ts']`.
  - `museum-backend/tests/helpers/museum/jest-env.setup.ts` (vérifier nécessité — museum mount BullMQ ?).
- **Validation** : run Stryker chat scope → ≥ 5 % killed minimum sur les 3 jobs.
- **Effort** : 1-2h.
- **Owner** : @backend.

### T3.3 — Ratchet mutation score 35 % dans quality-ratchet

- **Pourquoi** : aucun ratchet n'enforce le score mutation. Drift invisible. Baseline actuelle 30,77 %.
- **Action** :
  - Ajouter à `.claude/quality-ratchet.json` les clés `mutationScore: 35`, `mutationScoreKilled: 2169`, `mutationScoreSurvived: 287`, `mutationScoreTimeout: 4594`.
  - Étendre `.claude/hooks/ratchet-check.sh` pour lire `museum-backend/reports/mutation/mutation.json` et fail si score < 35 %.
  - Wire workflow nightly Stryker (cron) qui regenerate `mutation.json`.
- **Validation** : faire un PR factice qui dégrade un test, vérifier que ratchet fail.
- **Effort** : 30 min ratchet + 15 min workflow nightly.
- **Owner** : @platform.

### T3.4 — Migrer 13 factory violations BE (ratchet rompu)

- **Pourquoi** : baseline `no-inline-test-entities.json` = 15, scan trouve 28. Deficit +13. ESLint plugin enforcement rompu.
- **Action** :
  - `diff` entre baseline JSON et `grep -r " as User\| as Museum\| as ChatSession\| as ChatMessage\| as AuditLogEntry" museum-backend/tests/` → lister les 13 nouveaux.
  - Migrer chacun vers factory existante (`makeUser()`, `makeMuseum()`, `makeChatSession()`, etc.).
  - Vérifier que `.husky/pre-commit` exécute bien `lint:test-discipline` ; sinon ajouter.
  - Audit `git log -S "no-verify" --since=2026-05-13` pour détecter bypass éventuels.
- **Validation** : scan post-migration retourne 15 violations ≤ baseline.
- **Effort** : 2-4h.
- **Owner** : @backend.

### T3.5 — Maestro flow paywall quota exhaustion (R1 corrective never e2e)

- **Pourquoi** : R1 spec mergée 2026-05-16 (`docs/roadmap-night/specs/F1.md` + F2 + F3). Aucun e2e Maestro ne couvre ce path. Soft-paywall = revenue path critique launch.
- **Action** : `museum-frontend/maestro/paywall-quota-exhaustion.yaml`. Steps :
  1. Login user free tier
  2. Send N messages jusqu'à quota = 0
  3. Verify modal QuotaUpsellModal visible
  4. Verify reset date affichée formatée locale (pas ISO raw)
  5. Tap CTA upgrade → redirect store
  6. Close modal, reopen → state reset (consent + email empty)
- **Validation** : run local `maestro test museum-frontend/maestro/paywall-quota-exhaustion.yaml` → green.
- **Effort** : 2h.
- **Owner** : @mobile.

### T3.6 — Maestro flows RTL switch AR + HE (BLOQUANT GDPR Art. 5)

- **Pourquoi** : CLAUDE.md durci EN 301 549 §9.1.3.2 le 2026-05-14, 28 sites codemod RTL audit F10, mais **0 Maestro flow** ne valide la balade RTL bout-en-bout. 3/33 screens audités unit. RTL launch sans e2e = risque de leak physical-side découvert en prod.
- **Action** :
  - `museum-frontend/maestro/rtl-switch-ar.yaml` : settings → langue Arabic → verify Home + Chat + Discover screens flip start/end correctement.
  - `museum-frontend/maestro/rtl-switch-he.yaml` : idem Hebrew.
  - Ajouter shard `rtl` dans `ci-cd-mobile.yml` matrix.
- **Validation** : run sur device + screenshot diff.
- **Effort** : 4h (incl. mise en place fixtures localisation device).
- **Owner** : @mobile + @i18n.

### T3.7 — Maestro flow voice record→TTS (audio cert blocker)

- **Pourquoi** : voice V1 (`docs/AI_VOICE.md`) toujours actif sans flag. STT (gpt-4o-mini-transcribe) + LLM + TTS (gpt-4o-mini-tts) round-trip = différenciateur produit. Aucun e2e Maestro sur cette pipeline.
- **Action** : `museum-frontend/maestro/voice-record-and-tts.yaml`. Steps :
  1. Login + chat session
  2. Tap mic → permission granted
  3. Speak 3s (fixture audio file injection)
  4. Verify transcription apparait + LLM response streamed
  5. Verify TTS playback boutons (play/pause)
  6. Test interrupt (tap stop in mid-playback)
- **Validation** : run sur Android + iOS nightly.
- **Effort** : 3h.
- **Owner** : @mobile + @voice.

### T3.8 — Web Playwright 401-loop regression test (middleware gap)

- **Pourquoi** : middleware.ts coverage 85 %, gap = scenario admin-authz cookie present + API 401 (JWT expired). Risque silent redirect loop si refresh interceptor échoue.
- **Action** : `museum-web/e2e/admin-401-loop.spec.ts`. Mock `/api/admin/users` retourne 401. Login (cookie présent). Naviguer `/en/admin/users` → expect error UX visible + redirect `/en/admin/login` (pas de loop).
- **Validation** : Playwright `pnpm test:e2e admin-401-loop`.
- **Effort** : 1h.
- **Owner** : @web.

---

## P1 — Post-launch (Phase 1.1, 2026-06 sprint)

### T3.9 — Tuer top 10 survivants mutation (3j, +15 pts score)

- **Pourquoi** : 287 survivants = bugs latents documentés. ROI top 10 = ~115 kills supplémentaires.
- **Action** : prioriser
  1. `museum/parsers/opening-hours-parser.ts` (26 survivants, P0 launch-adjacent — temporal boundaries) — property test fast-check sur day/time combinations
  2. `knowledge-extraction/scraper/html-scraper.ts` (47) — corpus malformed HTML + IPv6 regex variants
  3. `admin/pg/admin-analytics-queries.ts` (42) — parameterized SQL boundaries
  4. `admin/pg/admin.repository.pg.ts` (23) — ORM filter parameterization
  5. `museum/useCase/search/searchMuseums.useCase.ts` (24) — radius + filter boundaries
  6-10. Reste (10-15 chacun)
- **Validation** : Stryker post-batch → score ≥ 50 %.
- **Effort** : 3 jours (2 modules / jour batch).
- **Owner** : @backend.

### T3.10 — Supprimer 50 tests theater identifiés

- **Action** :
  - Grep heuristique :
    ```bash
    grep -rL "expect.*\.(toBe\|toEqual\|toMatchObject\|toContain\|resolves\|rejects\|toThrow)" \
      museum-backend/tests/unit/ --include='*.test.ts' \
      | xargs grep -l "toHaveBeenCalled"
    ```
  - Review chaque candidat manuellement (faux positifs possibles si helpers).
  - Supprimer 30 BE + 15 FE + 5 Web.
  - Documenter dans CHANGELOG / TECH_DEBT.md.
- **Validation** : CI verte, mutation score ne baisse pas (test → noise removal seulement).
- **Effort** : 4h.
- **Owner** : @platform.

### T3.11 — Réécrire 30 regression-only en comportement

- **Action** : prioriser
  - `cache-key-parity.test.ts` → property test
  - `tests/unit/auth/totp/*` après mitigation T3.1 (= 200-300 nouveaux mutants kill-able)
  - `MuseumMapView.test.tsx` → pan/zoom interactions
  - i18n locale persistence e2e
  - 26 autres listés audit
- **Effort** : 1 semaine.
- **Owner** : @backend + @mobile + @web.

### T3.12 — Maestro flows V1+ : offline, MFA, permissions, daily-art (7 flows)

- **Action** :
  1. `offline-queue-recovery.yaml` (2h)
  2. `logout-and-refresh.yaml` (1h)
  3. `permission-camera-denial.yaml` (1h)
  4. `location-permissions.yaml` (1h)
  5. `daily-art-widget.yaml` (1h)
  6. `compare-image-flow.yaml` (1h)
  7. Documenter diff iOS nightly vs Android matrix (sinon supprimer si dead) (1h)
- **Effort** : 8h.
- **Owner** : @mobile.

### T3.13 — Web nightly Lighthouse + JS budget + multi-URL audit

- **Pourquoi** : Lighthouse runs PR-only (`if: github.event_name == 'pull_request'`). Pas de drift detection sur main. Pas de JS budget. Audit single URL `/en` seulement.
- **Action** :
  - Cron weekly Lighthouse sur main (`workflow_dispatch` + cron 04:00 UTC Sunday).
  - Ajouter assertion budget JS bundle < 200 KB gzipped landing.
  - Étendre `urls` à `/en/admin/login`, `/en/privacy`, `/en/support`, `/en/accessibility`.
- **Validation** : run cron manuel → tous les seuils respectés.
- **Effort** : 2h.
- **Owner** : @web.

### T3.14 — Contract tests OpenAPI : couvrir 22 endpoints manquants (47 % → 90 %)

- **Pourquoi** : 20/42 endpoints OpenAPI testés contract. Drift admin analytics + museum details.
- **Action** : générer tests systematiques pour endpoints non couverts. Liste à dériver via `node scripts/list-openapi-routes.cjs` (à créer si manque) + diff avec `tests/contract/openapi/*.test.ts`.
- **Effort** : 1 jour.
- **Owner** : @backend.

---

## P2 — Tech debt (T1 backlog post-launch)

### T3.15 — Ratchet test_real_ratio (heuristique AST)

- **Concept** : script qui parse les test files via AST et calcule % de tests "réels" (contiennent au moins 1 expect business). Cap BE ≥ 80 %, FE ≥ 50 %, Web ≥ 80 %.
- **Effort** : 4-8h.
- **Owner** : @platform.

### T3.16 — Documenter "Mutation Testing Debt" dans TECH_DEBT.md

- **Action** : ajouter section avec
  - Score actuel 30,77 % + cap 35 % pre-launch
  - 287 survivants par module
  - Auth/chat jobs 0 % score (post-mitigation re-baseline)
  - Plan Phase 2 vers 80 %
- **Effort** : 30 min.
- **Owner** : @platform.

### T3.17 — Vérifier 845/102 open handles full unit-integration

- **Pourquoi** : CLAUDE.md gotcha 2026-05-15 mentionne ce chiffre, non re-vérifié audit. Possiblement résolu depuis ou aggravé.
- **Action** : run `pnpm jest --forceExit=false --testPathPattern=tests/unit` post-mitigation T3.1+T3.2. Compter fails + suites. Mettre à jour gotcha CLAUDE.md.
- **Effort** : 30 min exécution + 15 min update.
- **Owner** : @backend.

### T3.18 — Fusion possible Node test runner + Jest RN museum-frontend ?

- **Pourquoi** : 2 runners = surcharge maintenance. Subagent FE verdict : justification valide (Node-only API tests transport security) → NO fusion.
- **Action** : documenter explicitement la séparation dans `museum-frontend/README.md` + CLAUDE.md (sinon prochain dev tentera fusion).
- **Effort** : 15 min.
- **Owner** : @mobile.

### T3.19 — A11y Playwright nightly inclut suite a11y ?

- **Pourquoi** : non vérifié read-only. Si cron 03:30 UTC ne run pas `playwright/a11y/*.spec.ts`, 22 a11y tests skip silently sur main.
- **Action** : lire un run nightly récent (gh CLI) ; ou run manuel workflow_dispatch ; vérifier output.
- **Effort** : 15 min.
- **Owner** : @web.

### T3.20 — LLM security workflows : confirmer pass-rate derniers 7 runs

- **Pourquoi** : audit read-only insuffisant. `llm-security-promptfoo.yml` exige ≥ 95 % (85 prompts, 4 leaks tolérés). `llm-promptfoo-smoke.yml` exige ≥ 80 % recall.
- **Action** : `gh run list --workflow=llm-security-promptfoo.yml --limit=7` + analyse résultats. Idem garak + smoke.
- **Effort** : 30 min.
- **Owner** : @platform.

---

## Récap : effort total estimé

| Phase | Tâches | Effort |
|---|---|---|
| P0 (pré-launch J-16 → J-2) | T3.1 → T3.8 (8 tâches) | ~12-14h |
| P1 (post-launch sprint 06) | T3.9 → T3.14 (6 tâches) | ~3-4 semaines |
| P2 (T1 backlog) | T3.15 → T3.20 (6 tâches) | ~1-2 semaines |

**Critical path launch** : T3.1 + T3.2 + T3.5 + T3.6 + T3.7 = 12h. Parallélisable backend/mobile.
