# ADR-046 — Zod 4 BE migration (deferred → SUPERSEDED 2026-05-12)

- **Status** : **SUPERSEDED 2026-05-12** — the migration shipped in the same sprint that created this stub (commit `f3d25317 chore(backend,zod): bump zod ^3.25.76 → ^4.4.1 — align with FE`).
- **Original status** : Deferred
- **Owner** : backend
- **Created** : 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12)
- **Superseded by** : commit `f3d25317` (2026-05-12)

## Historical note

This ADR was authored as a discoverable V1.1 backlog stub on the assumption that the BE zod 3 → 4 migration would defer to 2026-Q4 (per ADR-033). During the same cleanup sprint, agent B (B.8 task) executed the migration ahead of schedule — both BE and FE now run zod ^4.4.1, aligning the monorepo on a single zod major.

The stub is retained for trace continuity: future readers landing on a "zod migration deferred" reference (e.g. in DOCS_INDEX or ROADMAP) can find the resolution here.

## What replaced this

- `museum-backend/package.json` now pins `zod ^4.4.1`.
- ADR-033 marked Superseded (same commit).
- Cross-app contracts remain OpenAPI (no shared `tools/schemas/` workspace package introduced).

## References

- ADR-033 (historical decision, now superseded).
- Commit `f3d25317` (2026-05-12) — the actual migration.
