# Stryker Night Tracker — 2026-05-10

Tracking de la session nuit autonome Stryker (branche `Strycker`, worktree
`/Users/Tim/Desktop/all/dev/Pro/InnovMind.worktrees/Strycker`).

Mise à jour vivante au fil des étapes. Le récap final ira dans
`docs/plans/2026-05-NN-stryker-night-recap.md` à la fin (étape 4).

## Étape 0 — Fix env + sentry test blockers

- [x] RED state reproduit (`tests/unit/config/env.test.ts:188` + `tests/unit/shared/sentry.test.ts:25`) — 2 failed, 54 passed
- [x] Fix appliqué dans `src/config/env.ts:22-24` : `if (NODE_ENV !== 'test') dotenv.config()`
- [x] GREEN sur env + sentry : `Tests: 56 passed, 56 total`
- [x] Suite complète : `Tests: 82 skipped, 4154 passed, 4236 total` (0 failing, +8 vs baseline)
- [x] Commit `fix(env,sentry): skip dotenv.config in test mode to keep tests env-agnostic`

## Étape 1.1 — shared-db (12 survivors latents)

Cache déjà au scope `museum-backend/stryker/shared-db.config.mjs`. Test
additions de 98fb5a52 déjà sur HEAD. Rerun direct attendu.

- [ ] Lancement Stryker run (background)
- [ ] Parse survivors → 0
- [ ] Commit

## Étape 1.2 — shared-http (42 survivors : overpass-cache/tags/wikidata-ids)

- [ ] Stryker run (background)
- [ ] Fresh agent : prépare test additions strictes
- [ ] Code review parallèle
- [ ] Apply → retry → 0 survivor
- [ ] Commit

## Étape 1.3 — shared-misc (92 survivors, api.router 57 = carve-out probable)

- [ ] Décision carve-out routers vs in-bundle
- [ ] Stryker
- [ ] Apply test additions / carve-out config
- [ ] Commit

## Étape 2 — Carve-out scopes (8)

Configs déjà créées dans `museum-backend/stryker/`. Ordre :

1. shared-zod-issue (8, facile, test from-scratch)
2. shared-password-breach-check (14, logger/sentry payload)
3. shared-resilient-cache (23, fault injection)
4. shared-memory-cache (19 + 16 NoCov, fakeTimers)
5. shared-string-similarity (49, table de cas)
6. shared-nominatim-client (config à créer)
7. shared-overpass-client (config à créer)
8. http no-test bundle (4-5 tests from-scratch puis scope dédié)

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
