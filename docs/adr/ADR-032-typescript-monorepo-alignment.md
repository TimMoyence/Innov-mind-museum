# ADR-032 — TypeScript version alignment across the monorepo

- **Status** : Accepted (2026-05-05)
- **Ticket** : SPRINT_2026-05-05_PLAN.md task C / web-version-harmonize-roadmap-2026-05-05
- **Supersedes** : N/A
- **Amends** : N/A

## Context

The 3 monorepo apps had drifted on TypeScript major:

| App | Pin | Notes |
|---|---|---|
| `museum-backend` | `^5.9.3` | Pinned during the SWC-jest swap (Phase 11 Sprint 11.2). Stable. |
| `museum-frontend` | `~5.9.2` | Tilde-pinned for RN type-safety predictability. Stable. |
| `museum-web` | **`^6.0.3`** | Caret-bumped via Renovate auto-merge on the same week TS 6.0 landed. |

TypeScript 6.0 shipped in early 2026 and brings:

- Stage-3 decorators with metadata reflection (already opt-in).
- Stricter `--exactOptionalPropertyTypes` reporting on inferred narrowings.
- New `--isolatedDeclarations` enforcement cycle.
- `using` / `await using` syntax stable (was already preview in 5.x).

None of those features are consumed by `museum-web/src/**`:

- No stage-3 decorators (`grep -rn '@\w*(' museum-web/src/`: only test framework imports).
- No `using` / `await using` resource management.
- `tsconfig.json` does not enable `exactOptionalPropertyTypes` nor `isolatedDeclarations`.
- The Next.js 15 type plumbing (`@types/node ^22`, `@types/react ^19.1`) supports both 5.9 and 6.0.

The cost of the drift:

1. **Cognitive overhead** — three engineers, three TS versions; `tsserver` behavior differs (especially around `Element.textContent` null-narrowing — observed during the Landing\* refactor: TS 6 narrowed it to `string`, TS 5 keeps `string | null` for Element).
2. **CI feedback loop** — the same code that compiles in `museum-web` may fail in `museum-backend` or `museum-frontend` when shared types eventually move into a `tools/` package.
3. **Renovate noise** — version unification clarifies the auto-merge rules.

## Decision

`museum-web/package.json` downgrades TypeScript from `^6.0.3` to `~5.9.3`, matching `museum-backend`. The `museum-frontend` `~5.9.2` stays tilde-pinned (its lowest tested version is `5.9.2`); the three apps are now in the same minor cadence (`5.9.x`).

The TS 6.0 evaluation is deferred to **2026-Q4** (≈6 months from this ADR), once the broader ecosystem (typescript-eslint, ts-jest equivalents, Next.js typegen, openapi-typescript codegen) has shipped a stable 6.x compat track and the migration cost is amortized across the three apps simultaneously.

## Consequences

**Positives** :

- Single TS major (5.9) across the three apps. `tsserver` behavior stable.
- The `Element.textContent` `string | null` narrowing returns to its standard DOM lib shape — code paths assuming nullability work in all three apps without per-app branching.
- Renovate config unchanged (caret + tilde patterns preserved app-by-app), but the diff between BE/FE/Web pin lines is now ≤ a patch version delta.
- Lockfile cost for the bump: 0 new top-level deps; only the `typescript` dev dep changes resolution. `pnpm install` reuses the existing 5.9.3 entry already in the BE side of the workspace.

**Négatives / risques** :

- Potential loss of any incidental TS 6.0 type-narrowing improvement that silently helped `museum-web/` source. Mitigation: `pnpm lint` (which runs `tsc --noEmit`) is green at 5.9.3 right after the bump (verified 2026-05-05).
- TS 6.0 may have caught a future bug that 5.9 will not. Mitigation: re-evaluation date 2026-Q4.

**Neutres** :

- typescript-eslint stays pinned `^8.58.2` (compat both 5.9 and 6.0).
- No `tsconfig.json` change required — current config (`target: ES2017`, `module: esnext`, `moduleResolution: bundler`) compiles identically on 5.9 and 6.0.

## Verification protocol

Before merging the bump:

1. `cd museum-web && pnpm install --prefer-offline` — lockfile resolves to TS 5.9.3.
2. `pnpm lint` — eslint + `tsc --noEmit` PASS.
3. `pnpm test` — Vitest 230 / 230 PASS.
4. CI Playwright + Lighthouse jobs MUST stay green on the PR.

Verified 2026-05-05 on `cleanup/web` branch:

- ESLint clean (0 errors, baseline warnings only).
- `tsc --noEmit` exit 0 under TS 5.9.3.
- Vitest 230 / 230 PASS.

## Re-evaluation trigger (Q4-2026)

Re-open this ADR when **all three** of the following are true:

1. Renovate dashboard reports `typescript@6.x` available with no blockers.
2. typescript-eslint maintainers post an explicit "TS 6 supported" line in their compat matrix (https://typescript-eslint.io).
3. At least one of the BE / FE / Web apps has a concrete TS 6 feature dependency (e.g. `using` adopted in a use case for a real bug, or stage-3 decorators consumed by a runtime library upgrade).

If those three converge, run a single coordinated bump on a dedicated `chore/ts-6-monorepo` branch with a fresh ADR superseding this one.

## References

- ROADMAP_TEAM.md (auto-consolidation pattern)
- SPRINT_2026-05-05_PLAN.md task C
- TypeScript 6.0 release notes (consult at re-evaluation time)
- typescript-eslint compatibility matrix (consult at re-evaluation time)
