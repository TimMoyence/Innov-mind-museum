# Post-Mortem — `<incident slug>`

> Copy this file to `docs/incidents/<YYYY-MM-DD>-<slug>/post-mortem.md` and fill in. Keep prose factual. Avoid blame; describe systems and decisions, not individuals.
>
> Companion documents in the same incident folder:
> - `preliminary-assessment.md` (T+24h, per [BREACH_PLAYBOOK § 4](./BREACH_PLAYBOOK.md))
> - `forensic-snapshot.md` (T+48h)
> - `cnil-notification.pdf` (if Art 33 triggered)
> - `subject-notification-en.md` / `subject-notification-fr.md` (if Art 34 triggered)

---

## Metadata

| Field | Value |
|-------|-------|
| Incident ID | [INCIDENT-YYYY-NNN — match GitHub issue number] |
| Severity (final) | P0 / P1 / P2 / P3 |
| Detected at (UTC) | YYYY-MM-DDThh:mm:ssZ |
| Declared at (UTC, T+0) | YYYY-MM-DDThh:mm:ssZ |
| Resolved at (UTC) | YYYY-MM-DDThh:mm:ssZ |
| Total duration | `<hours>` |
| GDPR Art 33 notification submitted | YES / NO — if NO, justify |
| GDPR Art 34 subject notification | YES / NO — if NO, justify per Art 34(3) |
| Author | [name] |
| Reviewers | Tech Lead, DPO, Process Auditor |
| Status | DRAFT / PUBLISHED / CORRECTIVE-ACTIONS-PENDING / CLOSED |

---

## 1. Executive summary

**Three sentences maximum**. What happened, who was affected, what we changed.

> Example: On 2026-04-26 a stale signed S3 URL with a 24-hour TTL allowed an unauthorized fetch of one user's voice-audio file. No other users or data classes were affected. We rotated `MEDIA_SIGNING_SECRET`, capped TTL at 15 minutes, and added a regression test asserting URL expiry in the chat E2E suite.

---

## 2. Timeline (UTC)

Use UTC throughout. Timestamps to the minute. Distinguish **observed** events (logs, alerts) from **decision** events (severity declared, war-room opened).

| Time (UTC) | Type | Event | Source |
|------------|------|-------|--------|
| YYYY-MM-DDThh:mm | observed | Sentry alert: 503 spike on `POST /api/chat/messages` | Sentry issue link |
| YYYY-MM-DDThh:mm | observed | On-call paged | TBD on-call tool |
| YYYY-MM-DDThh:mm | decision | Severity P1 declared (T+0) | Issue #N |
| YYYY-MM-DDThh:mm | decision | War room opened | War-room link |
| … | … | … | … |
| YYYY-MM-DDThh:mm | decision | All-clear declared | Tech Lead |

---

## 3. Detection

- **How was the incident detected?** (Reference a § 2 row in [`BREACH_PLAYBOOK.md`](./BREACH_PLAYBOOK.md).)
- **Mean Time To Detect (MTTD)** = `<observed-event UTC>` − `<root-cause-introduction UTC>` = `<duration>`.
- **Was the detection signal high-fidelity** (alert fired exactly when expected) **or low-fidelity** (noticed via tangential symptom)? If low, what would have caught it sooner?

---

## 4. Containment

What concrete actions stopped the bleeding? Reference the runbook executed (§ 5.a — § 5.f of `BREACH_PLAYBOOK.md`).

- Action 1 — at `<UTC>` — by `<role>`
- Action 2 — at `<UTC>` — by `<role>`
- …

**Mean Time To Contain (MTTC)** = `<containment-complete UTC>` − `<T+0>`.

---

## 5. Eradication

What got the issue out of the system permanently?

- Code change(s) — link PR(s).
- Configuration change(s) — link commit(s).
- Secret rotation(s) — list secrets.
- Vendor action(s) — describe.

---

## 6. Recovery

How did service return to normal?

- Smoke test outcome.
- Backfill / replay / re-process steps (if any).
- User-visible communication (banner removed at `<UTC>`).
- **Mean Time To Recovery (MTTR)** = `<recovery-complete UTC>` − `<T+0>`.

---

## 7. Root cause analysis (5 whys)

Apply the five-whys technique. Stop at the systemic cause, not at "the engineer was tired".

1. **Why** did the symptom occur? — `…`
2. **Why** did `<answer 1>` happen? — `…`
3. **Why** did `<answer 2>` happen? — `…`
4. **Why** did `<answer 3>` happen? — `…`
5. **Why** did `<answer 4>` happen? — `…`

**Root cause statement (one sentence)**: `…`

**Contributing factors** (none-or-more): `…`

---

## 8. Impact assessment

| Dimension | Detail |
|-----------|--------|
| Subjects affected (count) | `<n>` |
| Subject categories | visitors / admins / support contacts |
| Data classes affected | per `BREACH_PLAYBOOK.md` § 1.3 |
| Geographic scope | EU only / EU + non-EU / non-EU only |
| Public exposure window | `<start UTC>` — `<end UTC>` |
| Service downtime (if any) | `<duration>` |
| Financial impact (estimate) | direct + reputational TBD |
| Regulatory triggers | Art 33: YES/NO. Art 34: YES/NO. Reasoning. |

---

## 9. Lessons learned

What worked, what didn't, what surprised us. Three buckets:

- **Worked well**: …
- **Did not work**: …
- **Got lucky on**: …

---

## 10. Action items

Actionable, owned, dated. Prefer 5-7 high-leverage items over a long list.

| ID | Action | Owner | Due | Status | PR |
|----|--------|-------|-----|--------|----|
| AI-1 | … | @user | YYYY-MM-DD | OPEN / IN-PROGRESS / DONE | #N |
| AI-2 | … | @user | YYYY-MM-DD | … | … |

> **Verification gate**: every action item is closed only when the linked PR is merged AND a regression test exists (or a written justification documents why no test is feasible). Process Auditor signs off at T+30d (per `BREACH_PLAYBOOK.md` § 4).

---

## 11. Communications log

Every external (regulator, subject, vendor, public) and high-impact internal communication, with timestamp and link.

| Time (UTC) | Audience | Channel | Summary | Reference |
|------------|----------|---------|---------|-----------|
| YYYY-MM-DDThh:mm | CNIL | Portal submission | Art 33 notification | Receipt `<REF>` |
| YYYY-MM-DDThh:mm | Affected subjects | Email + in-app banner | Art 34 communication | Mailing log link |
| YYYY-MM-DDThh:mm | Internal team | War-room channel | All-clear | War-room link |
| … | … | … | … | … |

---

## 12. Sign-off

| Role | Name | Date | Comment |
|------|------|------|---------|
| Tech Lead | | YYYY-MM-DD | |
| DPO | | YYYY-MM-DD | |
| Process Auditor | | YYYY-MM-DD | Verifies action-item closure |
| CEO (P0/P1 only) | | YYYY-MM-DD | |
