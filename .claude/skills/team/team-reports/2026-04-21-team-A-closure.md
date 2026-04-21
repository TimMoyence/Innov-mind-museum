# Team A — Inventory closure report

**Date**: 2026-04-21
**Source audit**: [`working/2026-04-20-security-audit/team-A-inventory.md`](working/2026-04-20-security-audit/team-A-inventory.md)
**Plan executed**: [`~/.claude/plans/audit-enterprise-challenge-et-concurrent-coral.md`](../../../../.claude/plans/)
**Scope**: strict — Team A (structure / docs / inventory). Team B / C / D left out of scope.

---

## Score progression

| Date | Score | Notes |
|---|---|---|
| 2026-04-20 (original audit) | **5.5/10** | Bloated docs, dup `.claude/team-*`, new.md, etc. |
| 2026-04-21 (pre-plan, after silent cleanup) | **7.0/10** | 8 obsolete items already deleted between audit and plan |
| 2026-04-21 (post-plan) | **10/10** ✅ | All 9 gates PASS |

---

## Challenge pass — what changed vs audit claims

**Falsified by challenge** (already resolved, audit was stale):
- `/new.md`, `/app.json`, `/package-lock.json`, `docs/prompts/`, `.claude/skills/generated/`, `.claude/skills/team/SKILL.md.v2.bak`, `tmp/uploads/`, triple-duplicated `.claude/team-*` root dirs — all gone.

**Confirmed and fixed** (this run):
- T1 — AGENTS.md: 117L → 15L (GitNexus block removed, pointer only)
- T2 — DOCS_INDEX.md: **15 dead links** actually (audit saw 3 — 12 extra PLAN_01..12 refs to files archived under `docs/archive/plans-2026-04-17/` were missed). All re-pointed; new `scripts/check-docs-links.cjs` verifies.
- T3 — Out-of-repo plan dependency: imported `~/.claude/plans/generic-squishing-manatee.md` → `docs/plans/MASTER_PLAN.md` (170L, 8 phases, cross-validated audit). Also updated 3 ADRs that referenced the same out-of-repo path.
- T4 — FEATURE_KNOWLEDGE_BASE_WIKIDATA.md: "(feature-flagged)" → "(always-on since 2026-04-19, feature flags removed)".
- T5 — README.md: 2 SSE mentions qualified "deprecated — see ADR-001".
- T6 — PRODUCT_STATE_OVERVIEW.md: 7 workflows → 8 (added `ci-cd-llm-guard.yml` row).
- T7 — team-reports canon: 2 READMEs created (archive at `/team-reports/`, runtime at `.claude/skills/team/team-reports/`), lifecycle section added to CLAUDE.md, `.gitignore` exempts `team-reports/README.md`.
- T8 — Museum Walk cross-link: spec ↔ sprint roadmap now reciprocate.
- T9 — `.DS_Store`: `.gitignore` already covers it (lines 43 + 120). Physical local file still present — rm was denied by sandbox, harmless since git-ignored.

**Scope creep (legitimate, fixed in-run)**:
- 12 extra dead links in DOCS_INDEX.md (PLAN_01..12)
- 3 ADRs (ADR-002/003/004) carrying the same out-of-repo plan path
- `PRODUCT_STATE_OVERVIEW.md:66` "API key auth B2B (feature-flagged)" — verified real flag `FEATURE_FLAG_API_KEYS` in `museum-backend/src/config/env.ts:275`. NOT a finding, factual statement kept.
- `docs/archive/**` mentions of "feature-flagged" / "7 workflows" — intentionally left (archives are snapshots, not live docs).

---

## Gate results (2026-04-21 final)

| # | Gate | Command | Result |
|---|---|---|---|
| 1 | Docs links resolve | `node scripts/check-docs-links.cjs` | **OK** — all resolve |
| 2 | No /Users/ paths in live docs | grep excl. `docs/archive/` | **OK** |
| 3 | No obsolete feature-flagged in live docs | grep excl. archive + real flags | **OK** |
| 4 | No "7 workflows" in live docs | grep excl. archive | **OK** |
| 5 | SSE always qualified in README | grep | **OK** |
| 6 | AGENTS.md ≤ 20 lines | `wc -l` | **OK** (15 lines) |
| 7 | Two team-reports READMEs | `test -f` | **OK** |
| 8 | DOCS_INDEX no stale refs | grep SPRINT_[45] / V2_MUSEUM_WALK | **OK** |
| 9 | Mutual cross-links walk docs | head -10 grep | **OK** |

---

## Files modified / created

Modified:
- `AGENTS.md` (117 → 15 lines)
- `README.md` (2 SSE qualifications)
- `docs/DOCS_INDEX.md` (3+12 dead links fixed)
- `docs/ROADMAP_ACTIVE.md` (1 path fixed)
- `docs/plans/README.md` (2 paths fixed, re-scoped)
- `docs/FEATURE_KNOWLEDGE_BASE_WIKIDATA.md` (L3)
- `docs/PRODUCT_STATE_OVERVIEW.md` (7→8 workflows + llm-guard row)
- `docs/FEATURE_MUSEUM_WALK.md` (cross-link)
- `docs/walk/ROADMAP.md` (cross-link)
- `docs/adr/ADR-002-typeorm-1-0-mitigation.md` (path fix)
- `docs/adr/ADR-003-auth-route-split-deferred.md` (path fix)
- `docs/adr/ADR-004-ios26-a18pro-crash-watch.md` (path fix)
- `CLAUDE.md` (new section "Team reports lifecycle")
- `.gitignore` (exempt `!team-reports/README.md`)

Created:
- `docs/plans/MASTER_PLAN.md` (imported out-of-repo enterprise audit)
- `scripts/check-docs-links.cjs` (link checker)
- `team-reports/README.md` (archive policy)
- `.claude/skills/team/team-reports/README.md` (runtime policy)

---

## Remaining manual items (for tech lead)

- **`.DS_Store`** physical file at repo root: `rm .DS_Store` (sandbox denied it during this run; harmless, git-ignored).
- Commit suggested: `chore(docs): enterprise-grade structure cleanup — audit Team A 5.5 → 10/10` (scope: docs + .gitignore + scripts + .claude only, zero code change).

---

## Out of scope (for other plans)

- Team B (wiring / orphelins): next plan should cover `startPoolMonitor` orphan + SSE routes BE cleanup.
- Team C (features): next plan should cover KE producer trigger confirmation + FE `@deprecated` runtime cleanup.
- Team D (security + code quality): urgent — supply-chain museum-web (`typescript@6`, `vite@8`, `vitest@4`, `@next/eslint-plugin-next@16`), art-topic guardrail Cyrillic bypass, HTML scraper DNS-rebinding post-redirect, 305 `as unknown as` eradication.

These three remain treatable in **separate plans**. This closure only certifies **Team A / structure / docs 10/10**.
