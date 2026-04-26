# Tabletop — DB Compromise via Suspected SQL Injection

**Difficulty**: P0 catastrophic
**Duration**: 60 min
**Last run**: never
**Pre-reqs**: facilitator (1 person), participants (1+ if solo, ideally 2-3),
  laptop with repo + `psql` access to a NON-PROD replica, printed
  [`BREACH_PLAYBOOK.md`](../BREACH_PLAYBOOK.md) § 5.b (Database compromise / SQL
  injection), § 4 (72h timeline), § 7.a (CNIL form), § 7.b/7.c (subject notice
  templates EN/FR). The facilitator should have a printout of
  `museum-backend/src/shared/audit/audit-chain.ts` `verifyAuditChain()` signature
  so participants can talk about `firstBreakAt` without guessing.
**Goal**: drill the breach pipeline against a "did data leak across users?"
  scenario where the answer is genuinely uncertain at T+0 and only emerges
  through forensics. Test the audit-log hash chain as a forensic primitive.

**Drill cadence**: this scenario rotates through quarterly drills along with
  [`jwt-secret-leaked.md`](./jwt-secret-leaked.md) and
  [`openai-key-abuse.md`](./openai-key-abuse.md). This is the hardest of the
  three on average — recommended placement is the second quarterly drill of a
  new team's cycle, AFTER the JWT scenario has been run once (the JWT scenario
  introduces the runbook structure; this one tests improvisation under
  ambiguity). After the third pass, switch to a Variant (see § below).

---

## Facilitator pre-flight (do this 30 minutes before the session)

1. Open `museum-backend/src/shared/audit/audit-chain.ts` and read `verifyAuditChain` to refresh the return shape (`valid`, `firstBreakAt`, `firstBreakId`, `checked`). Print a one-page handout of those four fields with examples.
2. Have a NON-prod replica (or local Postgres) ready to demonstrate `pg_dump -Fc` syntax. Do NOT touch prod.
3. Print § 5.b of BREACH_PLAYBOOK in full — there are seven steps and participants will refer back to them out of order.
4. Pre-stage two fake "support tickets" on paper to hand out at T+8m and T+11m (Inject T+5m branch). They should be plausibly distinct visitors, not copy-paste of the original.
5. Have `verifyAuditChain` example output ready as a printed sheet: one valid run, one broken run with `firstBreakAt: 4217`. Hand the broken one to participants at T+0.
6. Confirm participants know which `auth_session` column carries the active flag (`revoked_at IS NULL`) — if not, walk them through `\d auth_session` on the staging replica before T+0.

## Solo-mode adaptation

Solo runs are HARDER for this scenario because the read-vs-investigate decision (T+5m) benefits from peer challenge. Facilitator should explicitly play the "investigate first" voice and force the participant to articulate counter-arguments. Solo run target: 50 minutes (D2 + D3 each take longer alone).

## Scenario brief (T+0 — facilitator reads aloud)

It is **Sunday 09:14 UTC**. A visitor opens a support ticket at 09:11:

> "I just logged into Musaium and my chat history has someone else's
>  conversation. They were asking about the Mona Lisa, I never asked about
>  that. The session is dated yesterday afternoon. I am freaked out, please
>  explain what is happening."

Sentry shows zero errors over the last 24h. Better Stack is green. The chat
endpoint p95 latency is normal. There has been one routine deploy to prod
yesterday at 16:42 UTC (~16h before the report).

The on-call engineer (you) opens `audit_log` for a sanity check and runs
`verifyAuditChain(rows)` on the most recent 24 hours. The function returns
`{ valid: false, firstBreakAt: 4 217, firstBreakId: '<uuid>', checked: 18 942 }`.
The break is at **07:09 UTC today** — about two hours before the support
ticket. Every row before the break verifies; every row after carries forward
a hash that does not match the recomputed value of the prior row.

You have not yet looked at `chat_messages`. You do not know if the visitor's
report is one user (IDOR-style bug) or many (mass exfiltration). You do know
that two facts are simultaneously true: a user reports cross-user data, AND
the audit log integrity has been broken in a window that overlaps with that
report. This is the moment.

## Inject schedule

