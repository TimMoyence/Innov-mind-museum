# Tabletop — JWT Signing Secret Leaked to Public Branch

**Difficulty**: P0 catastrophic
**Duration**: 60 min
**Last run**: never
**Pre-reqs**: facilitator (1 person), participants (1+ if solo, ideally 2-3),
  laptop with repo + GitHub Actions access, printed [`BREACH_PLAYBOOK.md`](../BREACH_PLAYBOOK.md)
  § 5.a (p. covering "JWT signing secret leaked"), § 6 (escalation tree), § 7.a (CNIL
  notification template), and a printed copy of [`CI_CD_SECRETS.md`](../../CI_CD_SECRETS.md)
  § _Zero-Downtime JWT Rotation_ + § _Emergency Key Revocation_.
**Goal**: drill the breach pipeline end-to-end against a realistic prompt without
  touching production state. Every command discussed is verbalised, not executed.

**Drill cadence**: this scenario rotates through quarterly drills along with
  [`db-compromise-sqli.md`](./db-compromise-sqli.md) and
  [`openai-key-abuse.md`](./openai-key-abuse.md). Pick one per quarter; over
  one calendar year the team cycles through all three at least once. After
  the third run, see § "Variants for repeat runs" below to keep the scenario
  fresh on subsequent passes.

---

## Facilitator pre-flight (do this 30 minutes before the session)

1. Open the printed BREACH_PLAYBOOK § 5.a and re-read steps 1–9. Note any drift between the printed version and the current repo HEAD (e.g., `auth_session` table name) — call it out at T+0 if so.
2. Verify the GitHub repo settings page (Security → Secret scanning) is reachable from the participants' laptops. Do NOT actually trigger any rotation today.
3. Stage a fake researcher email in plain text — keep it on a USB or printed handout. Do NOT route real email; we are pretending.
4. Confirm participants have access to a NON-prod staging environment for any "what would I run" rehearsal. Production must be untouched.
5. Open `.github/ISSUE_TEMPLATE/security-incident.yml` in a tab to demonstrate the issue creation step at T+0.
6. Open `museum-backend/src/shared/audit/audit.service.ts` to the `auditCriticalSecurityEvent` signature so participants can SEE the call shape, not guess.

## Solo-mode adaptation

If only one engineer is available, the facilitator plays the "second voice" for D5 (communications) and challenges decisions aloud. Solo runs SHOULD complete the drill — the value is in walking the runbook, not in negotiation. Solo run target time: 45 minutes (skip the war-room creation step, ask aloud "who would I be calling?" instead).

## Scenario brief (T+0 — facilitator reads aloud)

It is **Tuesday 14:37 UTC**. A junior engineer pushed a debugging branch
`fix/auth-401-spam` to `origin` 32 minutes ago. The branch contains a copy of the
prod `.env` they pasted into a fresh `museum-backend/scripts/dump-env.cjs` "to repro
locally". The push went through — there was no Gitleaks pre-commit hook on their
fresh laptop checkout (they had skipped the `pre-commit install` step).

GitHub's secret-scanning service flagged the push two minutes ago and emailed the
repo admin with a redacted match for `JWT_ACCESS_SECRET=`. Six minutes ago, an
external researcher (`research@redacted.example`) emailed `security@musaium.app`
with a screenshot of the same secret value, the commit SHA, and the line "you have
about 30 minutes before someone else finds this — please rotate". Their email
mentions they have **not** demonstrated token forgery, only located the secret.

