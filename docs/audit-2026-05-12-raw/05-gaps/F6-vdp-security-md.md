# F6 — Vulnerability Disclosure Infrastructure (VDP / security.txt / SECURITY.md)

**Agent:** F6 critical-gap | **Date:** 2026-05-13 | **Audit batch:** audit-2026-05-12
**Mission:** R10 + R22 — produce VDP policy + RFC 9116 `security.txt` + `SECURITY.md` + safe harbour + solo-founder triage runbook
**Target launch:** V1 2026-06-01 | **CRA reporting deadline:** 2026-09-11

---

## TL;DR

Musaium **does not currently expose any vulnerability reporting channel** — no `SECURITY.md`, no `/.well-known/security.txt`, no published VDP, no public security contact. Confirmed by `ls -la /Users/Tim/Desktop/all/dev/Pro/InnovMind/SECURITY.md` (No such file) and `ls museum-web/public/` (no `.well-known/`). This is a hard blocker for both:

1. **EU Cyber Resilience Act (CRA) Article 13 + 14** — manufacturers placing products with digital elements on the EU market must implement a coordinated vulnerability disclosure (CVD) policy, expose a single point of contact, and be ready for ENISA Single Reporting Platform reporting from **2026-09-11**. The mobile app submitted to App Store / Google Play with an EU developer presence qualifies as a "product with digital elements" — CRA scope debate (DLA Piper 2026-02) concludes pure SaaS is exempt only when no "remote data processing solution" is essential to the product. Musaium's chat / voice / vision pipeline is a remote data processing solution essential to the mobile app's core function → **CRA in scope**.
2. **Basic researcher hygiene** — without a published contact, a finder of a real vulnerability has only two options: (a) silent drop, (b) full public 0-day on social media. Both outcomes are worse than coordinated disclosure for a pre-launch B2C app handling photos + voice + B2B museum data.

**Effort to ship V1-ready VDP:** ~4-6 hours of focused work, no recurring cost. Concrete deliverables and file contents in §9 below — drop-in ready.

**Verdict:** Block 2026-06-01 launch on V1 VDP package being merged + deployed. Self-managed VDP (no platform fee) is the right scale for solo-founder pre-revenue; defer YesWeHack / Intigriti onboarding to post B2B revenue. CRA-specific reporting protocol (24h early warning, 72h notification) is a documented runbook obligation that hits on 2026-09-11 — must exist before that date even if no incident has occurred.

---

## 1. RFC 9116 security.txt — required fields, format, hosting

