# ENISA Single Reporting Platform (SRP) — onboarding + dry-run

**Audience:** Musaium founder / CRA-designated contact.
**Goal:** Have a working ENISA SRP account BEFORE the EU Cyber Resilience Act (CRA) Article 14 vulnerability reporting clock starts. Article 14 mandates 24 h early-warning + 72 h notification + 14 d final report for **actively exploited vulnerabilities** in connected products — Musaium qualifies (mobile + web app touching personal data via cloud backend).
**Source of truth:** [`SECURITY.md`](../../SECURITY.md) §"Coordinated disclosure" + [`VDP_RUNBOOK.md`](./VDP_RUNBOOK.md) §6 CRA reporting protocol.
**Last updated:** 2026-05-17. **Audit run:** `2026-05-17-w4-compliance-ops-release`.
**TL executes** — account creation, identity verification, and a test submission on the live portal.

> ⚠️ The ENISA SRP launched on **2025-09-11** (Regulation (EU) 2024/2847 implementing act). It is the **single point** for CRA Art. 14 reports (replaces dispatching to multiple CSIRTs).
> Portal: <https://srp.enisa.europa.eu>.

---

## 1. Onboarding

### 1.1 Pre-flight

| # | Check | Pass criterion |
|---|---|---|
| 1 | Musaium has a legal entity registered in the EU | SIREN/SIRET on file (Pappers / Infogreffe lookup) |
| 2 | Founder identity verifiable (eIDAS / FranceConnect or notarised passport scan) | At least one accepted method |
| 3 | DNS for `musaium.com` resolves and we control it | `dig +short A musaium.com` matches expected IPs |
| 4 | Email `security@musaium.com` works | TA1 (C8.1) completed |
| 5 | At least one product is named in the application | `Musaium` mobile + web (CRA Article 3 §6 "product with digital elements") |

### 1.2 Create account

1. Go to <https://srp.enisa.europa.eu/account/register>.
2. Choose **"Manufacturer / Provider account"** (NOT "researcher").
3. Fill identity (legal name, SIREN, address, founder identity verification method).
4. Designate a **single point of contact** (SPOC):
   - Name: founder full legal name.
   - Email: `security@musaium.com` (NOT founder personal email — channel must outlive personnel changes).
   - Phone: a number reachable 24/7 within 1 h. Pre-V1, this is the founder's mobile. Mark a calendar reminder to revisit when a delegate is hired.
5. Identity verification: upload the eIDAS qualified certificate OR notarised passport scan. eIDAS preferred (instant); passport adds 5-10 business days lag.
6. Wait for activation email (target: same day for eIDAS, up to 10 business days for passport).
7. On first login, enable mandatory **2FA via TOTP** (Authy / 1Password / hardware key). Store recovery codes in 1Password `Musaium / Compliance` vault, item `enisa-srp:recovery-codes`.

### 1.3 Register products

In "My products" → "Add product":

| Field | Value |
|---|---|
| Product name | `Musaium` |
| Product type | `Mobile application` (iOS) + `Web application` |
| Component identifiers | `com.musaium.app` (iOS bundle), `musaium-frontend@<version>`, `musaium-backend@<version>`, `musaium-web@<version>` |
| Distribution channels | App Store, Google Play, web (`musaium.com`) |
| In-scope EU member states | All 27 (no exclusion) |
| First commercial release | 2026-06-01 (V1) |
| CRA conformity assessment route | self-declared (Annex IV, non-critical) — confirm before V1 launch |

Repeat declaration if the architecture changes materially (new in-scope product, e.g. desktop app).

## 2. Dry-run incident submission

> Use the **"Test mode"** toggle in the SRP submission form, which marks the report as a drill that does NOT trigger downstream regulator dispatch. Confirm the toggle is visible BEFORE filling any data; if absent, ENISA changed the UX → STOP and contact `srp-support@enisa.europa.eu`.

### 2.1 Scenario

> Fictional CRA Art. 14 case: on 2026-05-17 at 02:00 UTC, internal exploit telemetry (Sentry + WAF) detected active exploitation of a (fake) authentication bypass in `museum-backend@1.0.0-rc.1` (`POST /api/auth/social-login`, oauth state validation regression). One IP attempted 5 successful bypasses in 3 hours, all on test accounts. No real visitor data exfiltrated. Mitigation applied at 04:10 UTC: hotfix deployed reverting the regression. Detection-to-mitigation = 2 h 10 min.

### 2.2 Walkthrough

1. Log in to <https://srp.enisa.europa.eu/incidents/new>.
2. Toggle **"Test submission"** to ON.
3. Section "Identification": choose `Musaium` product + `museum-backend@1.0.0-rc.1`.
4. Section "Type": `actively exploited vulnerability`.
5. Section "CVE": none yet (CVE assignment is a separate step; placeholder).
6. Section "First detection": `2026-05-17T02:00:00Z`.
7. Section "Description": paste:

   ```
   Authentication bypass via oauth state validation regression in
   POST /api/auth/social-login (museum-backend@1.0.0-rc.1). Active
   exploitation observed from single IP. 5 successful bypasses
   against test accounts; no real visitor data exfiltrated.
   Mitigation: hotfix deployed at 2026-05-17T04:10Z reverting the
   regression. Detection-to-mitigation: 2h10. Root cause: rebase
   conflict silently dropped state check; pre-merge test coverage
   missing for this branch of the conditional.
   ```

8. Section "Affected users": `low — < 100 (test accounts only)`.
9. Section "Notification to data subjects under GDPR Art. 34": `non — no personal data exposure observed`.
10. Section "CVE assignment requested": `oui — request CVE`.
11. Click **"Submit early warning"** (24 h obligation surrogate). The portal returns a tracking ID `SRP-<yyyy>-<nnn>-TEST`. Screenshot.
12. Refresh the dashboard. The new test submission appears with a `TEST` badge. Screenshot.
13. Click the entry → **"Delete test submission"**. Confirm. Screenshot the deletion.

### 2.3 Evidence

- [ ] Screenshot account dashboard (proves login + product registered).
- [ ] Screenshot each section of the form completed.
- [ ] Screenshot the early-warning submission confirmation (tracking ID visible).
- [ ] Screenshot the dashboard with the `TEST` entry visible.
- [ ] Screenshot the deletion confirmation.
- [ ] Wall-clock timer: total time from login to deletion. Target ≤ 20 min for the 24 h Article 14 obligation to be realistic.

## 3. Findings template

```markdown
## ENISA SRP dry-run findings — 2026-05-17

- Account activation lag (registration → first login): __ business days.
- Product registration: smooth / blocked at … .
- Test submission UX: clear / confusing at … .
- 24 h surrogate submission wall-clock: __ min.
- Fields that surprised us / required ad-hoc copy: …
- Recommendation to amend `VDP_RUNBOOK.md` §6 CRA protocol: …
```

Append the rendered finding to [`VDP_RUNBOOK.md`](./VDP_RUNBOOK.md) §6 with the date and key insight.

## 4. Done = ?

TA3 (C8.3) is closed when:

- [ ] Account created and 2FA enabled.
- [ ] All 3 products declared (mobile iOS, mobile Android, web — `museum-backend` is backend-only, declared as a component).
- [ ] Test submission walkthrough executed (12 steps), evidence captured.
- [ ] Recovery codes stored in 1Password.
- [ ] Findings appended to VDP_RUNBOOK §6.
- [ ] Test entry deleted from the portal.

If identity verification stalls (notarised passport route), the task downgrades to BLOCKED-EXTERNAL — file an issue tracking the activation email.
