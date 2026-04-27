# Operations Runbooks

This directory holds the operator playbooks. Each file documents a single
incident class or recurring task, with explicit steps, exit-code semantics,
and a clear "when does this fire" trigger.

| Runbook | Trigger | Cadence |
|---|---|---|
| [`auto-rollback.md`](auto-rollback.md) | Deploy or smoke test fails in CI | On-demand (CI invokes) + 90-day drill on staging |
| [`redis-rotation.md`](redis-rotation.md) | Quarterly cron (`redis-rotation-reminder.yml`) or credential exposure | Every 90 days |
| [`V1_FALLBACKS.md`](V1_FALLBACKS.md) | Operator-side substitutes for the dormant V2 workflows (backups, TLS, breach timer) | Daily/weekly until V2 activated |

## Adding a new runbook

1. One file per incident class. Don't bundle "all DB stuff" or "all auth
   stuff" — the operator needs to land directly on the page that solves
   their current problem.
2. Open with a "When this fires" section so the operator knows in 5 seconds
   whether they hit the right page.
3. Document exit codes and side effects of any script you reference. The
   on-call should not need to read the script itself to know what 0 / 42 /
   etc. mean.
4. End with a "Drill cadence" or "Verification" section — a runbook that
   isn't periodically rehearsed becomes wishful thinking.

## V1 / V2 distinction

V1 = pre-launch, single operator, < 100 users.
V2 = paying users, SLA in effect, automated workflows enabled.

Several workflows are committed to `.github/workflows/` but disabled
(`gh workflow list --all` shows them as disabled). The fallback procedure
for each lives in [`V1_FALLBACKS.md`](V1_FALLBACKS.md). The activation
checklist is at the bottom of that same file.
