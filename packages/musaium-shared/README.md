# @musaium/shared

Cross-app sentry-scrubber + observability primitives for the Musaium monorepo.

**Status**: live (v0.2.0). Wired into all three apps as a `file:` dependency.

## Surface

The package exports a single sub-path. (The v0.1.0 scaffold sub-paths
`./geo`, `./validation`, `./i18n`, `./errors`, `./auth` were phantom — 0 consumers —
and were culled in v0.2.0 along with their `src/` dirs. See `CHANGELOG.md`.)

| Subpath | Exports | Notes |
| --- | --- | --- |
| `.` (root barrel) | re-exports `./observability` | `museum-backend` consumes via this barrel. |
| `./observability` | sentry-scrubber primitives + types | The only live surface. |

`package.json` `exports` map: `.` + `./observability` only.

## Live consumers (3)

- `museum-backend/src/shared/observability/sentry-scrubber.ts` — via the root barrel (`@musaium/shared`).
- `museum-frontend/shared/observability/sentry-scrubber.ts` — via the path-style import (`@musaium/shared/observability`).
- `museum-web/src/lib/sentry-scrubber.ts` — via the path-style import.

## Wiring — `file:` package, not a pnpm workspace

There is **no `pnpm-workspace.yaml`** at the repo root. The three apps each declare
`"@musaium/shared": "file:../packages/musaium-shared"` in their manifest (revert
of the earlier workspace experiment, commit `641968ea4`).

Consequence: after a `git pull` that touches `packages/musaium-shared/` or an app
manifest, you MUST re-run `pnpm install` / `npm install` in **each** affected app
to re-materialize `node_modules/@musaium/shared`, otherwise `pnpm build` fails on
`Module not found: @musaium/shared/observability`.

Guard-rails (2026-05-14):

- `pnpm bootstrap` (root) re-installs the three apps in sequence.
- `scripts/sentinels/workspace-links.mjs` detects broken symlinks (exit 1 + fix command).
- Husky `post-merge` hook warns automatically after `git pull`.
- Pre-commit Gate 6 blocks if a staged diff touches `packages/**` or `museum-*/package.json` with broken symlinks.

See CLAUDE.md § "Pièges connus" → `@musaium/shared` bullet for the full gotcha.

## Build & test

```bash
pnpm build       # rm -rf dist && tsc
pnpm test        # node --test on src/observability/*.test.ts
pnpm typecheck   # tsc --noEmit
```

## History

See `CHANGELOG.md`. The 3-copy Sentry scrubber extraction tracked under ADR-045.