| T+ | Inject | Facilitator reveal |
|----|--------|--------------------|
| T+0 | Support ticket + audit chain break shown to participants. | Detection sources: BREACH_PLAYBOOK § 2 row 6 (user report) AND § 2 row 3 (audit log anomaly). Both fired independently. Severity must be classified before any DB query. |
| T+5m | Decision forced: do you put the backend in read-only mode (or full maintenance) NOW, or do you investigate first? | If team chooses investigation first: reveal that during their investigation, two more support tickets land at T+8m and T+11m with similar "I see someone else's chat" claims. (Punishes hesitation.) If team chooses maintenance mode: reveal that the load-balancer config does NOT support per-route disable (per § 5.b step 1 "TBD — confirm whether nginx config supports per-route disable"), so the choice is binary: full backend stop + maintenance page, or nothing. |
| T+15m | Snapshot decision. Participants must produce the exact `pg_dump` command from § 5.b step 2, run it (verbally) against prod, and quote the SHA-256 capture step. | Confirm: dump must be `-Fc` (custom format), filename includes UTC timestamp, hash captured to `/tmp/musaium-incident.sha256`. Reveal: WAL archive availability is unknown ("TBD — confirm WAL archive availability" per § 5.b step 6) — discuss the implication for PITR. |
| T+30m | Audit anomaly investigation. Reveal: the broken row at index 4 217 is an `admin.user.role_change` action targeting the visitor who reported the incident, performed by an `actor_user_id` that does NOT exist in the `users` table (foreign key is nullable in `audit_log` for purged actors). | Red herring trap: it LOOKS like a deleted admin escalated the visitor. Real cause: the actor_user_id is a row that was REPLAYED from a forged session AFTER `JWT_REFRESH_SECRET` was somehow misused. Test: do participants jump to "deleted admin" without verifying the timing? |
| T+45m | Regulatory clock visible AND forensic gap. Reveal: a colleague did a `DELETE FROM audit_log WHERE created_at < '2025-04-01'` six weeks ago "to save disk", thinking it only removed expired rows. The 13-month retention assumption is therefore broken — chain is short. | Test escalation discipline: this is bad news that must reach the DPO, not be hidden. Decision: does the team disclose this in the CNIL draft? (Yes — Art 5(2) accountability principle, § 1.1.) |
| T+60m | Wrap. Declare contained (maintenance mode active, dump captured, scope still unconfirmed). | Hand off to [`POST_MORTEM_TEMPLATE.md`](../POST_MORTEM_TEMPLATE.md) § 7 (5 whys). The scenario does NOT resolve the root cause within 60 minutes — that is the point. The 72h clock has started; the team continues offline. |

## Decision points (what the team MUST answer aloud, not from the playbook)

- **D1 — Severity classification (P0/P1/P2/P3) — justify.** Expected: P0. Audit chain break + cross-user data report = confirmed integrity compromise + plausible mass exfiltration. Multipliers per § 3: internet-facing prod (×2.0), sensitive personal data (chat text, may include free-form personal narrative — ×1.5). Do NOT downgrade because "we don't know yet how many users". The unknown IS the hazard.
- **D2 — Containment trigger (rotate which secret? revoke which sessions?).** Expected: full backend stop + maintenance page (since per-route nginx disable is TBD) BEFORE any further investigation. Then `DB_PASSWORD` rotation per § 5.b step 3. Discuss: do we ALSO revoke all `auth_session` rows? (Probably yes — if the audit chain break is associated with a forged session, all live sessions are suspect.) Discuss: do we rotate `JWT_*` secrets too? (Yes — if SQL injection is the vector, attacker could have exfiltrated `auth_session.refresh_token_hash` rows; rotate to invalidate.)
- **D3 — Art 33 trigger (yes/no — record the reasoning, not the verdict).** Expected: YES. Confirmed integrity breach + at least one confirmed confidentiality breach (the original support ticket) on personal data of an EU subject. Timer starts at T+0 of detection (09:14 UTC). CNIL deadline = T+72h.
- **D4 — Subject notification trigger (Art 34) — yes/no and why.** Expected: YES. Chat text includes "free-form personal narrative" per § 1.3 (HIGH sensitivity). Even one confirmed cross-user disclosure on a high-sensitivity category clears the high-risk threshold. Discuss: do we notify ALL users, or only the ones we can prove were exposed? (Default: all whose sessions overlap the chain-break window, until proven otherwise. Over-notify is GDPR-safe; under-notify is not.)
- **D5 — Communications: who do you call, in what order?** On-call → Tech Lead (T+15m) → DPO (T+1h, P0) → Legal → External Comms → CEO. ALSO: provider awareness — do we contact OVH (VPS host)? Postgres community? No — the SQLi (if confirmed) is in our code, not the DB engine.
- **D6 — Reply-to-the-original-reporter discipline.** The visitor who filed the support ticket is owed an acknowledgement within hours, but the reply CANNOT contain forensic details before Legal review (per BREACH_PLAYBOOK § 2 row 6). Draft a holding response together: confirm receipt, confirm we're investigating, do not confirm or deny what they saw, do not promise a timeline.
- **D7 — Maintenance page content.** If we go fully maintenance-mode (D2), what does the page say? Cannot say "we're investigating a security incident" prematurely. Default copy: "Musaium is temporarily unavailable for scheduled maintenance — we apologise for the inconvenience". Hold the truthful detail for the post-incident comms in § 7.b/7.c.