Sentry shows nothing unusual. Better Stack is green. The repo is **public** (per
the audit, branch protection on `main` is missing — the leaked branch is not
`main`, but anyone watching the repo's events feed can see the SHA). The push
has already been mirrored to the GitHub event firehose.

The on-call engineer (you) has just acknowledged the page from the security
mailbox alias.

## Inject schedule

The schedule below assumes a roughly steady cadence of injects. Adjust pacing on
the day — if participants are stalled, slow injects to give them time to find
the runbook step; if they are racing ahead, accelerate to keep pressure.

| T+ | Inject | Facilitator reveal |
|----|--------|--------------------|
| T+0 | Researcher email landed in `security@musaium.app`. Acknowledge to participants. | Confirm: detection source = third-party disclosure (BREACH_PLAYBOOK § 2 row 5). Researcher is credible (real PGP-signed email). The push is 32 minutes old. |
| T+5m | Participants receive a second email: GitHub secret-scanning alert (Dependabot-style notification). Same SHA, same secret pattern. | Reveal: the leaked secrets are `JWT_ACCESS_SECRET` AND `JWT_REFRESH_SECRET` — the engineer pasted the entire env block. (Test whether participants caught both — § 5.a step 1 says "treat both as compromised".) |
| T+15m | Decision forced: do you rotate now, or do you snapshot/audit first? | If team rotates first WITHOUT logging the breach via `auditCriticalSecurityEvent`: mark the gap. § 5 generic preamble step 3 requires the audit row before rotation. If team snapshots `audit_log` first (correct): reveal the audit log shows two `auth.login.success` rows from an unfamiliar IP `185.220.101.x` (TOR exit node) at T-12m and T-3m for two different real visitor accounts. |
| T+30m | Regulatory clock visible. Participants must answer aloud whether the Art 33 timer started, and at what timestamp. | Force-rotate clock to T+0 of detection (NOT push time). Confirm: severity P0 (token forgery → impersonation of any user). Per § 1.2, awareness threshold met → 72h timer started at T+0 of THIS scenario. CNIL deadline = T+72h from T+0 of this drill. |
| T+45m | Red herring: the researcher emails again offering to "test the new secret once you rotate, just to be sure". Forensic gap: the team realises VPS access is via a single SSH key held by the on-call engineer; their laptop is at home; their phone is the only device with Signal access. | Test escalation discipline — do NOT engage the researcher beyond a templated acknowledgement. Test whether participants invoke the printed phone tree (§ 6) when SSH must happen NOW but the only key holder is offline. |
| T+60m | Wrap. Declare contained (rotation done, sessions revoked, audit log captured). | Hand off to [`POST_MORTEM_TEMPLATE.md`](../POST_MORTEM_TEMPLATE.md). At least one action item MUST be: enforce `pre-commit install` in `package.json` `postinstall` so Gitleaks cannot be skipped on a fresh clone. |

## Decision points (what the team MUST answer aloud, not from the playbook)

- **D1 — Severity classification (P0/P1/P2/P3) — justify.** Expected: P0. Confirmed leak of token-signing secrets on a public repo + observed suspicious logins on the leaked window = active mass-impersonation risk. Multiplier reasoning: internet-facing prod (×2.0) × sensitive data (×1.5) × active exploit ITW once the second-IP login surfaces (×2.0).
- **D2 — Containment trigger (rotate which secret? revoke which sessions?).** Both `JWT_ACCESS_SECRET` AND `JWT_REFRESH_SECRET` (defense in depth, § 5.a step 1). All `auth_session` rows revoked (`UPDATE auth_session SET revoked_at = NOW() WHERE revoked_at IS NULL;`). Discuss: do we ALSO rotate `MEDIA_SIGNING_SECRET` since the leaked env file probably contained it? (Yes — if the env block was pasted in full, every secret it touched is compromised. § 5.c step 1.)
- **D3 — Art 33 trigger (yes/no — record the reasoning, not the verdict).** Expected reasoning: confirmed exposure of an authentication signing secret of a public-facing app processing EU subjects. Even with no proven exfiltration, "reasonable degree of certainty that personal data is at risk" is met (§ 1.2). Timer starts T+0 of detection, not push time.
- **D4 — Subject notification trigger (Art 34) — yes/no and why.** Trickier. If rotation completed within minutes and no exfiltration evidence found in `audit_log`, Art 34 may NOT be triggered (high-risk threshold not met). However, the second-IP login at T-3m IS a strong signal of attempted exploitation. Decision should default to YES pending DPO + Legal review, with a fallback notice to the two affected accounts.
- **D5 — Communications: who do you call, in what order?** Expected order per § 6: on-call → Tech Lead (T+15m) → DPO (T+1h, P0) → Legal → External Comms → CEO. Test: do participants try to reach a "CISO" or "PagerDuty" that does not exist in this repo? Correct them — § 6 placeholders only.
- **D6 — Researcher coordination response.** Within T+30m, the team must compose a one-paragraph reply to the researcher: thank them, confirm receipt, request they hold publication for 30 days minimum (coordinated disclosure), commit to credit them in the post-mortem if they consent. Do NOT confirm or deny technical specifics in the reply.
- **D7 — Git history scrub authority.** Per § 5.a step 9, branch protection must be temporarily relaxed to allow force-push of scrubbed history. WHO has the GitHub admin rights to do that, and is that person in the room? Test: if the answer is one person and they are not on call, the team has a real-world gap to close.

## Expected outputs (compare against during debrief)

- Severity declared in ≤10 minutes from T+0.
- Containment commands quoted from BREACH_PLAYBOOK § 5.a (steps 1–9), in order.
- The breach is logged via `auditCriticalSecurityEvent({ eventName: BREACH_EVENTS.JWT_SECRET_LEAKED, severity: 'P0', detectionSource: 'third_party_disclosure', affectedDataClasses: ['account'], … })` BEFORE rotation begins.
- War-room channel created (Slack / Signal / phone tree — whichever placeholder operator has filled in by drill date).
- DPO notified within T+1h target (verbalised — no actual notification sent).
- CNIL form drafted using § 7.a template, even if the scenario stops at T+60m. Draft committed to `docs/incidents/<date>-jwt-secret-leaked-DRILL/cnil-notification-draft.md`.
- Force re-login validated: participants describe how they would smoke-test that an old token returns 401 after rotation (e.g., `curl -H "Authorization: Bearer <old>" https://api.musaium.com/api/auth/me` → 401).

## Common failure modes (facilitator: watch for these and challenge)

- **Skipping severity classification → straight to rotation without scope.** Challenge: "before you rotate, what does the audit log say happened in the last 30 minutes?"
- **Rotating only `JWT_ACCESS_SECRET`, leaving `JWT_REFRESH_SECRET` intact** because "the access token expires in 15 minutes anyway". Challenge: read § 5.a step 1 aloud — "treat BOTH as compromised". A refresh-only forgery still gets you 30 days of impersonation.
- **Force-pushing scrubbed history before branch protection is restored.** Challenge: § 5.a step 9 — branch protection must be re-applied IMMEDIATELY after the scrub, by the same admin, in the same Slack message. Do not split this across people.
- **Engaging the researcher beyond an acknowledgement.** Coordinated disclosure: thank them, ask for permission to credit (post-mortem § 11), do NOT promise a bounty without Legal review.
- **Missing the Art 33 clock — assuming "we have time"** because rotation went smoothly. The clock is about NOTIFICATION duty, not technical containment. They are independent.
- **Forensic actions BEFORE snapshot.** § 5 generic preamble step 4 — `pg_dump`, `audit_log` export, S3 access-log archive BEFORE rotation/cleanup, otherwise evidence is overwritten.
- **Treating the suspicious TOR-exit logins as "probably bot scanning, ignore".** Challenge: the timing (T-12m, T-3m) is too tight to the leak window for coincidence. Two distinct visitor accounts targeted == credible signal of token forgery, not random scanning.
- **Trying to rotate the secret AND scrub git history in the same SSH session.** Challenge: these are two separate operations with different blast radii. Rotation is reversible (rotate again if needed); a botched force-push is not. Sequence them: rotate first, smoke-test, THEN scrub.
- **Quoting "we don't have a CISO" as a reason to delay DPO escalation.** § 6 placeholders are not blockers — the role responsibilities still apply, even if the named person is TBD.

## Debrief framework (15 min after T+60m)

Map drill output to the post-mortem template so the muscle is the SAME one a real
incident would exercise. Fill these together as a group, in this order:

1. **Metadata table** of [`POST_MORTEM_TEMPLATE.md`](../POST_MORTEM_TEMPLATE.md) § "Metadata" — fill columns that are knowable from the drill (Severity final = P0; Detected at = T+0 of drill; Declared at = T+0 + delay observed; Resolved at = T+60m or "drill ended"; Author = on-call participant; Status = DRAFT).
2. **Timeline** § 2 — pull from the inject schedule, distinguish observed vs decision events.
3. **Root cause analysis (5 whys)** § 7 — exercise this with the artificial root cause "engineer pushed without Gitleaks pre-commit". Walk the five whys, see if the team reaches "we don't have a server-side pre-receive hook" (the systemic answer) vs "the engineer was sloppy" (the surface answer to avoid).
4. **Action items** § 10 — every drill MUST produce at least 2 action items, even if the drill went perfectly. If you "found nothing", you ran the drill on autopilot.

## Reflection questions (5 min at T+60m)

1. What detection source surfaced the incident first? Was it the one we expected? (Hypothesis: GitHub secret-scanning. Reality in this drill: third-party researcher beat secret-scanning by minutes — what does that say about our monitoring of `security@musaium.app`?)
2. Was [`BREACH_PLAYBOOK.md`](../BREACH_PLAYBOOK.md) § 5.a usable as-is, or did we improvise? Specifically: did `auth_session` exist as named in step 4, or did we have to verify the schema first? (TBD — operator: confirm column names in the printed playbook before next drill.)
3. Where did we stall? Tooling, knowledge, or decision authority? (Common answer: only one person had VPS SSH access. → action item: documented secondary key holder.)
4. What gap should we close BEFORE the next quarterly drill? Candidates: (a) enforce `pre-commit install` in monorepo `postinstall`; (b) make Gitleaks pre-receive hook server-side, not just client-side; (c) document the on-call backup phone number in § 6; (d) automate CNIL deadline tracking via `.github/workflows/breach-72h-timer.yml` — verify the workflow already exists per BREACH_PLAYBOOK § 9.1.

## Cross-references

- [`BREACH_PLAYBOOK.md`](../BREACH_PLAYBOOK.md) § 5.a — JWT signing secret leaked (containment runbook applicable here).
- [`BREACH_PLAYBOOK.md`](../BREACH_PLAYBOOK.md) § 4 — 72-hour timeline used to drive the inject schedule.
- [`POST_MORTEM_TEMPLATE.md`](../POST_MORTEM_TEMPLATE.md) — to fill at T+7d after a real incident; today, draft sections 1, 2, 4 only.
- [`CI_CD_SECRETS.md`](../../CI_CD_SECRETS.md) § _Zero-Downtime JWT Rotation_ — referenced in § 5.a step 3 (with the explicit "Step 2 alternative is forbidden here" note for breach mode — discuss why during the drill).
- [`CI_CD_SECRETS.md`](../../CI_CD_SECRETS.md) § _Emergency Key Revocation_ — fallback if zero-downtime rotation cannot be performed.

## Variants for repeat runs

Use these to keep the scenario fresh on the second / third / fourth quarterly drill.

- **Variant A — "the engineer is on PTO"**: the junior who pushed the secret is hiking with no signal. Their commit account is the only one tied to the work-laptop SSH key on the VPS. Force the team to discuss key custody, recovery procedures, and the (currently absent) "secondary key holder" gap from § 6.
- **Variant B — "the leak is six hours old, not 30 minutes"**: the team must reason about a much longer exposure window. Audit log review becomes critical — what does six hours of `audit_log` actor-source patterns look like? Force the team to estimate "how many tokens could have been forged" and translate that into Art 34 risk.
- **Variant C — "internal not public"**: the secret was committed to a PRIVATE repo, not the public main repo, but the private repo has 12 collaborators including 3 contractors. Test: is "private-but-shared" still a breach for Art 33 purposes? Hint: yes — the unauthorized-access definition is internal-vs-authorized, not public-vs-private.
- **Variant D — "rotation breaks something"**: after rotating, the staging environment fails its smoke test because the staging deploy script reads `JWT_ACCESS_SECRET` from a separate vault that was forgotten. Force the team to discuss the difference between the "rotation succeeded" claim and "all consumers of the secret have rotated" reality.

Facilitators: pick ONE variant per drill — combining variants makes the 60-minute budget unrealistic.

## Verbal-only constraint

This drill is **verbal-only against production**. Forbidden actions during the
60-minute window:
- Running any rotation script against `*.musaium.com` or any prod-tagged compose file.
- Force-pushing to `main` or any branch on the public repo.
- Sending any email from `security@musaium.app` (the researcher email is staged).
- Making any API call to `https://api.musaium.com` other than `GET /api/health` from a clean network.

Permitted: dry-runs against staging, local schema inspection (`\d auth_session`), reading the BREACH_PLAYBOOK and CI_CD_SECRETS files in the repo, drafting (not sending) CNIL notification text into the drill folder.

## Update log

| Date | Facilitator | Notes (gaps found, follow-ups) |
|------|-------------|--------------------------------|
| | | |
