# Stryker Mutation Testing — Stratégie incrémentale par chunks

**Date** : 2026-05-08
**Statut** : Design (à valider)
**Contexte** : run full `pnpm mutation` ETA ~143h, ingérable. Besoin de chunker en sessions courtes sans bloquer la machine.

## Diagnostic

Le run cancellé à 4% / 5h44 montre :
- 388 fichiers mutables (`src/**/*.ts` after exclusions)
- 18 044 mutants
- 1693 timeouts à 30s = ~14h de pure attente déjà consommée
- Workers qui crashent sur `daily-chat-limit.middleware.ts:122/127` (TypeError on undefined `current`)
- Watchman recrawl 39× → instabilité supplémentaire
- Cache incremental `reports/stryker-incremental.json` (2.1 MB) git-tracked, déjà committé une fois

Bottleneck principal = timeouts (par extrapolation ~350h sur le run complet).

## Décisions

| # | Décision | Justification |
|---|----------|---------------|
| 1 | Stratégie A+B parallèles : baseline tight (1 nuit) puis chunks par module | Compromis vitesse banking-grade + couverture full graduelle |
| 2 | `timeoutMS: 30000 → 10000` | Baseline test = 14ms moyen, 30s ridicule. Timeout = killed dans Stryker, pas de risque score |
| 3 | `concurrency: 8 → 6` local | Garde 2 cores libres pour Claude/IDE pendant les chunks |
| 4 | Fix `daily-chat-limit.middleware.ts` nullish guard | Mutants exposent un vrai bug du code (pas trou de test) |
| 5 | Watchman : `watch-del` + ajouter `.stryker-tmp` à `.watchmanconfig` ignore_dirs | Stoppe le recrawl 39× |
| 6 | `mutate:` config inchangé (full `src/**`) | Le scoping se fait au CLI via `--mutate`, le full report reste accumulé |
| 7 | Cache incremental reste git-tracked, commit progressif après chaque chunk | Progrès visible en review, rebuild zero-cost |

## Phase 1 — Quick wins (single commit, ~30 min)

1. `.watchmanconfig` ignore_dirs : `.stryker-tmp`, `node_modules`, `dist`
2. `watchman watch-del '/Users/Tim/Desktop/all/dev/Pro/InnovMind' && watchman watch-project ...`
3. `museum-backend/stryker/config.mjs` : `timeoutMS: 10000`, `concurrency: process.env.CI === 'true' ? 4 : 6`
4. `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts:122,127` : guard nullish sur `current` avant déréférencement
5. Vérifier que les tests existants passent toujours (le fix ne doit pas régresser)
6. Commit : `chore(mutation): tighten timeout, fix nullish guard, watchman config`

## Phase 2 — Baseline tight (1 nuit, 3-5h)

Ajouter script `pnpm mutation:baseline` avec scope réduit aux hot files banking-grade :

```
src/modules/auth/**/*.ts
src/shared/security/**/*.ts
src/shared/audit/**/*.ts
src/helpers/middleware/**/*.ts
src/shared/observability/**/*.ts
```

~50-60 fichiers, ~3 000 mutants estimés. ETA 3-5h.

Workflow :
- Lancer le soir, regarder `tail -f stryker.log` au réveil
- Analyser report HTML : top 20 survivors par fichier
- Renforcer tests (factories obligatoires, jamais inline)
- Commit batch tests + cache incremental
- Target kill-ratio **≥ 80%** sur ce subset

## Phase 3 — Chunks par module (12 sessions ~1-2h)

Ordre par priorité décroissante (hot first) :

| # | Scope | Mutants estimés | Session |
|---|-------|----------------|---------|
| 1 | `src/shared/queue/**` | ~800 | ~1h |
| 2 | `src/shared/cache/**` | ~400 | ~30 min |
| 3 | `src/shared/email/**` | ~600 | ~45 min |
| 4 | `src/shared/http/**` | ~500 | ~40 min |
| 5 | `src/modules/chat/**` | ~3500 | 2× ~1.5h (split conversational vs guardrails) |
| 6 | `src/modules/admin/**` | ~1500 | ~1h |
| 7 | `src/modules/museum/**` | ~1200 | ~1h |
| 8 | `src/modules/daily-art/**` | ~800 | ~45 min |
| 9 | `src/modules/review/**` | ~600 | ~40 min |
| 10 | `src/modules/support/**` | ~500 | ~30 min |
| 11 | `src/modules/knowledge-extraction/**` | ~1000 | ~50 min |
| 12 | `src/shared/utils/**` + reste | ~2000 | ~1.5h |

Estimations basées sur ~5 mutants/ligne moyenne post-fix timeout.

À chaque chunk :
```bash
pnpm stryker run --mutate "src/<scope>/**/*.ts"
```
(no `--force` → incremental kicks in pour les hors-scope)

Workflow par chunk :
1. Run scoped
2. Analyser top survivors du scope
3. Renforcer tests (DRY factories obligatoires)
4. `pnpm test -- --testPathPattern="<patterns>"` green
5. `pnpm lint` 0 errors
6. Commit single batch : tests + `reports/stryker-incremental.json`
7. Pause / autre boulot, reprendre plus tard

## Phase 4 — Maintenance

Avant de fermer la dette :
- Workflow CI sur PRs : `pnpm stryker run --since main` (ou `--mutate <git-diff>`)
- `thresholds.break: 70 → 75` après Phase 3 ; `→ 80` après stabilisation
- Documenter dans `CLAUDE.md` la commande chunked pour devs futurs

## Critères de succès

- [ ] Aucun run > 5h sans machine disponible (sessions chunkées)
- [ ] Kill-ratio backend ≥ 80% sur banking-grade (post Phase 2)
- [ ] Kill-ratio backend ≥ 70% global (post Phase 3)
- [ ] Cache `reports/stryker-incremental.json` versionné, ré-utilisable
- [ ] CI bloque PRs qui dégradent le kill-ratio (post Phase 4)

## Risques

| Risque | Mitigation |
|--------|------------|
| Cache grossit (2MB → 10-15MB) | Acceptable, git supporte ; si > 50MB envisager git-lfs |
| Refactor majeur invalide cache | `--force` ciblé sur le scope concerné, le reste reste valide |
| `timeoutMS: 10s` masque survivors lents | Monitorer Phase 2, remonter si > 5% timeouts douteux |
| Phase 3 prend > 2 semaines | Acceptable, V1 launch 2026-06-01 — banking-grade couvert dès Phase 2 |
| Kill-ratio < 80% sur baseline | Itérer Phase 2 avant d'attaquer Phase 3 |

## Anti-patterns à éviter

- **Pas de `--force` non scopé** sur la totalité — annule l'intérêt du cache
- **Pas de modif `mutate:` config** pour scoper — tout passe par le CLI `--mutate`
- **Pas d'inline test entities** dans les renforcements — toujours factories `tests/helpers/<module>/<entity>.fixtures.ts`
- **Pas de `eslint-disable`** dans les nouveaux tests sans justification ≥20 chars + Approved-by

## Références

- [Stryker Incremental docs](https://stryker-mutator.io/docs/stryker-js/incremental/)
- [Stryker --mutate scoping](https://stryker-mutator.io/docs/stryker-js/configuration/#mutate-string)
- [Announcing StrykerJS incremental mode](https://stryker-mutator.io/blog/announcing-incremental-mode/)
- Cache existant : `museum-backend/reports/stryker-incremental.json` (2.1 MB)
- Config : `museum-backend/stryker/config.mjs`