## Expected outputs (compare against during debrief)

- Severity declared in ≤15 minutes from T+0 (longer than the JWT scenario because the read-vs-investigate decision is genuinely harder).
- Containment commands quoted from § 5.b (steps 1–7) in order, especially step 2 (snapshot BEFORE rotation/cleanup).
- The breach is logged via `auditCriticalSecurityEvent({ eventName: BREACH_EVENTS.DB_COMPROMISE, severity: 'P0', detectionSource: 'audit_log_anomaly', affectedDataClasses: ['chat', 'account'], description: 'audit chain firstBreakAt=4217 + user report cross-tenant chat visibility' })`.
- War-room channel created.
- DPO notified within T+1h target.
- CNIL form drafted using § 7.a — explicitly listing "confidentialité + intégrité" both ticked, and the truncated-retention disclosure from T+45m.
- Subject notification template (§ 7.b EN + § 7.c FR) drafted with the placeholder counts marked TBD pending forensics.
- Action item placeholder: implement nginx per-route disable for write endpoints (closes the "binary on/off" forced choice from this drill).

## Common failure modes (facilitator: watch for these and challenge)

- **Querying `chat_messages` first to "see how bad it is" before snapshotting.** Challenge: every SELECT against a compromised DB risks tripping triggers / mutating last-read cursors / overwriting query-cache patterns the attacker may be using. § 5.b step 2 — snapshot is step ZERO, before exploration.
- **Rotating `DB_PASSWORD` without revoking active sessions** → backend reconnects, attacker's session token (if they have one) keeps working until refresh expires.
- **Treating the chain break as a "data integrity bug" rather than a security incident.** Challenge: the chain is hash-linked precisely so that integrity violations ARE security signals (BREACH_PLAYBOOK § 9.1, R6 wiring). A break == an unverifiable history == treat as compromise until proven otherwise.
- **Missing the Art 33 clock — assuming "we need root cause first".** The Art 33 clock starts at AWARENESS, not at root cause. § 1.2 is explicit: "as soon as the Tech Lead or DPO declares severity P0 or P1 AND at least one personal-data category in § 1.3 is impacted, the timer starts".
- **Forensic actions BEFORE snapshot** — re-running `verifyAuditChain` after rotation, running `EXPLAIN ANALYZE` on suspect queries against prod, or `pg_dump --table=audit_log` AFTER the password rotation has invalidated the user.
- **Hiding the truncated-retention disclosure from the CNIL draft.** GDPR Art 5(2) accountability + Art 33 require complete and timely disclosure — minimisation is a worse outcome than late notification.
- **Falling for the "deleted admin" red herring at T+30m.** The non-existent `actor_user_id` in the broken row is meant to look like an insider attack. Push the team to verify the row's `created_at` against the audit chain hash sequence — if the row has a hash that does not match the predecessor recomputed from a genuine prior row, the row itself is forged or post-hoc inserted, not a record of a real admin action. Forged > insider.
- **Rolling back to yesterday's image to "fix" it.** A rollback of the deploy code doesn't undo a write to the DB. The `chat_messages` rows that the visitor saw are still there. Discuss what rollback DOES vs DOES NOT achieve.
- **Closing the incident after dump capture, before forensic analysis.** Containment ≠ resolution. The team must keep the incident issue OPEN and the maintenance banner UP until the scope determination (§ 4 T+24h preliminary assessment) confirms what was exposed.

## Debrief framework (15 min after T+60m)

Map drill output to the post-mortem template so the muscle is the SAME one a real
incident would exercise. Fill these together as a group, in this order:

1. **Metadata table** of [`POST_MORTEM_TEMPLATE.md`](../POST_MORTEM_TEMPLATE.md) § "Metadata" — fill columns that are knowable from the drill. Severity final = P0; Art 33 = YES; Art 34 = YES (per D4 reasoning); Status = DRAFT.
2. **Timeline** § 2 — pull from the inject schedule. CRUCIAL: include the "audit chain truncated retention disclosure" (T+45m) as an OBSERVED event with its own row, not buried in another decision row.
3. **Detection** § 3 — what was MTTD (the chain break started at 07:09 UTC; we detected at 09:14 UTC = 2h 5min). Was that fast enough? Should the chain verification job run more often than its current cadence (operator: confirm cadence)?
4. **Root cause analysis (5 whys)** § 7 — DO NOT pre-decide the root cause. The drill's official scenario does not commit to whether SQLi vs IDOR vs forged-session is the actual vector — that is a post-incident forensic question. Use the 5 whys to model UNCERTAINTY: "Why don't we know yet? Because we haven't done X. Why haven't we done X? Because tooling Y is missing."
5. **Action items** § 10 — minimum 3 action items for this scenario (it is the most fertile for findings): retention enforcement, per-route maintenance lever, chain-verification cadence.

