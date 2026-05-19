# Incident contacts — regulators, CSIRTs, sub-processors

**Audience:** Musaium founder, on-call (and any future security delegate).
**Goal:** A single authoritative list of who to contact at 03:00 in a real incident, so we never spend the first 30 minutes hunting for a phone number under stress.
**Source of truth for public commitments:** [`SECURITY.md`](../../SECURITY.md).
**Last updated:** 2026-05-17. **Audit run:** `2026-05-17-w4-compliance-ops-release`.
**Verification cadence:** quarterly. Founder MUST re-validate each contact every 90 days — phone numbers and portal URLs drift silently.

---

## 1. French + EU regulators (primary)

### CNIL — French data protection authority

| Field | Value | Verified |
|---|---|---|
| Public phone | `+33 1 53 73 22 22` | 2026-05-17 (verified via <https://www.cnil.fr/fr/contacter-la-cnil>) |
| Out-of-hours pager | None — CNIL has no 24/7 line | n/a |
| Web portal (breach notification) | <https://notifications.cnil.fr> | 2026-05-17 |
| GDPR Article 33 SLA | **72 hours** from awareness | — |
| Dry-run runbook | [`docs/operations/CNIL_BREACH_NOTIFICATION_DRYRUN.md`](./CNIL_BREACH_NOTIFICATION_DRYRUN.md) | — |

### CERT-FR — French national CSIRT

| Field | Value | Verified |
|---|---|---|
| Email (intake) | `certfr-info@ssi.gouv.fr` | 2026-05-17 (verified via <https://www.cert.ssi.gouv.fr/contact/>) |
| Phone (work hours) | `+33 1 71 75 84 50` | 2026-05-17 (verified via same source) |
| 24/7 emergency | `cossi-coord@ssi.gouv.fr` (COSSI) — copy in any "actively exploited" report | 2026-05-17 |
| PGP key | <https://www.cert.ssi.gouv.fr/uploads/CERTFR-PGP.asc> | 2026-05-17 |
| When to call | Actively exploited vulnerabilities affecting OIV/OSE or large user base; supply-chain compromise; nation-state TTP indicators | — |

### ENISA — EU CRA reporting

| Field | Value | Verified |
|---|---|---|
| Single Reporting Platform | <https://srp.enisa.europa.eu> | 2026-05-17 |
| Support email | `srp-support@enisa.europa.eu` | 2026-05-17 |
| CRA Article 14 SLAs | **24 h** early warning · **72 h** notification · **14 d** final report — for actively exploited vulnerabilities | — |
| Onboarding runbook | [`docs/operations/ENISA_SRP_ONBOARDING.md`](./ENISA_SRP_ONBOARDING.md) | — |

## 2. Sub-processor security contacts

Use these for incidents *originating* at a sub-processor we depend on (e.g. an OpenAI outage causing degraded service, OVH infra incident, etc.).

| Provider | Status page | Security contact | Verified |
|---|---|---|---|
| OpenAI | <https://status.openai.com> | <security@openai.com> | 2026-05-17 |
| Google Cloud (Vertex / Maps / Speech) | <https://status.cloud.google.com> | <google-cpe@google.com> · <security@google.com> for vuln | 2026-05-17 |
| DeepSeek | <https://status.deepseek.com> | <security@deepseek.com> (HTTPS form fallback at <https://www.deepseek.com/security>) | 2026-05-17 |
| OVHcloud (VPS, mail, DNS) | <https://www.status-ovhcloud.com> | <security@ovh.com> · `+33 9 72 10 10 07` (technical support) | 2026-05-17 |
| AWS (Bedrock if used; S3 backups) | <https://health.aws.amazon.com/health/status> | AWS Security Center via console; `aws-security@amazon.com` for vuln reports | 2026-05-17 |
| Sentry | <https://status.sentry.io> | <security@sentry.io> | 2026-05-17 |
| Stripe (if billing live) | <https://status.stripe.com> | <security@stripe.com> | 2026-05-17 |
| Apple (App Store, MapKit) | <https://www.apple.com/support/systemstatus> | <product-security@apple.com> | 2026-05-17 |
| Google (Play Console) | (same as Google Cloud) | <security@google.com> | 2026-05-17 |
| Expo / EAS | <https://status.expo.dev> | <secure@expo.dev> | 2026-05-17 |
| Cloudflare (if used for CDN) | <https://www.cloudflarestatus.com> | <cna@cloudflare.com> | 2026-05-17 |

> Anything OTHER than the rows above is OUT of scope for our own VDP (`SECURITY.md` §Out of scope). Forward such reports to the vendor with a polite redirection, do NOT triage internally.

## 3. Internal escalation

| Role | Who | Channel |
|---|---|---|
| Tech Lead / founder | (founder) | Mobile push (primary), Slack `#security` (secondary) |
| Acting DPO | (founder, pre-V1) | Same as Tech Lead |
| Legal counsel | (TBD — fill once retained) | Email; pre-emptive 1Password item `legal:retainer-contact` |
| Insurance broker (cyber) | (TBD — fill once policy bound) | Email + phone, claims hotline |
| OVH account owner | (founder OVH login) | OVH manager portal |

> Once a security delegate or DPO is hired, replace "founder" with their name + 24/7 contact and bump the verification date.

## 4. 1Password vault layout

Vault `Musaium / Compliance` must contain the following items (do NOT paste their contents into this repo):

| Item | Type | Required fields |
|---|---|---|
| `cnil:notifications-portal` | Login | URL, email, password, TOTP secret |
| `enisa-srp:account` | Login | URL, email, password, TOTP secret |
| `enisa-srp:recovery-codes` | Secure note | 10 recovery codes |
| `cert-fr:pgp-fingerprint` | Secure note | Cached PGP fingerprint + last verified date |
| `ovh-manager:account` | Login | URL, customer code, password, TOTP secret |
| `sentry:org-owner` | Login | URL, email, password, TOTP secret |
| `legal:retainer-contact` | Identity | Once retained |
| `cyber-insurance:claims-hotline` | Secure note | Phone + policy number, once bound |

Founder is responsible for adding any future delegate as a vault member with `read-only` permission, except where they own the operation (e.g. a DPO gets write on `cnil:*` items).

## 5. Quarterly verification checklist

Run on the 1st calendar day of each quarter (set a recurring calendar event):

- [ ] Re-verify each phone number (call once, confirm it rings, hang up).
- [ ] Re-verify each email (send a "ping" with subject `[VERIFY] quarterly contact check — please disregard`).
- [ ] Re-verify each web URL (200 OK + correct content).
- [ ] Re-fetch CERT-FR PGP key, confirm fingerprint unchanged (or update `1Password / cert-fr:pgp-fingerprint`).
- [ ] Update the "Verified" column dates above.
- [ ] If any contact changed, commit the diff with message `chore(ops): refresh quarterly contact verification — Q<N>-<YYYY>`.

Drift > 6 months on any row → that row is **considered stale**; do not rely on it during an incident until re-verified.

## 6. Done = ?

TA4 (C8.4) is closed when:

- [ ] This file committed.
- [ ] `SECURITY.md` §"Reporting a vulnerability" mentions CERT-FR + ENISA SRP as escalation paths beyond our own intake (cross-link added in C8.4 SECURITY.md edit).
- [ ] All 1Password items in §4 exist (founder confirms in PR description).
- [ ] First quarterly verification done (the row dates are real, not placeholders).
