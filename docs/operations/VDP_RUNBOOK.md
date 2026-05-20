# VDP Runbook — Vulnerability Triage & Incident Response

**Audience:** Musaium founder + future security delegate.
**Goal:** Handle inbound security reports and security incidents without breaking SLA promises in `SECURITY.md`, and meet GDPR Article 33 (72 h) + EU CRA Article 14 (24 h / 72 h / 14 d) reporting obligations.
**Source of truth for public commitments:** [`SECURITY.md`](../../SECURITY.md). This runbook must never drift below those commitments.
**Last updated:** 2026-05-14.

> **Companion files** — Public VDP policy: `museum-web/src/app/[locale]/security/page.tsx`. RFC 9116 advertisement: `museum-web/public/.well-known/security.txt`. Sub-processor inventory: [`docs/legal/SUBPROCESSORS.md`](../legal/SUBPROCESSORS.md).

---

## 1. Intake monitoring

| Channel | Watch how | Latency target |
|---|---|---|
| `security@musaium.com` | Forward to founder primary inbox + Slack `#security` channel (mobile push enabled) | First glance within 4 h, even on weekends |
| GitHub Issues with `security` label on `InnovMind/musaium` | Auto-close + reply with `security@` pointer (these are NOT the channel) | — |
| App Store / Play Console developer feedback | Weekly scan; route any security-flavour reports to `security@` | Weekly |
| OVH abuse / NS NOC notifications | Forward to `security@` + acknowledge to OVH | 24 h |

Hygiene: a dedicated Gmail label + filter on `to:security@musaium.com`. Read every report; do not let it pile.

---

## 2. Triage process — per report

### Step 1 — Acknowledge (within 5 working days, target 24 h)

Reply with `acknowledgement-template.md` (Appendix A). Confirm receipt, do NOT confirm scope yet. Assign tracking ID `SEC-<yyyy>-<nnn>` (sequential, persisted in `security-private/` CSV or 1Password notes — not in this repo).

### Step 2 — Reproduce (within 10 working days)

- Reproduce in the exact described environment (test account + local Docker stack, no prod data).
- Capture screenshots, logs, requests, payloads. Save artefacts in `security-private/SEC-<id>/`.
- If cannot reproduce, ask the researcher for clarification (`reproduce-request-template.md`, Appendix B) before closing.

### Step 3 — Classify

