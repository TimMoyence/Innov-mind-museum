---
runId: 2026-05-10-pr-255-c2-c3-rbac-ci-fixes
mode: hotfix
pipeline: micro
completedAt: 2026-05-10T21:36:54Z
durationMs: _no data captured_
correctiveLoops: 4
costUSD: _no data captured_
tags:
  - hotfix
  - micro
  - ci
  - rbac
  - nginx
  - ops
  - manual-entry
---

## Trigger

Tim demanded "ça marche" — admin endpoints returning 403 in prod despite `super_admin` role + Grafana iframe 404'ing. Hotfix bundled with the C2/C3 work that was already on branch `C2-Image-chat`. Run was executed without invoking `/team` (no RUN_ID, no Spec Kit, no agents) — direct fix-merge cycle by Tech Lead. This lesson is a manual post-merge entry.

## What worked

- **Diagnostic isolation before fix.** Two distinct root causes (RBAC middleware + nginx variable-form proxy_pass) both surfaced from one symptom ("403 + 404 on /admin"). Reading the `requireRole` source and the `super-admin-check` route in parallel surfaced the doc/code drift in <2 min.
- **Centralized escalation in `requireRole`** vs. patching all 13 call sites. Single point fix means a new admin endpoint cannot lock the platform owner out, and the doc in `user-role.ts` matches the code (was already documented, just not implemented).
- **Squash-merge style preserved.** Project history shows squash merges per PR; the merge commit `f2c14c9e` keeps the bundle as one logical change with the full commit list documented in the PR body for archaeology.
- **Required-checks audit before declaring readiness.** `gh api repos/.../branches/main/protection` revealed `prebuild` is non-blocking — could have merged earlier without waiting for it. Useful gate for future loops.

## What failed

- **CI required 3 push iterations to go fully green.** Each iteration discovered a new gap because the local repo + CI environment + production VPS state are not aligned by any automated check. Pattern of failures:
  1. Branch was 1 commit behind `origin/main` → merge conflicts on first PR submission.
  2. After merging main: tier-baseline cap test, semgrep escapeHtml, i18n locales, sentinel as-any, pgvector image — all surfaced one-by-one because there's no pre-PR script that runs the same gates as CI.
  3. After fixing those: BullMQ Redis service missing (CI workflow had been written when backend was Redis-optional).
  4. After Redis: `/health` vs `/api/health` URL — workflow had wrong path that never worked, masked by other earlier failures.
- **Live nginx site.conf is operator-owned and drifts from `infra/nginx/conf.d/grafana.conf` reference.** The reference was updated in this PR but nothing enforces parity with the deployed file. Next operator might re-introduce the rewrite-with-variable-proxy-pass bug.

## Surprises

- **Variable-form `proxy_pass` silently ignores `rewrite`.** nginx behaviour, not documented in our gotchas. Auth_request subrequest received raw `/grafana-auth-check` path (404 from backend) → translated into HTTP 500 to the client, which looked like a backend bug. Cost ~30 min of investigation. Now in CLAUDE.md gotchas + memory `feedback_nginx_variable_proxy_pass.md`.
- **`pnpm dev` boots BullMQ eagerly even with `CACHE_ENABLED=false`.** Audit-cron and museum-enrichment-queue queues instantiate `new Queue()` regardless of the cache flag, so any CI workflow running `pnpm dev` requires Redis even when the test scenario doesn't. Discovered by promptfoo failing with `ECONNREFUSED :6379` after the pgvector fix.
- **Health probe URL was wrong since day 1.** `ci-cd-promptfoo.yml` polled `/health` while the apiRouter mounts at `/api`. The probe always 404'd; previous failures (cache-enabled assumption, postgres image) just happened to time out before hitting the URL bug. The Redis fix exposed it because the backend now actually started, so the probe loop reached the URL check.

## Action items

- [ ] Add a pre-PR script `scripts/pre-pr-check.sh` that runs the full set of CI gates locally: i18n completeness, tier-signature sentinel, as-any ratchet, semgrep, lint, typecheck, scoped tests. One command, same exit codes as CI. Avoids the 3-iteration loop pattern.
- [ ] Add a CI invariants test that enforces: any GHA workflow running `pnpm dev` declares a `redis` service, any workflow running `pnpm migration:run` uses `pgvector/pgvector:pg16` postgres image. Repo-level lint, not per-file fix.
- [ ] Audit all `infra/nginx/conf.d/*.conf` reference files for `rewrite` + variable-form `proxy_pass` pairs. None should coexist. Document the gotcha in `docs/OPS_DEPLOYMENT.md` if not already.
- [ ] Promote `feedback_ci_service_requirements.md` lessons to `team-protocols/quality-gates.md` if they recur on the next 2 PRs (signal of systemic issue, not a one-off).
- [ ] Consider adding the live-vs-reference nginx parity check as a manual ops checklist item in `docs/OPS_DEPLOYMENT.md` — operator runs `diff /etc/nginx/conf.d/site.conf <(scp from infra/nginx/conf.d/)` weekly. Won't auto-deploy (security trade-off documented) but at least drift becomes visible.
