# Sentry P0 triage — pre-V1 zero-P0 gate

**Audience:** Musaium founder (sole Sentry org owner + acting on-call).
**Goal:** Drive open P0 (highest-severity) Sentry issues to **zero** before feature freeze at 2026-05-19 EOD, so V1 launch (2026-06-01) ships with no known critical regression.
**Source of truth for severity classification:** internal Sentry triage rubric (below §3) — aligned with [`docs/operations/VDP_RUNBOOK.md`](./VDP_RUNBOOK.md) §3 step "Classify".
**Last updated:** 2026-05-17. **Audit run:** `2026-05-17-w4-compliance-ops-release` (cluster C, TC2 / C7.3).
**TL executes** — Sentry UI triage requires the org owner login + judgement on whether a given issue is fix-now or close-as-wontfix.

---

## 1. Pre-flight

| # | Check | Pass |
|---|---|---|
| 1 | Sentry org owner credentials in 1Password (`sentry:org-owner`) and TOTP works | Login succeeds |
| 2 | Sentry alerts route is `security@musaium.com` + Slack `#security` | Settings → Alerts panel |
| 3 | Release labels for `museum-backend@1.0.0-rc.*` and `museum-frontend@1.2.x` exist in Sentry | Releases page |
| 4 | Source maps uploaded for the mobile build under triage | Releases → file count > 0 |
| 5 | At least one Sentry P0 alert rule active (otherwise P0 issues never escalate) | Alerts → Issue Alerts |

If row 5 fails → that is itself a P0 of P0 (we can't see P0 events). Fix the alert rule before triage.

## 2. Triage query — find all P0

In Sentry global search (`/issues/?query=…`):

```
is:unresolved level:fatal level:error environment:[prod,production,store-release,test-flight]
```

Sort by **`last_seen` desc** first, then by **`event_count` desc**. Both signals matter — a low-count recent issue can be a regression in a new build; a high-count older issue is an accumulated production problem.

Apply **time filter = 90 d** (Sentry default is 14 d which hides chronic issues).

Export the resulting list as CSV via Sentry's "Export issues" → save to `team-state/2026-05-17-w4-compliance-ops-release/evidence/c7.3-p0-snapshot-pre.csv`.

## 3. Classification rubric

Per issue, decide **fix-now / close-wontfix / close-resolved-by-build** in ≤ 5 minutes. Hard time-box; if a single issue blocks > 5 min of triage, file it as P1 follow-up and move on.

| Verdict | Criteria | Action |
|---|---|---|
| **fix-now** | User-visible crash; data loss; security; affects ≥ 1 % of sessions in last 7 d; legal / compliance touch | Open a fix task in Linear or a GitHub issue. Assign to founder. Target patch within 48 h. |
| **close-resolved-by-build** | Reproducer no longer applies on `main`. Either fixed by an unrelated commit or by a dependency bump. Verify by re-attempting the repro path. | Mark Resolved in Sentry with comment "Resolved by build `<sha>` — verified no recurrence in last 24 h". |
| **close-wontfix** | Out of scope (e.g. user agent IE 11), accepted residual risk, third-party library noise we can't fix | Resolve with comment + add to `docs/SENTRY_KNOWN_NOISE.md` (create if needed) for future filter rules. |
| **escalate (P0-blocker)** | Crash on launch / first-screen; auth bypass; payment processing; loss of user data | STOP triage, file launch-blocker, escalate to TL within 1 h. |

> A "P0" Sentry issue must satisfy at least one of: `level:fatal` OR `is:crash` OR security-tagged. Lower severities (level:error without crash) are P1.

## 4. Workflow per issue

For each row of the CSV from §2:

1. Click the issue in Sentry. Read the **most recent event** (top of the events list, *not* the average).
2. Read the **stacktrace** and identify the topmost frame in our code (skip framework frames).
3. Use `gitnexus_context({name: "<topFrameFunctionName>"})` if you need callers/callees.
4. Look at the **release** the event belongs to. If release < HEAD of `main`, suspect "resolved by build".
5. Look at the **breadcrumbs** + tags (user role, session ID, locale). Reproduces a user pattern?
6. Decide verdict per §3 rubric.
7. Apply action in Sentry (assign / resolve / wontfix / ignore-until).
8. Comment on the issue with the verdict reason (FUTURE-PROOF: future-you will not remember why).
9. Tick the issue off the local CSV.

## 5. Done = ?

TC2 (C7.3) is closed when:

- [ ] Pre-flight 5/5 PASS captured here.
- [ ] Pre-triage CSV snapshot saved (`c7.3-p0-snapshot-pre.csv`).
- [ ] Every row in the CSV processed (verdict + Sentry action applied).
- [ ] Post-triage CSV snapshot saved (`c7.3-p0-snapshot-post.csv`) — must show 0 rows under the §2 query.
- [ ] `docs/SENTRY_KNOWN_NOISE.md` updated with any new `wontfix` entries.
- [ ] STORY.md `## verify — sentry-p0 — <ts>` section appended with the count delta (pre N → post 0).

**If post snapshot is NOT 0:** the V1 launch is GATED. Either fix the remaining issues by 2026-05-19 EOD or, if accepted residual risk, write an ADR and get explicit TL sign-off recorded in the PR.

## 6. Findings template

```markdown
## Sentry P0 triage — 2026-05-19

- Total issues at start of triage (matching §2 query): __
- Verdicts applied:
  - fix-now:                    __
  - close-resolved-by-build:    __
  - close-wontfix:              __
  - escalate (P0-blocker):      __
- Issues remaining unresolved (must be 0 to PASS gate): __
- Triage wall-clock: __ h __ min
- Surprises (unexpected severity / unexpected user pattern):
  - …
- Patterns to fix at the source (don't just close):
  - …
- New `wontfix` entries added to `docs/SENTRY_KNOWN_NOISE.md`:
  - …
- Launch-blocker filed? yes / no — file path: …
```

## 7. Recurrence prevention

After triage, schedule the post-launch cadence:

- **Daily** for the first 7 days post-launch: scan P0 issues at 09:00 UTC, triage same-day.
- **Weekly** thereafter: Monday 09:00 UTC, run the §2 query, ratchet count back to 0.
- **Per release**: every backend/mobile release tag, re-run §2 query within 24 h of deploy.

Document this cadence in [`docs/operations/VDP_RUNBOOK.md`](./VDP_RUNBOOK.md) §"Post-launch operational cadence" (add the section if missing — TD-46 candidate).