- **Scope check:** Is the target in §Scope of `SECURITY.md`? If out, send `out-of-scope-template.md` (Appendix C) with a brief reason.
- **Severity:** Use CVSS 4.0 ([calculator](https://www.first.org/cvss/calculator/4.0)). Save the vector string in the issue.
- **Personal data exposed?** → trigger §5 GDPR Article 33 protocol.
- **Actively exploited or severe security incident?** → trigger §6 CRA reporting protocol.
- **User-impact:** auth bypass, account takeover, payment data, voice / photo exfiltration → same-day rollback / mitigation, regardless of CRA classification.

### Step 4 — Track

- Open a **private** GitHub issue in `InnovMind/musaium` (or a dedicated private `security-private/` repo) with `security` label + `severity/<critical|high|medium|low>` label.
- Title format: `[SEC] <component> — <one-line>`.
- Body: CVSS vector, reporter handle (with permission), reproduction steps, proposed fix path, target date.
- Do NOT paste reporter contact details into a public-history issue — store them in `security-private/`.

### Step 5 — Remediate

- Build patch in `fix/security/<short-id>` branch.
- Squash-merge to `main`. Backport to release branches if applicable (post-GA only).
- Verify in production: `pnpm smoke:api` for backend; manual e2e for mobile / web.
- Tag a hotfix release if user-facing components require updating.

### Step 6 — Disclose

- Draft advisory (Appendix D `advisory-template.md`): summary, affected versions, fix version, severity, CVSS vector, credit, mitigation steps.
- Publish at `https://musaium.com/security/advisories/<id>` (page TBD before first advisory).
- Notify reporter — give them a chance to review before going live (`coordinated-disclosure-template.md`, Appendix E).
- Default public disclosure: **30 days after patch ships** (Project Zero 90 + 30 pattern).
- Request CVE via [MITRE form](https://cveform.mitre.org/) for any CVSS 4.0 ≥ 4.0 finding.

### Step 7 — Credit

- Add reporter (with permission) to `https://musaium.com/fr/security#hall-of-fame` and the EN equivalent.

---

## 3. Severity → response SLA matrix

| Severity (CVSS 4.0) | Acknowledge | Triage | Patch target | Disclose |
|---|---|---|---|---|
| CRITICAL (9.0–10.0) | < 4 h | < 24 h | < 7 d | 14 d after patch |
| HIGH (7.0–8.9) | < 24 h | < 5 d | < 30 d | 30 d after patch |
| MEDIUM (4.0–6.9) | < 5 d | < 10 d | < 90 d | 30 d after patch |
| LOW (0.1–3.9) | < 5 d | < 15 d | next release | with advisory |

For CRITICAL findings: PagerDuty-equivalent escalation = SMS to founder + Telegram fallback. Even AFK, target a same-hour "we see it, investigating" reply.

---

## 4. CRITICAL incident on-call flow

```
T+0  : awareness (report received, alert triggered, support ticket flagged "security")
T+15m: confirm initial assessment (real / not real, scope, severity)
T+1h : mitigation in production (route disabled, rate-limit clamp, edge block, rollback)
T+4h : confirm mitigation effective via /api/health + Sentry + Grafana request-error dashboards
T+24h: ENISA SRP early warning (if CRA-qualifying — see §6) AND/OR CNIL notification (if personal-data breach — see §5)
T+72h: full notification (GDPR + CRA)
T+7d : patch shipped to production
T+14d (CRA) / T+1mo (GDPR severe incident): final report
```

Mitigation toolbox available without redeploy:

- Disable the offending route at the router (comment out / 503 the route in its module + redeploy) — Musaium ships no feature flags pre-launch (UFR-015), so there is no flag to flip.
- Rate-limit upgrade for the offending route (`museum-backend/src/shared/middleware/rate-limit.middleware.ts`).
- WAF / reverse-proxy block at OVH edge (last resort, requires OVH support ticket).
- Mobile remote config kill switch via app config endpoint.

---

## 5. GDPR Article 33 — personal data breach (72 h)

**Trigger:** A confirmed or reasonably-suspected breach of confidentiality, integrity, or availability of personal data (user photos, voice transcripts, account email, location, payment info).

> **Risk threshold:** Article 33 §1 requires notification **unless** the breach is "unlikely to result in a risk to the rights and freedoms of natural persons." When in doubt → notify. Article 34 §1 (notification to data subjects) kicks in for **high risk**.

### Timeline

| Phase | Clock | Action |
|---|---|---|
| Awareness | T+0 | Mark in tracker; preserve evidence. Start `breach-log.md` (Appendix F). |
| Initial assessment | T+24 h | Scope confirmed: how many data subjects, what data categories, likely consequences, measures taken. |
| **Supervisory authority notification** | **T+72 h** | Notify CNIL (https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles) using their online form. Article 33 §3 minimum content: nature of breach, categories + approximate number of data subjects, categories + approximate number of records, DPO / contact, likely consequences, measures taken / proposed. |
| Data-subject notification | as soon as feasible (Art. 34, only if high risk) | Direct in-app + email message in clear, plain language. Coordinate copy with legal counsel. |
| Documentation | continuously | Article 33 §5 — every breach is documented, whether notified or not. Stored in `security-private/breaches/`. |

CNIL portal: <https://notifications.cnil.fr/notifications/>. Confirm registration before launch (2026-06-01) and save credentials in 1Password.

### Pre-launch action (before 2026-06-01)

- [ ] Verify CNIL notification portal credentials work; do a dry run on the "test breach" path.
- [ ] DPO designated? — currently founder is data controller, no DPO required (< 250 employees, no large-scale special category processing). Re-evaluate at first B2B contract signing.
- [ ] DPA (Data Processing Agreement) signed with every processor in [`docs/legal/SUBPROCESSORS.md`](../legal/SUBPROCESSORS.md).

---

## 6. EU CRA reporting protocol (mandatory 2026-09-11 onward)

**Regulation:** [Regulation (EU) 2024/2847](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting) — Cyber Resilience Act.
**Scope confirmation:** Musaium mobile app + companion backend qualify as "products with digital elements with remote data processing solutions essential to core function" (DLA Piper 2026-02 analysis). Pure SaaS exemption does NOT apply.

### Trigger

A report qualifies as CRA-reportable if it is:

- An **actively exploited vulnerability** — reliable evidence of unauthorised exploitation in the wild, OR
- A **severe incident impacting product security** — security materially affected, malicious code execution enabled or possible.

Clock starts at "awareness" = initial assessment complete with reasonable certainty.

### Timeline

| Phase | Actively-exploited vulnerability | Severe incident |
|---|---|---|
| Early warning | **T+24 h** | **T+24 h** |
| Full notification | **T+72 h** | **T+72 h** |
| Final report | **T+14 d** after fix available | **T+1 month** after notification |

Filing happens through the [ENISA Single Reporting Platform (SRP)](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting). One notification routes to the Member-State CSIRT where Musaium's main establishment is located (France → CERT-FR <https://www.cert.ssi.gouv.fr/>), with ENISA receiving in parallel.

### Action checklist

- [ ] **T+0** — Open `[CRA-INCIDENT]` issue, timestamp awareness, log in `breach-log.md`.
- [ ] **T+24 h** — Submit early warning via ENISA SRP. Route through CERT-FR (main establishment = France). Minimum content: indication of any "malicious intent" + a description of the vulnerability or incident.
- [ ] **T+72 h** — Submit full notification with available facts, severity, impact, initial mitigation.
- [ ] **T+14 d after fix available (vuln) / T+1 month after notification (incident)** — Submit final report with root cause, mitigation, lessons learned, advisory link.
- [ ] **Throughout** — Coordinate with reporter, update affected users via in-app + email, post-mortem (template at `docs/operations/POSTMORTEM_TEMPLATE.md`).

### CRA pre-flight (before 2026-09-11)

- [ ] Register on the ENISA SRP — live since 2025-09-11 (see [`ENISA_SRP_ONBOARDING.md`](ENISA_SRP_ONBOARDING.md)); complete onboarding now rather than waiting.
- [ ] Save SRP credentials + designated reporter contact in 1Password.
- [ ] Confirm CERT-FR contact path (`certfr-info@ssi.gouv.fr`, +33 1 71 75 84 50).
- [ ] Dry run: submit a "test incident" to verify portal workflow + designated reporter assignment.
- [ ] Tracked in `docs/ROADMAP_PRODUCT.md` § C8 — Compliance VDP follow-up (items C8.3 + C8.4, deadline 2026-09-11).

---

## 7. Escalation matrix

| Severity / Type | Reach who | How |
|---|---|---|
| CRITICAL vuln / breach | Founder | SMS + Telegram + email |
| HIGH vuln / breach | Founder | Slack + email |
| GDPR-qualifying breach | Founder → CNIL within 72 h | CNIL portal + breach log |
| CRA-qualifying incident | Founder → CERT-FR within 24 h | ENISA SRP + email |
| Press / media inquiry on security topic | Founder | Hold response, draft with legal counsel before reply |
| Law-enforcement contact | Founder | Acknowledge in writing, request formal request via French judicial channel, do not disclose user data without warrant |
| Stripe / OpenAI / OVH / Sentry sub-processor incident | Founder | Acknowledge to provider + assess whether Musaium has its own GDPR / CRA obligations |

---

## 8. When to upgrade to a managed platform

Trigger conditions to evaluate YesWeHack VDP tier or Intigriti VDP:

- Report volume > 2 / week sustained for 3 weeks.
- Any B2B contract requiring proof of managed VDP (likely Q4 2026 / Q1 2027).
- More than 1 false-positive triage per week consuming founder cycles.

Evaluation order: [YesWeHack VDP](https://yeswehack.com/programs/vdp) (FR, EU data residency) → [Intigriti VDP](https://www.intigriti.com/) → HackerOne / Bugcrowd (US-headquartered, higher cost).

---

## 9. Operational tips

- **Phone tree:** if a CRITICAL report drops while AFK, ensure mobile push wakes you. Severity HIGH or CRITICAL = same-day reply, even if it's just "we see it, investigating."
- **Avoid public commitments you can't keep.** 90-day patch SLA is in `SECURITY.md`; if reality is 120 days, communicate to the reporter — never silently miss.
- **Save researcher rapport:** thank, credit, be professional. The first report shapes future reports.
- **Annual review:** in April 2027 (before security.txt expiry), audit this runbook against actual triage history, tune SLAs.

---

## Appendix A — `acknowledgement-template.md`

```
Subject: Re: <original subject> — Musaium Security Report Received

Hi <reporter>,

Thank you for reporting this to security@musaium.com. We have received your report and will triage it.

What happens next:
- Initial triage decision (in / out of scope, severity): within 10 working days
- Regular updates: at least every 2 weeks while we work on it
- Target patch + advisory: 90 days from today (we will tell you sooner or extend if needed)

If you have additional information, please reply on this thread.

Reference: SEC-yyyy-nnn

Thanks again for following coordinated disclosure.

— Musaium security
```

## Appendix B — `reproduce-request-template.md`

```
Subject: Re: <original subject> — Reproduction Details Needed

Hi <reporter>,

Thank you for the report. We are unable to reproduce the described behaviour as-is.
Could you please provide:

- Exact environment (OS, app version, build number, device model)
- Exact reproduction steps (every click / payload / network request)
- Screenshots, HAR file, or video if possible
- Time of reproduction (UTC) so we can correlate with our logs

We will resume triage as soon as we can reproduce.

Reference: SEC-yyyy-nnn

— Musaium security
```

## Appendix C — `out-of-scope-template.md`

```
Subject: Re: <original subject> — Out of Scope

Hi <reporter>,

Thank you for the report. After review, this is not in scope of our VDP because:

<one-paragraph reason — e.g. "the reported issue affects <third party> which we do not control; please report to them directly at <link>" / "this is a known limitation documented in our SECURITY.md Out of Scope section" / "we cannot reproduce the described issue; please provide additional details if you believe this is a real vulnerability">

If you disagree or have additional context, please reply and we will reconsider.

— Musaium security
```

## Appendix D — `advisory-template.md`

```
# Musaium Security Advisory MSEC-<yyyy>-<nnn>

**Summary:** <one-line>
**Severity:** <CRITICAL | HIGH | MEDIUM | LOW> (CVSS 4.0: <score>, <vector>)
**Affected:** <component / versions>
**Fixed in:** <component / version> — shipped <date>
**Credit:** <reporter name + handle, with permission> — <link or "anonymous">
**CVE:** <CVE-yyyy-nnnnn> (if assigned)

## Description

<3–6 sentences. What it is. Where it lives. What an attacker could achieve.>

## Impact

<Concrete user-impact. Personal data exposure? Account takeover? DoS?>

## Mitigation / workaround (if patch not yet shipped)

<Steps end-users can take. "Update to vX.Y.Z" if patched.>

## Timeline

- <date> — Reported to security@musaium.com
- <date> — Acknowledged
- <date> — Reproduced and triaged
- <date> — Patch shipped (<commit / release>)
- <date> — Public advisory
```

## Appendix E — `coordinated-disclosure-template.md`

```
Subject: Musaium Security Advisory MSEC-<yyyy>-<nnn> — Draft for your review

Hi <reporter>,

We have shipped a fix for the issue you reported. Here is the advisory we plan to publish on <date, 30 days from today>:

---
<paste Appendix D content>
---

Please let us know:
- If you want to be credited (and how you want to appear)
- If anything in the advisory is inaccurate
- If you need a different publication date for any reason

Thanks for the responsible disclosure.

— Musaium security
```

## Appendix F — `breach-log.md` (per-incident)

```
# SEC-<yyyy>-<nnn> — breach log

**Awareness:** <ISO 8601 UTC>
**Reporter / detection source:** <name / system>
**Initial severity:** <CRITICAL | HIGH | MEDIUM | LOW>
**Affected data categories:** <emails / photos / voice / location / payment / none>
**Affected data subjects:** <approximate count>
**GDPR notification required:** <YES + sent <date> | NO + reason>
**CRA notification required:** <YES + sent <date> | NO + reason>
**Mitigation in production:** <action + time>
**Patch shipped:** <commit + time>
**Final report:** <link>
**Root cause:** <one paragraph>
**Lessons learned:** <bullets>
```
