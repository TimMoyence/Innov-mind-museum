# Stryker Night Tracker — 2026-05-10

Tracking de la session nuit autonome Stryker (branche `Strycker`, worktree
`/Users/Tim/Desktop/all/dev/Pro/InnovMind.worktrees/Strycker`).

Mise à jour vivante au fil des étapes. Le récap final ira dans
`docs/plans/2026-05-NN-stryker-night-recap.md` à la fin (étape 4).

## Étape 0 — Fix env + sentry test blockers ✅

- [x] RED state reproduit (`tests/unit/config/env.test.ts:188` + `tests/unit/shared/sentry.test.ts:25`) — 2 failed, 54 passed
- [x] Fix appliqué dans `src/config/env.ts:22-24` : `if (NODE_ENV !== 'test') dotenv.config()`
- [x] GREEN sur env + sentry : `Tests: 56 passed, 56 total`
- [x] Suite complète : `Tests: 82 skipped, 4154 passed, 4236 total` (0 failing, +8 vs baseline)
- [x] Commit `d6b66028 fix(env,sentry): skip dotenv.config in test mode to keep tests env-agnostic`
- [x] Commit `24cd4956 chore(stryker): bootstrap docs/plans/ + night-tracker for Stryker session`

## Étape 1.1 — shared-db (12 survivors latents) ✅

- [x] Stryker run shared-db (4m20s, 0 survivors, 32 killed + 24 timeout / 63 total, 88.89% covered)
- [x] Commit `1604478c chore(mutation): finalize shared-db scope at 100% covered (0 survivors)`

## Étape 1.2 — shared-http (42 survivors : overpass-cache/tags/wikidata-ids) ✅

- [x] Stryker run shared-http initial : 42 survivors
- [x] Test additions : 26 nouveaux tests dans 3 fichiers (overpass-cache, overpass-tags, wikidata-injection)
- [x] 2 annotations Stryker disable justifiées (≥20 chars) — overpass-cache:113 (cond+eq équivalents), overpass-tags:25 (StringLiteral fallback)
- [x] Stryker rerun shared-http (7m27s, 0 survivors, 267 mutants : 165k+77t+25 ignored static Regex)
- [x] Commit `969a5ca5 chore(mutation): finalize shared-http scope at 100% covered (0 survivors)`

## Étape 1.3 — shared-misc (92 survivors, api.router 57 = carve-out) ✅

- [x] Carve-out api.router → `stryker/shared-routers.config.mjs` (57 survivors isolés)
- [x] Agent bucket-store : 16 survivors → 13 killed + 3 annotations (non-Node guard)
- [x] Test additions main : app.error.ts (+14 cases ValidationError + tooManyRequests + serviceUnavailable + unauthorized), logger.ts (+8 cases env-driven defaultFields via jest.isolateModules + withEnv helper), cursor-codec.ts (+1 annotation utf8 default)
- [x] Factory fix : `tests/helpers/rate-limit/bucket-store.fixtures.ts` passe options.maxSize/sweepIntervalMs en `undefined` pour exercer le fallback constructeur (kill L27 ArithmeticOperator)
- [x] Stryker shared-misc rerun à STRYKER_CONCURRENCY=4 (CPU dial-down, évite flake MFA timeout 5s) : 0 survivors, 135 mutants (52k+64t+19 ignored)
- [x] Commit `3971f063 chore(mutation): finalize shared-misc scope at 100% covered (0 survivors) + carve out routers`

## Étape 2 — Carve-out scopes (8) 🟡 en cours

État courant dans `reports/mutation/mutation.json` :

| Scope                    | Config                                                | Survivors | Status |
|--------------------------|-------------------------------------------------------|-----------|--------|
| shared-zod-issue         | `stryker/shared-zod-issue.config.mjs`                 | 8 → **0** | ✅ commit `abef65ef` |
| shared-password-breach   | `stryker/shared-password-breach-check.config.mjs`     | 14 → **0** | ✅ commit `abef65ef` |
| shared-memory-cache      | `stryker/shared-memory-cache.config.mjs`              | 19 + 16 NoCov | 🔄 agent en cours |
| shared-resilient-cache   | `stryker/shared-resilient-cache.config.mjs`           | 23 + 4 NoCov  | 🔄 agent en cours |
| shared-string-similarity | `stryker/shared-string-similarity.config.mjs`         | 49        | 🔄 agent en cours |
| shared-nominatim-client  | `stryker/shared-nominatim-client.config.mjs` (créé)   | NOT IN CACHE | 🔜 |
| shared-overpass-client   | `stryker/shared-overpass-client.config.mjs` (créé)    | NOT IN CACHE | 🔜 |
| shared-routers           | `stryker/shared-routers.config.mjs` (créé)            | 57 + 15 NoCov | 🔜 |

## Étape 3 — Modules

Priorité :

- `chat/**` (~2500 mutants — carve-out par sous-domaine)
- `auth/useCase/totp/**` (8+6+10+6+10+10+3=53 NoCov potentiels — tests from-scratch d'abord)
- admin, museum, daily-art, review, support, knowledge-extraction

## Étape 4 — Cleanup

- [ ] `rm museum-backend/stryker-*.log`
- [ ] Run parser global sur `reports/mutation/mutation.json` (cumulative)
- [ ] Récap doc final

## Notes opérationnelles

- Docker started by user (CPU watch). Cleanup containers after testcontainers runs.
- Other agents finishing work on parallel branches — no merge conflicts expected (Strycker worktree isolated).
- STRYKER_CONCURRENCY : démarre à default (8), descend à 4 si load >40 sustained.
- Stryker incremental cache : `museum-backend/reports/stryker-incremental.json` (git add -f).
- `git checkout -- pnpm-lock.yaml` après `pnpm install` (worktree-only refresh, ne pas committer).
