---
runId: 2026-05-15-td11-express-types-pin-removal
mode: refactor
pipeline: enterprise
completedAt: 2026-05-15T18:00:00Z
durationMs: 1800000
correctiveLoops: 0
costUSD: 5.01
tags:
  - refactor
  - enterprise
  - pre-state
  - confirmed
  - museum-backend
---

# Lesson — 2026-05-15-td11-express-types-pin-removal

## Trigger

- **Pin pre-state confirmed** : `museum-backend/package.json:71` contient `"@types/express-serve-static-core": "5.0.6"` dans le bloc `pnpm.overrides` (4 keys au total : langsmith, protobufjs, handlebars, fast-uri, uuid + le pin à supprimer). Verbatim grep avant édit, conforme estimate du tracker.
- **Surprise de résolution** : retirer simplement la clé override ne suffit PAS — `@types/express@5.0.1` déclare `@types/express-serve-static-core: ^5.0.0` qui matche déjà 5.0.6 dans le lockfile. pnpm garde 5.0.6 par défaut. Solution : déclarer `@types/express-serve-static-core: ^5.1.1` en `devDependencies` directe pour forcer le bump.
- **Compte réel d'erreurs après bump** : 28 erreurs `TS2322` / `TS2345` (tracker disait "27+", estimate juste). Distribution sur 11 fichiers `*.route.ts` :
  - admin-ke (2), admin (4), cache-purge (1), auth-api-keys (1), consent (1), chat-media (8), chat-message (1), chat-session (2), low-data-pack (1), museum (4), support (2).
- **Site bonus découvert au lint** : `rate-limit.middleware.ts:189` (`bySession`) interpole `req.params.id` dans un template literal — pas un `TS2322` (eslint-disable masquait l'erreur) mais ESLint `restrict-template-expressions` flag après le bump. Ajouté au codemod.
- **Décision pin** : SUPPRESSION (memory `feedback_bury_dead_code` — pas de pin obsolète qui zombie). Override = clé `@types/express-serve-static-core` retirée intégralement, lockfile re-résolu via ajout direct en devDep.

## What worked

_no data captured_

## What failed

_no data captured_

## Surprises

**Files modified** (13 total) :
- `museum-backend/package.json` — suppression `pnpm.overrides."@types/express-serve-static-core"`, ajout `devDependencies."@types/express-serve-static-core": "^5.1.1"` (via `pnpm add -D`).
- `museum-backend/pnpm-lock.yaml` — re-résolution lockfile, 5.0.6 → 5.1.1 (lignes 1964, 7293, 7303).
- `museum-backend/src/shared/middleware/parseStringParam.ts` — créé (16 lignes).
- `museum-backend/src/shared/middleware/rate-limit.middleware.ts` — `bySession` consomme `parseStringParam(req, 'id')` au lieu de `req.params.id`, retire le eslint-disable obsolète.
- 11 routes patchées : `admin-ke.route.ts`, `admin.route.ts`, `cache-purge.route.ts`, `auth-api-keys.route.ts`, `consent.route.ts`, `chat-media.route.ts`, `chat-message.route.ts`, `chat-session.route.ts`, `low-data-pack.route.ts`, `museum.route.ts`, `support.route.ts`.
- `docs/TECH_DEBT.md` — TD-11 coché [x] + closure note 6 points.

**Gates passed inline** :
- `pnpm install` : OK (1093 packages resolved, lockfile updated).
- `npx tsc --noEmit` final : exit 0, 0 lignes stderr/stdout.
- `pnpm lint` final : exit 0 (eslint src/ + lint:test-discipline + tsc --noEmit, 0 warnings après factorisation des 2 strings dupliqués via constantes locales `MESSAGE_ID_REQUIRED` et `INVALID_MUSEUM_ID`).
- `pnpm test --silent` final : `Test Suites: 14 skipped, 407 passed, 407 of 421 total ; Tests: 93 skipped, 5404 passed, 5497 total` en 196.39s, 0 fail.

**Notes** :
- Stage-only mode respecté : aucun commit créé.
- Stryker WIP files non touchés (admin-analytics-queries.mutants.test.ts, searchMuseums.mutants.test.ts, stryker/* hors scope).
- Loop corrective utilisé : 1 (passe lint a remonté 3 warnings après codemod initial — duplicate-strings sonarjs + 1 template literal restant dans rate-limit.middleware.ts. Fix : 2 constantes factorisées + helper appliqué à `bySession`. Re-run lint = clean).

## Action items

_no data captured_