## Reflection questions (5 min at T+60m)

1. What detection source surfaced the incident first? In this drill, two fired simultaneously (user report + chain anomaly). Did we treat them as corroborating, or did we let the user-report dominate and ignore the chain signal? (Or vice versa?)
2. Was the playbook § 5.b runbook usable as-is, or did we improvise? Specifically: did step 1's "TBD — confirm whether nginx config supports per-route disable" force us into an over-broad maintenance window? (If yes → action item.)
3. Where did we stall? Forensics tooling (we don't have a hot-swap read-replica), knowledge (do we know how to read `verifyAuditChain` output beyond `valid: false`?), or decision authority (do we have a runbook-approved actor who can declare maintenance mode unilaterally?)
4. What gap should we close BEFORE the next quarterly drill? Candidates: (a) implement nginx per-route disable for write endpoints; (b) document `verifyAuditChain` interpretation runbook; (c) confirm WAL archive availability for PITR; (d) re-validate `audit_log` retention against the truncation that surprised us today; (e) add a `chat_messages` row-level check (each row's `session_id` must match the requesting user's owned sessions) as a regression test.

## Cross-references

- [`BREACH_PLAYBOOK.md`](../BREACH_PLAYBOOK.md) § 5.b — Database compromise / SQL injection (containment runbook applicable here).
- [`BREACH_PLAYBOOK.md`](../BREACH_PLAYBOOK.md) § 2 row 3 — audit log anomaly detection.
- [`BREACH_PLAYBOOK.md`](../BREACH_PLAYBOOK.md) § 9.1 — wiring evidence for breach audit events (referenced when logging via `auditCriticalSecurityEvent`).
- [`POST_MORTEM_TEMPLATE.md`](../POST_MORTEM_TEMPLATE.md) — to fill at T+7d; today, sketch sections 1, 2, 7 (5 whys) only.
- [`CI_CD_SECRETS.md`](../../CI_CD_SECRETS.md) § _Emergency Key Revocation_ — for `DB_PASSWORD` + `JWT_*` rotation paths discussed in D2.
- `museum-backend/src/shared/audit/audit-chain.ts` — `verifyAuditChain()` returning `firstBreakAt`, used as the pivot signal in this scenario.
- `museum-backend/deploy/rollback.sh` — discuss whether a rollback to yesterday's pre-deploy image would help (probably not — the symptom predates the deploy in some plausible variants of this scenario).

## Variants for repeat runs

Use these to keep the scenario fresh on the second / third / fourth quarterly drill.

- **Variant A — "no chain break, only user reports"**: the audit log verifies cleanly. Three distinct visitors report cross-user chats over four hours. The team must investigate WITHOUT the chain signal as anchor — pure forensics on `chat_messages.session_id` foreign-key integrity. Tests whether the team can investigate without the convenience signal.
- **Variant B — "chain break, no user reports"**: only the integrity check fires. No support tickets. The team must decide whether silent chain-break alone clears the Art 33 awareness threshold (§ 1.2 — answer: yes if a personal-data class is impacted within the broken window, even without a confirmed disclosure).
- **Variant C — "PITR is unavailable"**: the WAL archive turns out NOT to be running (per the TBD note in § 5.b step 6). Force the team to plan recovery WITHOUT point-in-time restore. The pre-incident snapshot is yesterday's nightly `pg_dump`. What gets lost? What has to be rebuilt? What gets communicated to subjects?
- **Variant D — "the SQLi is in a third-party endpoint"**: the vulnerable code is in an admin-only route that ingests CSVs from a partner museum. This narrows the actor set (admin auth required to reach the route) but widens the implication (partner integration must be paused). Force the team to discuss vendor-affecting communications.

Facilitators: pick ONE variant per drill. Combining the audit-log truncation reveal (T+45m of base scenario) with Variant C (no PITR) is too punishing for a single 60-minute session.

## Update log

| Date | Facilitator | Notes (gaps found, follow-ups) |
|------|-------------|--------------------------------|
| | | |
