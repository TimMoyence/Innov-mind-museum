# Security Policy — Musaium

We take the security of Musaium and the data of our visitors, museum partners, and contributors seriously. This policy describes how to report vulnerabilities and what you can expect from us in return.

> **Quick links** — RFC 9116 advertisement: <https://musaium.com/.well-known/security.txt> · Human-readable VDP: <https://musaium.com/fr/security> · <https://musaium.com/en/security> · Triage runbook: [`docs/operations/VDP_RUNBOOK.md`](docs/operations/VDP_RUNBOOK.md).

## Supported versions

Musaium is in pre-launch V1 (target 2026-06-07, minimum — à reconfirmer). Until V1 General Availability, the only supported version is `main` (backend, web, mobile). After GA, the two most recent minor releases of each app receive security updates.

| Component | Branch / Version | Status |
|---|---|---|
| Backend (`museum-backend`) | `main` | Supported |
| Mobile (`museum-frontend`) | latest published EAS build | Supported |
| Web (`museum-web`) | `main` | Supported |
| All other branches / older releases | — | Not supported, do not deploy |

## Reporting a vulnerability

**Email:** [security@musaium.com](mailto:security@musaium.com)

Please include:

- Description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept, request payloads, screenshots)
- Affected component and version (backend / mobile / web)
- Your contact info (so we can credit you; anonymous reports are also welcome)

**PGP / encrypted reports:** PGP public key publication is pending pre-launch. Until then, contact [security@musaium.com](mailto:security@musaium.com) to coordinate an out-of-band encrypted channel (Signal, age, or vendor portal). The URL <https://musaium.com/.well-known/pgp-key.txt> will host the public key once generated per [`docs/operations/PGP_KEY_GENERATION.md`](docs/operations/PGP_KEY_GENERATION.md); algorithm, fingerprint, and expiry will be advertised here at that point.

**Please do not** open public GitHub issues, post on social media, or contact unrelated team members for vulnerability reports. Use the security email only.

**Regulator escalation paths** (used by us when a report meets thresholds; not a substitute for reporting to us first):

- **CERT-FR** (French national CSIRT) — `certfr-info@ssi.gouv.fr` · `+33 1 71 75 84 50` (verified 2026-05-17, source <https://www.cert.ssi.gouv.fr/contact/>).
- **ENISA Single Reporting Platform** (EU CRA Art. 14 reporting) — <https://srp.enisa.europa.eu>.
- **CNIL** (French DPA, GDPR Art. 33) — <https://notifications.cnil.fr>.

Full contact register (with quarterly verification cadence) lives in [`docs/operations/INCIDENT_CONTACTS.md`](docs/operations/INCIDENT_CONTACTS.md).

## Our commitments

- **Acknowledge** your report within **5 working days** (target 24 h).
- **Initial triage** within **10 working days**: confirmation, severity assessment, scope decision.
- **Status updates** at least every **2 weeks** during remediation.
- **Patch + advisory** target within **90 days** of acknowledged in-scope reports, with a possible **+30 days** extension for complex fixes (we will tell you).
- **Credit** in our public security advisories and on our hall-of-fame page if you wish (and your report is in scope and accurate).

## Scope

**In scope**

- `musaium.com` and `*.musaium.com` (production web + API endpoints)
- The Musaium iOS app (App Store, current version)
- The Musaium Android app (Google Play, current version)
- The OpenAPI surface served at `api.musaium.com`

**Out of scope**

- Third-party services we use but do not control: App Store, Google Play, OVH, Stripe, OpenAI, Deepseek, Google AI, Sentry, museum data partners, CDN providers. Report directly to them.
- Denial-of-service (DoS / DDoS), volumetric attacks, resource exhaustion.
- Social engineering of staff, contractors, museums, or users (phishing, vishing, SMS).
- Physical security testing (office access, devices).
- Automated scanner output without proof of real impact.
- Findings limited to outdated dependency versions without a demonstrated exploit path.
- Reports requiring already-compromised user accounts or already-rooted / jailbroken devices.
- Self-XSS, missing security headers without an exploit, clickjacking on non-sensitive pages, missing rate limiting on non-sensitive endpoints.
- Issues affecting only unsupported / outdated browsers or OS versions.
- Vulnerabilities only exploitable via debug builds or developer-mode features.

## Rules for researchers

- Make a **good-faith effort** to avoid harm to users, services, and data.
- Use **test accounts** you create yourself; never access another user's data.
- **Stop and report immediately** if you encounter personal data, payment data, or credentials that are not yours.
- **Do not exfiltrate, store, or share** any data you accidentally access.
- **Do not perform DoS, social engineering, or physical testing.**
- **Do not pivot to non-Musaium systems** or attack our suppliers / partners.
- Give us **reasonable time to remediate** before public disclosure (default 90 days).

## Safe harbour

When you conduct vulnerability research according to this policy, we consider your activities:

- **Authorised** under applicable anti-hacking laws (including the French Code pénal art. 323-1 et seq., the German StGB §202c, the US CFAA 18 U.S.C. §1030, the UK Computer Misuse Act, and equivalents).
- **Authorised** under applicable anti-circumvention laws (including art. 6 of EU Directive 2001/29/EC, US DMCA §1201).
- **Exempt** from restrictions in our Terms of Service and Acceptable Use Policy that would otherwise prohibit the activity.
- **Lawful, helpful to the security of our users, and conducted in good faith.**

We will not pursue legal action for good-faith research within this policy. If a third party brings legal action against you for activity that complied with this policy, we will make this safe harbour known.

**Limits we cannot waive:**

- This safe harbour applies only to legal claims under our control. It cannot bind third parties (App Store, Google Play, OVH, Stripe, OpenAI, museum partners). Be careful when testing components touching these.
- Activity outside this policy — willful harm, ransom demands, unauthorised data exfiltration, social engineering — is not covered.
- If law enforcement initiates action, we will, where lawful, advise that the activity was authorised under this policy.

## Coordinated disclosure

We follow coordinated disclosure: we will work with you toward a public advisory, credit you (if you wish), and publish the advisory at `https://musaium.com/security/advisories` after a fix is available. Default coordination window is **90 days** from acknowledgement; we may agree shorter or longer windows with you as needed (Project Zero "90 + 30" pattern — public disclosure 30 days after patch ships).

CRA-classified actively-exploited vulnerabilities trigger the ENISA Single Reporting Platform timeline (24 h early warning → 72 h notification → 14 days final report). Details in [`docs/operations/VDP_RUNBOOK.md`](docs/operations/VDP_RUNBOOK.md) §CRA reporting protocol.

## Hall of fame

Researchers who report valid in-scope issues are listed (with permission) at `https://musaium.com/security/hall-of-fame` after the issue is fixed.

## Full policy

The complete Vulnerability Disclosure Policy, including the most recent version of these terms, lives at <https://musaium.com/fr/security> (or `/en/security`). The RFC 9116 `security.txt` file lives at <https://musaium.com/.well-known/security.txt>.

---

Last updated: 2026-05-19 — Maintainer: Musaium (security@musaium.com).