Source of truth: [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html) ([IETF datatracker](https://datatracker.ietf.org/doc/rfc9116/)).

### Fields

| Field | Status | Purpose | Notes |
|---|---|---|---|
| `Contact` | **MUST** (≥1) | URI for reporting — `mailto:`, `tel:`, or `https://` | Multiple = preference order. Should be a monitored channel. |
| `Expires` | **MUST** (exactly 1) | RFC 3339 timestamp after which file is stale | Recommended < 1 year in future. Renew before this date. |
| `Encryption` | SHOULD | URI to PGP key (HTTPS, `openpgp4fpr:`, `dns:`) | Field MUST NOT be the key itself — points to it. |
| `Acknowledgments` | SHOULD | URI to hall-of-fame page | Plural deliberate (RFC typo: "Acknowledgments" not "Acknowledgements"). |
| `Preferred-Languages` | SHOULD | RFC 5646 tags, comma-separated | Single field, multiple values. Example: `en, fr`. |
| `Canonical` | SHOULD | Canonical URL of this file | Required if signed. Anti-spoofing. |
| `Policy` | SHOULD | URL to full VDP | Links the txt to the human-readable page. |
| `Hiring` | optional | Security job board URL | Skip for pre-launch. |
| `CSAF` | optional (RFC 9116 §2.5.4) | Link to CSAF advisory provider-metadata.json | Defer — not yet emitting CSAF feeds. |

### Hosting requirements

- **Location:** `https://<domain>/.well-known/security.txt` — RFC 8615 well-known URI tree. NOT `/security.txt` at root (legacy only, may redirect).
- **MIME:** `text/plain; charset=utf-8`.
- **HTTPS only** — HTTP retrieval explicitly forbidden by RFC 9116 §3.
- **Scope:** Per-domain. `musaium.app/.well-known/security.txt` does NOT cover `api.musaium.app`. Each public hostname needing one ships its own (or redirects to the canonical).
- **CRLF or LF** line endings, `#` for comments, case-insensitive field names.

### Signing (optional but recommended once stable)

OpenPGP cleartext signature per RFC 4880 §7. Requires `Canonical` field inside the signed envelope. Recommended once a PGP key for `security@musaium.app` is published; not blocking for V1.

Refs: [securitytxt.org](https://securitytxt.org/), [Implementation Guide](https://responsibledisclosure.io/guides/security-txt-implementation/), [ScanGov standards entry](https://standards.scangov.org/rfc9116/).

---

## 2. disclose.io 2026 — VDP template framework

[disclose.io](https://disclose.io/) maintains the open-source CVD / VDP standard. The [Policymaker generator](https://policymaker.disclose.io/) and [dioterms repo](https://github.com/disclose/dioterms) provide template language with permissive (CC0) reuse.

### disclose.io 5-level maturity ladder

| Level | What it requires |
|---|---|
| **security.txt** | RFC 9116 file only — no human-readable policy |
| **Basic** | Public policy + official channel |
| **Partial** | Basic + partial safe harbour (limited authorisations) |
| **Full** | Basic + full safe harbour (anti-hacking + anti-circumvention + ToS exemption) |
| **Full with CVD** | Full + proactive coordinated disclosure timeline commitment |

**Target for Musaium V1:** **Full** (no proactive disclosure commitments yet — solo founder can't guarantee timelines we'd publish). Upgrade to **Full with CVD** once a security delegate exists or a bug bounty platform handles intake.

### Core dioterms components (verified against [core-terms-vdp.md](https://github.com/disclose/dioterms/blob/master/core-terms-vdp.md))

1. Introduction / commitment to security
2. Systems in Scope
3. Out of Scope
4. Organisation commitments (response timeline, remediation effort, safe harbour extension)
5. Researcher expectations (good-faith rules)
6. Official channels (single point of contact)
7. Safe Harbour clause

Authorisation language from dioterms (verbatim, paraphrased for inclusion):

> When conducting vulnerability research under this policy, your activities are considered: authorised concerning any applicable anti-hacking laws; authorised concerning any relevant anti-circumvention laws; exempt from restrictions in our Terms of Service / Acceptable Use Policy that would interfere with security research; lawful, helpful to the overall security of the Internet, and conducted in good faith.

Safe Harbour applies only to legal claims under our control and cannot bind third parties (e.g. the iOS App Store, Google Play, OVH, Stripe, OpenAI, museum data partners) — this caveat is explicit in the dioterms text and must remain explicit in our policy.

---

## 3. EU CRA — what ENISA expects

Regulation (EU) 2024/2847 (CRA), effective dates relevant to Musaium:

| Date | Obligation |
|---|---|
| **2024-12-10** | CRA entered into force |
| **2026-09-11** | **Vulnerability + incident reporting obligations begin** — Article 14 / 18 |
| **2027-12-11** | Full CRA applicability — Article 13 vulnerability handling, conformity assessment, CE marking |

Sources: [European Commission CRA reporting page](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting), [Brightdefense 2026 deadline summary](https://www.brightdefense.com/news/eu-cyber-resilience-act-2026-reporting-deadline/), [Keysight countdown](https://www.keysight.com/blogs/en/tech/nwvs/2025/09/11/one-year-countdown-to-eu-cra-compliance-september-11-2026-changes-everything), [Hogan Lovells 2026 milestones](https://www.hoganlovells.com/en/publications/eu-cyber-resilience-act-getting-ready-for-cra-compliance-in-2026).

### CRA Article 13 vulnerability handling — what must exist

Compiled from the [Center for Cybersecurity Policy guide](https://www.centerforcybersecuritypolicy.org/insights-and-research/vulnerability-management-under-the-cyber-resilience-act), [Tributech 8 vulnerability handling requirements](https://www.tributech.io/blog/cra-8-vulnerability-handling-requirements), [HackerOne CRA readiness blog](https://www.hackerone.com/blog/cyber-resilience-act-vdp-2026-reporting-readiness):

1. **CVD policy + single intake channel** — published, monitored.
2. **SBOM** — identify and document components in the product (already covered by F-series audit item for backend/mobile).
3. **Vulnerability tracking + remediation** — issue tracker with severity tags + SLA.
4. **Free security updates** without undue delay, with accompanying advisory.
5. **Public advisory on remediation** — description, severity, impact, mitigation steps. CVE preferred where applicable.
6. **Support period commitment** — minimum 5 years from market placement unless expected use is shorter. Must be communicated to users.
7. **Mandatory CSIRT + ENISA reporting** (see §3 timeline below) for actively exploited vulnerabilities AND severe incidents impacting product security.
8. **Anonymous reporting path** — CRA explicitly requires VDPs allow direct-to-vendor AND anonymous-via-CSIRT routes (Article 13 + Recital 71).

### CRA reporting clock (2026-09-11 onward)

Trigger = "awareness," defined as completing initial assessment with reasonable certainty.

| Phase | Actively exploited vulnerability | Severe incident |
|---|---|---|
| Early warning | **24 hours** | **24 hours** |
| Full notification | **72 hours** | **72 hours** |
| Final report | **14 days** after fix available | **1 month** after notification |

Filing happens through the [ENISA Single Reporting Platform (SRP)](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting). One notification routes to the Member-State CSIRT where the manufacturer's main establishment is located, with ENISA receiving in parallel (except in narrow exceptional circumstances).

### CRA scope question for Musaium

Pure SaaS is exempt — but the Musaium mobile app, with its companion backend providing remote data processing essential to core function (chat, voice, vision), is in scope ([DLA Piper 2026-02 analysis](https://www.dlapiper.com/en/insights/publications/2026/02/cyber-resilience-act-the-fine-line-between-saas-and-digital-products)). The decisive test: "Is it placed on the market as a product?" — Yes (App Store + Google Play distribution).

---

## 4. SECURITY.md — GitHub conventions

GitHub renders `SECURITY.md` (root, `docs/`, or `.github/`) as a tab on the repo and links from the "Report a security issue" path in any new issue. Reference templates: [GitHub form-templates](https://github.com/github/form-templates/blob/main/SECURITY.md), [Microsoft App-Templates](https://github.com/microsoft/App-Templates/blob/main/SECURITY.md), [Ory awesome-ory](https://github.com/ory/examples/blob/master/SECURITY.md), [standard/.github](https://github.com/standard/.github/blob/master/SECURITY.md).

Required sections (per [OWASP Vulnerability Disclosure Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html) + [Springer 2026 empirical study on SECURITY.md adoption](https://link.springer.com/article/10.1007/s10664-025-10794-z)):

1. Supported versions (what is in support, what is EOL)
2. Reporting channel (email or platform, no GitHub issues for security)
3. Optional PGP key
4. Response SLA (acknowledge / triage / remediation targets)
5. Safe harbour summary + link to full VDP
6. What we do NOT consider in scope (DoS, social engineering, physical, third-party out-of-control items)
7. Disclosure timeline expectation

Linked from: repository README, project website footer, `Policy:` field of `security.txt`, mobile app legal screen.

---

## 5. Safe-harbour language — EU jurisdiction matters

Anti-hacking laws relevant to Musaium (EU developer, French + EU customers, US App Store reach):

| Jurisdiction | Law | Notes |
|---|---|---|
| France | Article 323-1 to 323-7 Code pénal | "Accès et maintien frauduleux dans un système" — broad. Safe harbour clause provides documented authorisation evidence for good-faith research, but cannot pre-empt criminal prosecution; mitigates likelihood. |
| EU | NIS2 Directive 2022/2555, transposing national laws | Article 12 mandates Member-State CSIRT coordination of CVD. Does not directly grant researcher immunity ([Oxford Journal of Cybersecurity 2026 paper on EU researcher protection gaps](https://academic.oup.com/cybersecurity/article/12/1/tyag002/8449232)). |
| EU | CRA + EUCC scheme | Encourages CVD policy creation but does not itself create researcher immunity. |
| USA | CFAA 18 U.S.C. § 1030 | DOJ 2022 policy declines to prosecute good-faith security research; safe harbour clause documents intent. |
| Germany | StGB §202c "Hackerparagraph" | Notoriously broad — explicit written authorisation is the practical defence. |
| Netherlands / Belgium / others | Various | National CSIRT coordination exists; written VDP authorisation is the universal cover. |

**Pragmatic conclusion:** Even though no EU law fully shields good-faith researchers, an explicit written safe-harbour clause is the best documented evidence of authorisation, and is what every EU CSIRT and researcher community expects. We will adopt the **disclose.io Full safe harbour** wording, qualified for the limits we cannot waive (third-party services, user privacy harms).

---

## 6. Bug-bounty platforms 2026 — comparison

Sources cross-checked: [gbhackers 2026 top 10](https://gbhackers.com/best-bug-bounty-platforms/), [CloudSEK 2026 review](https://www.cloudsek.com/knowledge-base/best-bug-bounty-platforms), [StationX beginner guide 2026](https://www.stationx.net/bug-bounty-programs-for-beginners/), [TrainingCamp 2026 platform guide](https://trainingcamp.com/articles/the-best-bug-bounty-websites-in-2026-a-researchers-guide-to-hackerone-bugcrowd-and-beyond/).

| Platform | HQ | Strengths | Pricing tier | Musaium fit |
|---|---|---|---|---|
| **HackerOne** | USA | Largest researcher pool (1.5M+), polished triage workflow, enterprise SLAs, mature CRA-readiness content | Public VDP free for open programs; paid for managed triage | Overkill pre-revenue; consider once B2B SaaS spend justifies managed triage |
| **Intigriti** | Belgium 🇪🇺 | EU-native, GDPR-clean by default, OFAC screening, growing pool, smooth onboarding for new programs | Free public VDP; paid managed bug bounty | **Best fit if going managed** — EU data residency aligns with Musaium GDPR profile |
| **YesWeHack** | France 🇫🇷 | EU/EMEA leader, less crowded → fewer duplicates, French-speaking support, CRA-aligned VDP setup wizard ([yeswehack.com/programs/vdp](https://yeswehack.com/programs/vdp)) | Free VDP tier available; managed bounty paid | **Best fit for a French-headquartered solo founder** — language, jurisdiction, CRA messaging |
| **Bugcrowd** | USA / Aus | Mature managed services, "Vulnerability Rating Taxonomy" widely accepted | Paid | Skip pre-revenue |
| **Self-managed** | — | Zero cost, full control, simple email intake | Free | **V1 starting point** — keeps it cheap until report volume justifies a platform |

**Recommendation for V1 (2026-06-01 → end of 2026):** Self-managed VDP with `security@musaium.app` as primary intake, RFC 9116 `security.txt` published, dioterms-derived policy page on the website. Re-evaluate at Q1 2027 (post B2B contracts) — if report volume exceeds ~2/week or if a B2B prospect contractually requires managed triage, migrate to YesWeHack free VDP tier (no platform fee, same intake structure, gives a CSIRT-aligned anonymous route).

---

## 7. Solo-founder triage process — what to delegate vs. own

Reality check from [Bugcrowd VDP vs. Managed Bug Bounty guide](https://www.bugcrowd.com/blog/vulnerability-disclosure-program-or-managed-bug-bounty-how-to-determine-which-program-is-best-for-you/), [Intigriti DIY vs. outsourced analysis](https://www.intigriti.com/blog/business-insights/diy-or-outsourced-bug-bounty-programs-what-s-best-for-your-business), [securitytemplates/sectemplates bug bounty runbook v1](https://github.com/securitytemplates/sectemplates/blob/main/bug-bounty/v1/Bug_bounty_runbook.md):

For a 10-person company, triage typically costs 5–10 hours/week at moderate volume. Solo founder ≈ 0 hours/week budget. Strategy:

1. **Own:** Inbox monitoring (`security@musaium.app` → email + Slack mobile push), initial acknowledgement (24h target), final remediation decision.
2. **Own (templated):** First-pass severity classification using CVSS 4.0 + Musaium-specific scope map. Templates and checklists make this <15 min/report.
3. **Defer:** Reproduction labs, formal CVE issuance, multi-stakeholder coordination. If a report demands these, escalate to a paid hour from a friendly security consultant (or punt to YesWeHack managed once we cross that threshold).
4. **Automate:** Auto-reply on inbox with a "received" template citing 5-day initial triage SLA, link to the VDP, no scope confirmation yet.
5. **Track:** Use the existing backend issue tracker (private GitHub issues with `security` label, not public) — one issue per report, never disclose until patched + 30 days.

Full runbook content: §9.5 below.

---

## 8. Disclosure timeline — 90-day default, codified

CVD industry default = 90 days from receipt to coordinated public disclosure ([Google Project Zero](https://googleprojectzero.blogspot.com/p/vulnerability-disclosure-policy.html), [FIRST multi-party guidelines v1.1](https://www.first.org/global/sigs/vulnerability-coordination/multiparty/guidelines-v1-1), [ISO/IEC 29147:2018](https://www.iso.org/standard/72311.html)).

**Musaium V1 policy:**

- Target patch + advisory within **90 days** of acknowledged report.
- Extension up to **+30 days** when remediation is complex, communicated to reporter.
- **Project Zero "90+30"** pattern — if patched within 90 days, public disclosure 30 days after patch ships, allowing user update window. If not patched within 90 days, coordinate with reporter for disclosure timing (default: reporter has the call).
- **Exception — actively exploited vulnerability (CRA-classified):** Trigger CRA early warning to CSIRT within 24h, prioritise fix, public advisory follows fix availability per CRA Article 14.
- **CVE assignment:** request via a CVE Numbering Authority (CNA) — currently we are not a CNA; route through MITRE direct request form or via downstream platform (YesWeHack issues CVEs when triaging on their platform).

---

## 9. Concrete deliverables — drop-in file contents

### 9.1 `SECURITY.md` (repo root)

Final content (Musaium-customised, dioterms-derived). Drop at `/Users/Tim/Desktop/all/dev/Pro/InnovMind/SECURITY.md`:

```markdown
# Security Policy — Musaium

We take the security of Musaium and the data of our visitors, museum partners, and contributors seriously. This policy describes how to report vulnerabilities and what you can expect from us in return.

## Supported versions

Musaium is in pre-launch V1 (target 2026-06-01). Until V1 General Availability, the only supported version is `main` (backend, web, mobile). After GA, the two most recent minor releases of each app receive security updates.

| Component | Branch / Version | Status |
|---|---|---|
| Backend (`museum-backend`) | `main` | Supported |
| Mobile (`museum-frontend`) | latest published EAS build | Supported |
| Web (`museum-web`) | `main` | Supported |
| All other branches / older releases | — | Not supported, do not deploy |

## Reporting a vulnerability

**Email:** [security@musaium.app](mailto:security@musaium.app)

Please include:

- Description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept, request payloads, screenshots)
- Affected component and version (backend / mobile / web)
- Your contact info (so we can credit you; anonymous reports are also welcome)

**PGP / encrypted reports:** PGP key fingerprint will be published at `https://musaium.app/.well-known/pgp-key.txt` once V1 ships. If you need encrypted submission before then, email `security@musaium.app` requesting a key exchange.

**Please do not** open public GitHub issues, post on social media, or contact unrelated team members for vulnerability reports. Use the security email only.

## Our commitments

- **Acknowledge** your report within **5 working days**.
- **Initial triage** within **10 working days**: confirmation, severity assessment, scope decision.
- **Status updates** at least every **2 weeks** during remediation.
- **Patch + advisory** target within **90 days** of acknowledged in-scope reports, with a possible **+30 days** extension for complex fixes (we will tell you).
- **Credit** in our public security advisories and on our hall-of-fame page if you wish (and your report is in scope and accurate).

## Scope

**In scope**

- `musaium.app` and `*.musaium.app` (production web + API endpoints)
- The Musaium iOS app (App Store, current version)
- The Musaium Android app (Google Play, current version)
- The OpenAPI surface served at `api.musaium.app`

**Out of scope**

- Third-party services we use but do not control: App Store, Google Play, OVH, Stripe, OpenAI, Deepseek, Google AI, Sentry, museum data partners, CDN providers. Report directly to them.
- Denial-of-service (DoS / DDoS), volumetric attacks, resource exhaustion
- Social engineering of staff, contractors, museums, or users (phishing, vishing, SMS)
- Physical security testing (office access, devices)
- Automated scanner output without proof of real impact
- Findings limited to outdated dependency versions without a demonstrated exploit path
- Reports requiring already-compromised user accounts or already-rooted / jailbroken devices
- Self-XSS, missing security headers without an exploit, clickjacking on non-sensitive pages, missing rate limiting on non-sensitive endpoints
- Issues affecting only unsupported / outdated browsers or OS versions
- Vulnerabilities only exploitable via debug builds or developer-mode features

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

## Full policy

The complete Vulnerability Disclosure Policy, including the most recent version of these terms, lives at: **https://musaium.app/security**

The RFC 9116 `security.txt` file lives at: **https://musaium.app/.well-known/security.txt**

## Coordinated disclosure

We follow coordinated disclosure: we will work with you toward a public advisory, credit you (if you wish), and publish the advisory at https://musaium.app/security/advisories after a fix is available. Default coordination window is 90 days from acknowledgement; we may agree shorter or longer windows with you as needed.

## Hall of fame

Researchers who report valid in-scope issues are listed (with permission) at https://musaium.app/security/hall-of-fame after the issue is fixed.

---

Last updated: 2026-05-13 — Maintainer: Musaium (rivet.maxime@yahoo.fr / security@musaium.app)
```

### 9.2 `security.txt` content

Final content. Drop at `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/public/.well-known/security.txt`:

```
# Musaium security disclosure contact (RFC 9116)
# See https://musaium.app/security for the full policy.

Contact: mailto:security@musaium.app
Contact: https://musaium.app/security
Expires: 2027-05-13T00:00:00Z
Preferred-Languages: en, fr
Canonical: https://musaium.app/.well-known/security.txt
Policy: https://musaium.app/security
Acknowledgments: https://musaium.app/security/hall-of-fame
# Encryption: PGP key TBD; email security@musaium.app to request key exchange.
```

**Renewal calendar:** add a recurring reminder for **2027-04-15** (30 days before expiry) to regenerate this file with a new `Expires` date. Stale `Expires` is the most common security.txt failure mode ([uriports adoption study](https://www.uriports.com/blog/security-txt/)).

### 9.3 Next.js hosting — static file route

The `museum-web` app uses Next.js App Router. Per [Next.js public folder convention](https://nextjs.org/docs/pages/api-reference/file-conventions/public-folder), static files in `public/` are served at root. No code change needed — just place the file:

```
museum-web/
  public/
    .well-known/
      security.txt        ← new file, content from §9.2
```

After deployment, `https://musaium.app/.well-known/security.txt` will serve the file with `Content-Type: text/plain; charset=utf-8` automatically (Vercel/Next.js infers from `.txt`; verify in production with `curl -I https://musaium.app/.well-known/security.txt`).

**Verification commands:**

```bash
# Local
curl -I http://localhost:3001/.well-known/security.txt
# Production after deploy
curl https://musaium.app/.well-known/security.txt
# Online validator: https://securitytxt.org/?url=musaium.app
# Or: https://www.sitesecurityscore.com/tools/security-txt-validator
```

### 9.4 `museum-web/src/app/[locale]/security/page.tsx` — public VDP page

Shape (i18n via existing locale segment). The page should render the same human content as `SECURITY.md`, structured for a marketing site. Suggested skeleton:

```tsx
// museum-web/src/app/[locale]/security/page.tsx
import { Metadata } from 'next';

type Props = { params: Promise<{ locale: 'fr' | 'en' }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'fr' ? 'Politique de divulgation des vulnérabilités' : 'Vulnerability Disclosure Policy',
    description: 'Musaium security policy, safe harbour and reporting channel for security researchers.',
    alternates: {
      canonical: `https://musaium.app/${locale}/security`,
      languages: { fr: '/fr/security', en: '/en/security' },
    },
  };
}

export default async function SecurityPage({ params }: Props) {
  const { locale } = await params;
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-neutral">
      <h1>{t('Vulnerability Disclosure Policy', 'Politique de divulgation des vulnérabilités')}</h1>

      <p>{t(
        'We take the security of Musaium seriously. This page describes how to report a vulnerability and what you can expect from us.',
        'La sécurité de Musaium et de ses utilisateurs nous tient à cœur. Cette page décrit comment signaler une vulnérabilité et ce que vous pouvez attendre de nous.',
      )}</p>

      <h2>{t('Reporting channel', 'Canal de signalement')}</h2>
      <p>
        <strong>Email:</strong>{' '}
        <a href="mailto:security@musaium.app">security@musaium.app</a>
      </p>
      <p>
        <a href="/.well-known/security.txt">RFC 9116 security.txt</a> ·{' '}
        <a href="https://github.com/InnovMind/musaium/blob/main/SECURITY.md">SECURITY.md</a>
      </p>

      {/* Sections: Scope, Out of scope, Rules, Commitments / SLA, Safe Harbour, Coordinated disclosure, Hall of fame */}
      {/* Mirror SECURITY.md content with locale-aware copy. Use anchors so security.txt Policy: field can link to subsections. */}

      <p className="text-sm text-neutral-500">
        {t('Last updated', 'Dernière mise à jour')}: 2026-05-13
      </p>
    </main>
  );
}
```

**Notes:**

- File path is `museum-web/src/app/[locale]/security/page.tsx` (the `[locale]` segment already exists alongside `privacy/`, `support/`, etc., as observed by `ls museum-web/src/app/[locale]/`).
- i18n strings can be wired via the existing pattern observed in `museum-web/src/app/[locale]/privacy/` — verify the project's i18n loader before merging (e.g. `next-intl`, custom `useTranslations` hook, or hand-rolled `t()`).
- Link from `museum-web` footer, README, mobile `Legal` screen.
- Add to `museum-web/src/app/sitemap.ts` so search engines + researchers discover it.

### 9.5 `docs/security/vdp-runbook.md` — solo founder triage runbook

Content (drop at `/Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/security/vdp-runbook.md`):

```markdown
# VDP Runbook — Solo Founder Triage

**Audience:** Musaium founder + future security delegate
**Goal:** Handle inbound security reports without breaking SLA promises in SECURITY.md
**Source of truth for public-facing commitments:** [SECURITY.md](../../SECURITY.md) — never drift this runbook below those commitments.

## Intake monitoring

| Channel | Watch how | Latency target |
|---|---|---|
| `security@musaium.app` | Forward to founder primary inbox + Slack `#security` channel (mobile push enabled) | Notify within 4h, even on weekends |
| GitHub Issues with `security` label | Auto-close + reply with security@ pointer (these are not the channel) | — |
| App Store / Play Console developer feedback | Weekly scan; route any security-flavour reports to `security@` | Weekly |

## Triage process — per report

### Step 1: Acknowledge (within 5 working days, target 24h)

Reply using `acknowledgement-template.md` (see appendix). Confirm receipt, do NOT confirm scope yet.

### Step 2: Reproduce (within 10 working days)

- Set up the exact described environment (test account, staging if exists, otherwise local Docker).
- Reproduce; capture screenshots / logs / requests.
- If cannot reproduce, ask researcher for clarification before closing.

### Step 3: Classify

- **Scope check:** Is target in §Scope of SECURITY.md? If out-of-scope, send `out-of-scope-template.md` with brief reason.
- **Severity:** Use CVSS 4.0 ([https://www.first.org/cvss/calculator/4.0](https://www.first.org/cvss/calculator/4.0)). Save the vector string in the issue.
- **CRA trigger?** If "actively exploited vulnerability" or "severe incident impacting product security" applies, escalate IMMEDIATELY per §CRA Reporting Protocol below.
- **Risk to users:** Personal data exposure? Auth bypass? Payment? Voice/photo exfiltration? — anything CRITICAL or HIGH calls for same-day rollback / mitigation.

### Step 4: Track

- Open a **private** GitHub issue in `InnovMind/musaium` with `security` label and `severity/<level>` label.
- Title format: `[SEC] <component> — <one-line>`
- Body contains: CVSS vector, reporter handle (with permission), reproduction steps, proposed fix path, target date.
- Link to email thread (don't paste researcher contact details into a public-history issue — use a `security-private/` repo if available, or note in a 1Password-managed CSV).

### Step 5: Remediate

- Build patch in a branch named `fix/security/<short-id>`.
- Squash-merge to main + ship.
- Verify in production (`pnpm smoke:api` for backend, manual e2e for mobile/web).

### Step 6: Disclose

- Draft advisory: summary, affected versions, fix version, severity, credit, mitigations.
- Publish at `https://musaium.app/security/advisories/<id>` (page TBD).
- Notify reporter — give them a chance to review before going live.
- Default public disclosure: **30 days after patch ships** (Project Zero 90+30 pattern).
- Request CVE via [MITRE form](https://cveform.mitre.org/) for any CVSS ≥ 4.0 finding.

### Step 7: Credit

- Add reporter (with permission) to `https://musaium.app/security/hall-of-fame`.

## CRA reporting protocol (mandatory 2026-09-11 onward)

If a report qualifies as:

- **Actively exploited vulnerability** — reliable evidence of unauthorised exploitation in the wild, OR
- **Severe incident impacting product security** — security materially affected, malicious code execution enabled or possible

Then the CRA 24h / 72h / 14-day clock starts at "awareness" (= initial assessment complete with reasonable certainty).

**Action checklist:**

- [ ] **T+0:** Open `[CRA-INCIDENT]` issue, timestamp awareness.
- [ ] **T+24h:** Submit early warning via [ENISA Single Reporting Platform](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting). Route through French CSIRT (CERT-FR) if main establishment = France.
- [ ] **T+72h:** Submit full notification with available facts.
- [ ] **T+14 days after fix available:** Submit final report (vulnerabilities) — or T+1 month (severe incidents).
- [ ] **Throughout:** Coordinate with reporter, update SECURITY.md status section if appropriate.

CSIRT and ENISA contact details (placeholder — verify before incident):

- CERT-FR (French national CSIRT for non-government entities): https://www.cert.ssi.gouv.fr/
- ENISA SRP portal: TBD, operational target 2026-09-11

**Founder action item before 2026-09-11:** verify the SRP onboarding flow (registration, credentials, designated reporter); save credentials in 1Password.

## Templates (appendix)

### `acknowledgement-template.md`

```
Subject: Re: <original subject> — Musaium Security Report Received

Hi <reporter>,

Thank you for reporting this to security@musaium.app. We have received your report and will triage it.

What happens next:
- Initial triage decision (in scope / out of scope, severity): within 10 working days
- Regular updates: at least every 2 weeks while we work on it
- Target patch + advisory: 90 days from today (we will tell you sooner / extend if needed)

If you have additional information, please reply on this thread.

Reference: <SEC-yyyy-nnn>

Thanks again for following coordinated disclosure.

— Musaium security
```

### `out-of-scope-template.md`

```
Subject: Re: <original subject> — Out of Scope

Hi <reporter>,

Thank you for the report. After review, this is not in scope of our VDP because:

<one-paragraph reason — e.g. "the reported issue affects <third party> which we do not control; please report to them directly at <link>" / "this is a known limitation documented in our SECURITY.md Out of Scope section" / "we cannot reproduce the described issue; please provide additional details if you believe this is a real vulnerability"/etc.>

If you disagree or have additional context, please reply and we will reconsider.

— Musaium security
```

### `coordinated-disclosure-template.md`

```
Subject: Musaium Security Advisory <id> — Draft for your review

Hi <reporter>,

We have shipped a fix for the issue you reported. Here is the advisory we plan to publish on <date, 30 days from today>:

---
<draft advisory: summary, affected versions, fix version, severity (CVSS), mitigation, credit>
---

Please let us know:
- If you want to be credited (and how you want to appear)
- If anything in the advisory is inaccurate
- If you need a different publication date for any reason

Thanks for the responsible disclosure.

— Musaium security
```

## Operational tips

- **Inbox hygiene:** route `security@` to a separate Gmail label + filter rule. Read every report; do not let it pile.
- **Phone tree:** if a CRITICAL report drops while AFK, ensure mobile push wakes you. Severity HIGH or CRITICAL = same-day reply, even if it's just "we see it, investigating."
- **Avoid public commitments you can't keep.** 90-day patch SLA is in SECURITY.md; if reality is 120 days, communicate it to the reporter — never silently miss.
- **Save researcher rapport:** thank, credit, be professional. The first report shapes future reports.
- **Annual review:** in April 2027 (before security.txt expiry), audit this runbook against actual triage history, tune SLAs.

## When to upgrade to a managed platform

Trigger conditions:

- Report volume > 2 / week sustained for 3 weeks
- Any B2B contract requiring proof of managed VDP (likely Q4 2026 / Q1 2027)
- More than 1 false-positive triage per week consuming founder cycles

Then evaluate [YesWeHack VDP tier](https://yeswehack.com/programs/vdp) (EU, free tier exists) or [Intigriti VDP](https://www.intigriti.com/), in that order.

---

Last updated: 2026-05-13.
```

---

## 10. Verdict

**V1 launch must ship the VDP package.** Blocking the 2026-06-01 launch on this is correct: CRA reporting obligations bite **3 months after launch** (2026-09-11), and there is no acceptable interpretation under which Musaium can ship to App Store + Google Play in EU markets without a published CVD policy and security contact.

### Effort estimate (solo founder)

| Task | Effort |
|---|---|
| Create `security@musaium.app` mailbox + forwarding + Slack push | 30 min |
| Write `SECURITY.md` from §9.1 (already drafted) — adapt + merge | 30 min |
| Write `museum-web/public/.well-known/security.txt` from §9.2 (already drafted) — copy + commit | 10 min |
| Build `museum-web/src/app/[locale]/security/page.tsx` from §9.4 skeleton — wire i18n, footer link | 90 min |
| Write `docs/security/vdp-runbook.md` from §9.5 (already drafted) — adapt + commit | 30 min |
| Update README + mobile Legal screen + web footer to link to VDP | 30 min |
| Register on ENISA SRP test environment when it goes live (target before 2026-09-11) | 60 min (one-shot) |
| Test pipeline: send test report to security@, walk runbook, confirm SLA timers work | 30 min |
| Add 2027-04-15 calendar reminder for security.txt renewal | 5 min |

**Total: ~5 hours** of focused work. All drafts in this document are drop-in ready; main effort is in the Next.js page implementation and the operational mailbox setup.

### Recurring cost

- **Zero monetary cost.** Self-managed.
- **Time cost:** estimated <2 hours/month at launch volume, scaling to 4-8 hours/month if app gains traction. Trigger to migrate to managed (YesWeHack VDP tier or Intigriti) is documented in the runbook.

### What this does NOT cover (out of scope for F6)

- SBOM generation for backend / mobile (separate audit item, CRA Article 13)
- Vulnerability monitoring of npm / pnpm dependencies (separate Dependabot / Renovate / supply-chain audit item)
- Pre-launch pentest (separate engagement; YesWeHack / Bugcrowd one-shot pentest is a reasonable pre-launch spend if budget allows ~€5-10k)
- CSAF advisory feed publication (defer until first advisory)
- Cyber insurance underwriting (separate gap)

### Acceptance criteria

VDP package considered done when:

- [ ] `https://musaium.app/.well-known/security.txt` returns 200, `text/plain`, passes [securitytxt.org validator](https://securitytxt.org/)
- [ ] `https://musaium.app/{fr,en}/security` renders the human VDP, listed in sitemap, linked from footer
- [ ] `SECURITY.md` is at repo root, visible on github.com/InnovMind/musaium "Security" tab
- [ ] `security@musaium.app` receives mail; first auto-reply works
- [ ] `docs/security/vdp-runbook.md` is in `docs/`, referenced from `docs/DOCS_INDEX.md`
- [ ] CERT-FR + ENISA SRP onboarding tasks are tracked in `docs/ROADMAP_TEAM.md` with 2026-09-11 deadline
- [ ] Mobile Legal screen + web footer link to `/security`

---

## Sources

### RFC 9116 / security.txt

- [RFC 9116 — A File Format to Aid in Security Vulnerability Disclosure (rfc-editor.org)](https://www.rfc-editor.org/rfc/rfc9116.html)
- [RFC 9116 IETF datatracker](https://datatracker.ietf.org/doc/rfc9116/)
- [securitytxt.org — quick start + generator](https://securitytxt.org/)
- [Implementing security.txt: A Practical Guide (responsibledisclosure.io)](https://responsibledisclosure.io/blog/post/implementing-security-txt/)
- [ScanGov RFC 9116 standards entry](https://standards.scangov.org/rfc9116/)
- [Security.txt File 2026 Guide (ZeriFlow)](https://zeriflow.com/blog/security-txt-file-guide)
- [security.txt validator (sitesecurityscore.com)](https://www.sitesecurityscore.com/tools/security-txt-validator)
- [security.txt Adoption and Frequent Mistakes (uriports.com)](https://www.uriports.com/blog/security-txt/)
- [CRA Setup Guide for security.txt (craevidence.com)](https://craevidence.com/blog/cra-security-txt-setup-guide)

### disclose.io / VDP templates

- [disclose.io — home](https://disclose.io/)
- [disclose.io Policymaker — VDP generator](https://policymaker.disclose.io/)
- [dioterms repo — open-source VDP terms](https://github.com/disclose/dioterms)
- [dioterms core-terms-vdp.md (verbatim safe harbour)](https://github.com/disclose/dioterms/blob/master/core-terms-vdp.md)
- [disclose.io VDP Programs directory + 5-level maturity](https://disclose.io/programs/)

### EU CRA + ENISA

- [European Commission CRA reporting obligations page](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting)
- [CRA full legislative summary](https://digital-strategy.ec.europa.eu/en/policies/cra-summary)
- [CRA reporting deadline analysis — Brightdefense 2026](https://www.brightdefense.com/news/eu-cyber-resilience-act-2026-reporting-deadline/)
- [Keysight: one-year countdown to CRA, 2026-09-11](https://www.keysight.com/blogs/en/tech/nwvs/2025/09/11/one-year-countdown-to-eu-cra-compliance-september-11-2026-changes-everything)
- [Hogan Lovells: EU CRA 2026 milestones](https://www.hoganlovells.com/en/publications/eu-cyber-resilience-act-getting-ready-for-cra-compliance-in-2026)
- [HackerOne: Preparing Your VDP for CRA 2026](https://www.hackerone.com/blog/cyber-resilience-act-vdp-2026-reporting-readiness)
- [YesWeHack: CRA Compliance Countdown](https://www.yeswehack.com/news/cyber-resilience-act-compliance-countdown)
- [DLA Piper: CRA SaaS vs. digital products — fine line](https://www.dlapiper.com/en/insights/publications/2026/02/cyber-resilience-act-the-fine-line-between-saas-and-digital-products)
- [Center for Cybersecurity Policy: Vulnerability Management under CRA](https://www.centerforcybersecuritypolicy.org/insights-and-research/vulnerability-management-under-the-cyber-resilience-act)
- [Tributech: CRA 8 vulnerability handling requirements](https://www.tributech.io/blog/cra-8-vulnerability-handling-requirements)
- [ENISA CRA reporting guide](https://www.eucyberresilience.com/reporting-enisa)

### Safe harbour + researcher protection

- [Oxford Journal of Cybersecurity 2026 — call for EU researcher protection](https://academic.oup.com/cybersecurity/article/12/1/tyag002/8449232)
- [HackerOne Safe Harbor FAQ](https://docs.hackerone.com/en/articles/8494502-safe-harbor-faq)

### CVD timelines + standards

- [ISO/IEC 29147:2018 — Vulnerability disclosure](https://www.iso.org/standard/72311.html)
- [ISO/IEC TR 5895:2022 — Multi-party CVD](https://www.iso.org/standard/81807.html)
- [FIRST multi-party CVD guidelines v1.1](https://www.first.org/global/sigs/vulnerability-coordination/multiparty/guidelines-v1-1)
- [Wikipedia: Coordinated vulnerability disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure)
- [ENISA CVD guideline brochure](https://www.enisa.europa.eu/sites/default/files/all_files/WEB_115207_Brochure%20NCSC_EN_A4.pdf)
- [OWASP Vulnerability Disclosure Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html)

### Bug bounty platforms

- [HackerOne](https://www.hackerone.com/)
- [Intigriti — EU bug bounty platform](https://www.intigriti.com/)
- [YesWeHack VDP product page](https://yeswehack.com/programs/vdp)
- [YesWeHack VDP setup help](https://helpcenter.yeswehack.io/vdp-setup)
- [Top 10 Bug Bounty Platforms 2026 (gbhackers)](https://gbhackers.com/best-bug-bounty-platforms/)
- [Best Bug Bounty Platforms 2026 (CloudSEK)](https://www.cloudsek.com/knowledge-base/best-bug-bounty-platforms)
- [Bugcrowd: VDP or Managed Bug Bounty?](https://www.bugcrowd.com/blog/vulnerability-disclosure-program-or-managed-bug-bounty-how-to-determine-which-program-is-best-for-you/)
- [Intigriti: DIY vs. outsourced bug bounty](https://www.intigriti.com/blog/business-insights/diy-or-outsourced-bug-bounty-programs-what-s-best-for-your-business)
- [securitytemplates/sectemplates — Bug Bounty Runbook v1](https://github.com/securitytemplates/sectemplates/blob/main/bug-bounty/v1/Bug_bounty_runbook.md)

### SECURITY.md examples

- [GitHub form-templates SECURITY.md](https://github.com/github/form-templates/blob/main/SECURITY.md)
- [Microsoft App-Templates SECURITY.md](https://github.com/microsoft/App-Templates/blob/main/SECURITY.md)
- [Standard JS SECURITY.md](https://github.com/standard/.github/blob/master/SECURITY.md)
- [Ory examples SECURITY.md](https://github.com/ory/examples/blob/master/SECURITY.md)
- [Springer: SECURITY.md adoption in Python libs (2026)](https://link.springer.com/article/10.1007/s10664-025-10794-z)

### Next.js hosting

- [Next.js public folder file conventions](https://nextjs.org/docs/pages/api-reference/file-conventions/public-folder)

### Triage SLA references

- [Phoenix Security: Vulnerability SLA & prioritisation](https://phoenix.security/vulnerability-timelines-sla-measurement-and-prioritization-the-how-and-the-why-of-application-and-cloud-security-objective-setting/)
- [GitLab handbook: Vulnerability Resolution SLAs](https://handbook.gitlab.com/handbook/security/product-security/vulnerability-management/sla/)
- [RankedRight: How to set SLAs in Vulnerability Management](https://www.rankedright.com/post/how-to-set-slas-in-vulnerability-management)
