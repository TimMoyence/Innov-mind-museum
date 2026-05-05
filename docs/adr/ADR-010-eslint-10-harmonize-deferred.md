# ADR-010 — ESLint 10 harmonization across the monorepo: deferred

- **Status:** Accepted (re-confirmed 2026-05-05)
- **Date:** 2026-04-24 · re-confirmed 2026-05-05
- **Deciders:** Backend + mobile audit consolidation (sprint S16) · re-confirmation web sprint 2026-05-05
- **Supersedes:** N/A

## Context

The 2026-04-24 enterprise audit flagged an ESLint version split:

- `museum-backend/` — `eslint ^10.2.0`
- `museum-frontend/` — `eslint ^9.39.4`
- `museum-web/` — `eslint ^9.39.4`

ESLint 10 (released Feb 2026) drops the legacy `.eslintrc.*` configuration format entirely and changes parts of the rule `context` API. Flat config (`eslint.config.mjs`) is now universal — all three apps already use flat config, so structurally harmonization looks trivial.

We attempted the bump on the mobile app in sprint S16:

```
npm install eslint@^10.2.0 --save-dev
npm run lint
```

Immediate failure:

```
TypeError: Error while loading rule 'react/display-name':
           contextOrFilename.getFilename is not a function
    at resolveBasedir (node_modules/eslint-plugin-react/lib/util/version.js:31:100)
```

Root cause: `eslint-plugin-react ^7.37.5` still reads `context.getFilename()` via the legacy rule-context shape that ESLint 10 removed. The plugin has an open upstream fix but no released version compatible with v10 as of this date.

The mobile app depends on:

- `eslint-plugin-react ^7.37.5`
- `eslint-plugin-react-native ^5.0.0` (declares peer range `… || ^9`, does not yet advertise v10 support)
- `eslint-plugin-react-hooks ^7.0.1`

The web app has the same `eslint-plugin-react` dependency.

## Decision

**Keep `eslint ^9.39.4` on mobile + web; keep `eslint ^10.2.0` on backend.** Revert the mobile bump attempted in S16.

The backend is pure TypeScript and uses `typescript-eslint` + backend-specific plugins (`eslint-plugin-boundaries`, `eslint-plugin-import-x`, `eslint-plugin-sonarjs`) that all declare ESLint 10 peer support. Backend stays on v10.

Mobile + web stay on v9 until `eslint-plugin-react` (and downstream `eslint-plugin-react-native`) ship a release that adopts the v10 rule-context API. Attempting to pin `contextOrFilename.getFilename` ourselves via a local patch would add maintenance burden for a P3 consistency benefit.

## Consequences

- We accept that monorepo developers see two ESLint majors installed across workspaces. Editor integrations (VSCode ESLint, JetBrains IDE inspection) must resolve per-workspace.
- CI gates are workspace-scoped already (`ci-cd-backend.yml`, `ci-cd-mobile.yml`, `ci-cd-web.yml`), so no cross-workspace lint run is blocked.
- Shared lint rules written for v9 continue to work on v10 backend because typescript-eslint 8.x targets both.
- When `eslint-plugin-react ≥ 8` (v10-compatible) ships, this ADR becomes actionable:
  1. `cd museum-frontend && npm install eslint@^10 eslint-plugin-react@next`.
  2. `cd museum-web && npm install eslint@^10 eslint-plugin-react@next`.
  3. `npm run lint` in each app; fix the handful of new messages ESLint 10 surfaces (mostly JSX reference-tracking corrections per the v10 release notes).

## Related

- ESLint 10 migration guide: <https://eslint.org/docs/latest/use/migrate-to-10.0.0>
- `eslint-plugin-react` tracking issue for v10 support (upstream).
- Audit report 2026-04-24 — item P1-13 "ESLint 9 vs 10 monorepo consistency" reclassified P3.

## Re-confirmation 2026-05-05

Verified against the npm registry on 2026-05-05:

```
$ npm view eslint-plugin-react version
7.37.5
$ npm view eslint-plugin-react peerDependencies
{ eslint: '^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7' }
```

`eslint-plugin-react@7.37.5` is still the only published release (since 2025-04-03) — no v10-compatible version has shipped in 13 months. The peer range still tops out at `^9.7`, confirming the `contextOrFilename.getFilename` blocker documented in the original Context section is unresolved upstream.

**Decision restated:** keep `eslint ^9.39.4` on mobile + web, `eslint ^10.2.0` on backend. The next check-in is **2026-Q4** (post-launch); revisit only if upstream ships a v10-compatible release in the interim. Memo to Renovate: keep `eslint-plugin-react` on auto-merge but block the parent `eslint` major from bumping past 9 on mobile + web until this ADR is superseded.
