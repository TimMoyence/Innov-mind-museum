# R22 — EU Regulatory Compliance Audit (Musaium V1, launch 2026-06-01)

**Author** : research agent R22
**Date** : 2026-05-12
**Scope** : CRA, GDPR, AI Act, DSA, ePrivacy, NIS2, France/CNIL + Code consommation
**Honesty (UFR-013)** : claims verified via web search ; assumptions about Musaium's own status verified via filesystem reads (`docs/legal/`, `museum-backend/src/modules/auth/`). Where I infer (e.g. "Musaium not micro-enterprise" — TBD) I flag it explicitly.

---

## 0. TL;DR — Verdict for 2026-06-01 launch

**Launch is LEGALLY POSSIBLE** : Musaium falls in the favourable side of most thresholds (limited-risk AI, micro/small enterprise on DSA, GDPR DSR endpoints already implemented, AI Act Art. 50 disclosure shipped). **But 5 gaps are blocking in the strict sense** : (a) no published VDP / security.txt (CRA preparatory), (b) DPA template for B2B museum customers missing, (c) DPO formally not yet mandated (DPIA marks it TBD), (d) no `SUBPROCESSORS.md` published though DPIA references it, (e) the EU AI Act transparency Code of Practice consultation window closes 2026-06-03 — Musaium's Art. 50 design should be re-checked against the final guidelines once published.

**Critical near-term deadlines from V1 launch perspective** :
- **2026-06-28** — European Accessibility Act enforcement *already in force since 2025-06-28* — Musaium B2C app is in scope. Status TBD (need WCAG 2.1 AA proof on app + web).
- **2026-08-02** — EU AI Act Art. 50 transparency obligations become enforceable (already shipped per AiDisclosureModal — but verify against Final Guidelines).
- **2026-09-11** — CRA reporting obligation (Art. 14) starts. Requires VDP + ENISA SRP onboarding.
- **2027-12-11** — CRA full applicability + CE marking on PDEs. Mobile app + backend = in scope.

No regulation hard-bans the 2026-06-01 launch. The **legal risk surface is essentially GDPR enforcement** (CNIL has issued €475M in cookie/consent fines in 2025 alone against Google + Shein — small actors get fined too).

---

## 1. Regulatory matrix — applicability to Musaium

| Regulation | In force (key dates) | Applies to Musaium ? | Why |
|---|---|---|---|
| **GDPR** (Reg. 2016/679) | 2018-05-25, **ongoing** ; 2026 = EDPB coordinated enforcement on Art. 12-14 transparency | YES, fully | EU controller, processes personal data of EU residents (chat history, voice, geo, account) |
| **ePrivacy Directive 2002/58/EC** (transposed FR via L34-1 LCEN) | In force ; Regulation proposal **withdrawn Feb 2025** | YES, partial | Mobile push notifications, any cookie/tracker on web landing. Cookies = analytics requires consent. Musaium currently has **no analytics** per R18 → no banner needed today, but verify Sentry/PostHog config |
| **EU AI Act** (Reg. 2024/1689) | Entry into force 2024-08-01 ; Art. 50 transparency : **2026-08-02** ; GPAI Art. 53 enforcement : **2026-08-02** ; High-risk Annex III : 2027-08-02 | YES — **limited-risk deployer** | Conversational chatbot + voice = limited-risk per recital 132 ; not high-risk (not biometric ID, no profiling with significant effect, not education credential AI). Musaium = deployer (not GPAI provider) since it uses OpenAI/Google/DeepSeek models |
| **EU Cyber Resilience Act** (Reg. 2024/2847) | Entry into force 2024-12-10 ; reporting **2026-09-11** ; full apply **2027-12-11** | YES — mobile app with connected backend is a "PDE" | Per DLA Piper + Mobisec : any app on app store relying on connected backend = PDE. Pure SaaS without device-side software MAY be out — but Musaium ships an iOS/Android binary, so it's in. CE marking + VDP + ENISA reporting needed by 2027-12 / 2026-09 |
| **DSA** (Reg. 2022/2065) | In force 2024-02-17 | **NO** (likely) — Art. 19 micro/small enterprise exemption | DSA exempts platforms with < 50 employees AND < €10M turnover from most online-platform obligations (Section 4 + 5). Musaium = solo entrepreneur (1 person, no revenue yet → micro-enterprise). Status holds for first 12 months even if grown |
| **NIS2** (Dir. 2022/2555) | National transpositions by 2024-10-17 ; FR transposition delayed | **NO** | NIS2 size-cap excludes micro (<10 emp & <€2M) + small (<50 emp & <€10M). Musaium = micro until B2B revenue. Cultural/museum sector not in Annex I or II of NIS2 anyway |
| **EAA — European Accessibility Act** (Dir. 2019/882) | Enforced **2025-06-28** | YES, B2C app + web | "Services to consumers" including mobile apps. Musaium B2C is in scope. WCAG 2.1 AA via EN 301 549 = operative benchmark. Risk = formal mise en demeure (French AFM-style actions filed Nov 2025) |
| **Code de la consommation (FR)** | Ongoing ; **Bouton de rétractation 2026-06-19** | Partial — Musaium B2C is freemium (no paid contract V1) ; B2B museum licensing = relevant if subscription | If Musaium B2C remains 100% free for V1 (per project notes — `feedback_no_feature_flags_prelaunch.md`, freemium), the rétractation button is not triggered. Once paid tier ships (post-revenue), the **« renoncer au contrat ici »** button is mandatory |

---

## 2. Deadline timeline (from today, 2026-05-12)

```
2026-05-12   ─┐  TODAY
              │
2026-06-01    ├─ Musaium V1 launch (target)
2026-06-03    ├─ Closing of EU Commission consultation on Art. 50 Code of Practice
2026-06-28    ├─ EAA — 1-year anniversary of enforcement ; FR mise en demeure season
2026-08-02    ├─ AI Act Art. 50 transparency BINDING ; GPAI Art. 53 enforcement powers active ;
              │   high-risk Annex III rules in force ; fines up to €15M / 3% turnover
2026-09-11    ├─ CRA reporting obligation (Art. 14) STARTS ; ENISA SRP operational
              │   → 24h early warning, 72h full notification, 14d corrective report
2027-08-02    ├─ AI Act FULL APPLICABILITY (existing GPAI grandfather deadline)
2027-12-11    └─ CRA full apply ; CE marking required on PDEs placed on EU market
              │   → fines up to €15M / 2.5% global turnover
```

---

## 3. CRA (Cyber Resilience Act) — deep dive

### 3.1 Applicability
- Musaium's iOS/Android binaries + backend = "product with digital elements" (PDE) per Reg. 2024/2847.
- Backend explicitly captured as "remote data processing solution" because **its absence prevents the mobile app from performing core functions** (chat, museum data, geolocation enrichment).
- Mobisec + DLA Piper confirm : **any app store app with connected backend** is in CRA scope.
- Open-source dependencies (TypeORM, Express, LangChain, React Native, Expo) are out-of-scope *for their maintainers* (not commercial), but Musaium as a downstream commercial integrator inherits the security duties for the composed product.

### 3.2 Three obligation tiers
1. **From 2026-09-11** — Art. 14 reporting of (a) actively exploited vulnerabilities, (b) severe incidents.
   - 24h early warning → CSIRT FR (CERT-FR) + ENISA via Single Reporting Platform (SRP)
   - 72h full notification
   - 14-day final report (1 month for severe incidents)
   - **"Actively exploited" = exploited in the wild ; mere PoC or researcher disclosure does NOT trigger**
2. **By 2027-12-11** — Full essential requirements (Annex I) :
   - Security-by-design + default config
   - Free security updates throughout support period
   - SBOM (Annex I §2(1) — not public, but documented)
   - **Coordinated Vulnerability Disclosure policy** (VDP, Art. 13 §8)
   - Conformity assessment + **CE marking**
   - Technical documentation (Annex VII)
3. **Penalties** : up to **€15M or 2.5% global annual turnover**, whichever higher.

### 3.3 Concrete deliverables for Musaium
| Deliverable | Path | Status | Deadline |
|---|---|---|---|
| `SECURITY.md` / `security.txt` (RFC 9116) | `/.well-known/security.txt` on web + GitHub repo root | **MISSING** | Pre-launch (low cost, high signal) |
| Coordinated VDP page | `museum-web/src/app/[locale]/security/vdp` | **MISSING** | 2026-09 (recommended pre-launch) |
| ENISA SRP onboarding | Register manufacturer w/ main establishment (FR → CERT-FR) | **MISSING** | 2026-09-11 |
| SBOM generation pipeline | CI step on each release (Syft or `pnpm sbom`) | **PARTIAL** (Trivy scans in CI, no formal SBOM artifact) | 2027-12 |
| Incident response runbook | `docs/OPS_INCIDENT_RESPONSE.md` | TBD (verify) | 2026-09-11 |
| CE conformity self-assessment | Per Annex VIII Module A (most PDEs not critical → self-assessment OK) | N/A until 2027 | 2027-12-11 |

---

## 4. GDPR — what Musaium has, what's missing

### 4.1 What's already shipped (verified via filesystem)
- `museum-backend/src/modules/auth/adapters/primary/http/routes/me.route.ts` — `GET /me/export` (portability Art. 20) + `DELETE /me` (erasure Art. 17 via `deleteAccountUseCase`)
- `museum-backend/src/modules/auth/adapters/primary/http/routes/consent.route.ts` — consent grant/revoke/list (Art. 7)
- `museum-backend/src/shared/audit/audit.service.ts` + `audit-ip-anonymizer.job.ts` — audit log + IP anonymization
- `docs/legal/ROPA.md` (168 lines) — record of processing activities (Art. 30)
- `docs/legal/DPIA.md` (205 lines, DRAFT v1) — covers T1 (chat), T2 (voice), T3 (geo)
- `docs/legal/AI_DISCLOSURE.md` — Art. 50 AI Act disclosure copy
- `museum-frontend/features/chat/ui/AiDisclosureModal.tsx` + `AiDisclosureFooter.tsx` — UI surface

### 4.2 DSR (Data Subject Rights) — coverage matrix
| Right (Art.) | Endpoint / mechanism | Status |
|---|---|---|
| Information (12-14) | Privacy policy (`museum-web/src/lib/privacy-content.ts`) | OK |
| Access (15) | `GET /me/export` returns full account + chat data | OK |
| Rectification (16) | `PATCH /me` (verify exists for all editable fields) | Likely OK |
| Erasure (17) | `DELETE /me` triggers `deleteAccountUseCase` + audit | OK |
| Restriction (18) | No dedicated endpoint ; possible via consent revoke | **Partial gap** |
| Portability (20) | `GET /me/export` returns machine-readable JSON | OK |
| Object (21) | Consent revoke | OK |
| Automated decisions (22) | Musaium has none → out of scope | N/A |

### 4.3 Breach notification (Art. 33-34)
- **72h to CNIL** if breach likely to result in risk to natural persons
- 72h clock starts from "awareness", not detection — *be careful with the gap between SOC alert and DPO awareness*
- Affected users notified "without undue delay" if high risk (Art. 34)
- **Gap** : no incident response runbook published with clear escalation to CNIL via the `notifications.cnil.fr` portal

### 4.4 DPO requirement
- Art. 37 triggers DPO when : (i) public authority, (ii) large-scale regular & systematic monitoring, **(iii) large-scale processing of special-category data**.
- Musaium B2C → not strictly "large-scale" yet (≤ 50k MAU is debatable, EDPB WP243 hints at millions or sensitive data quantity)
- **However** : DPIA T1.3 explicitly identifies minors as data subjects → triggers Art. 9-adjacent caution
- DPIA names DPO as "TBD before 2026-06-01" → **blocking gap** for sound governance
- Recommended : external DPO (€500-2000/year for solo-dev micro-enterprise)

### 4.5 ROPA (Art. 30) — simplification proposal
- Commission proposal Mar 2025 : ROPA exemption below 750 employees (Council push up to 1000)
- **NOT YET ADOPTED** ; treat as future relief, not current exemption
- Musaium currently keeps a ROPA (`docs/legal/ROPA.md`) — keep maintaining it ; conservative play

### 4.6 International transfers
- OpenAI / Google = US recipients ; rely on **EU-US Data Privacy Framework** (DPF, adequacy 2023-07-10)
  - DPF challenge dismissed by General Court 2025-09-03 → temporary legal certainty
  - CJEU appeal expected (Schrems is preparing); plan for Schrems III contingency
- DeepSeek = CN ; no adequacy ; Musaium correctly disables DeepSeek in EU prod per DPIA T1.1 row 50
- **OpenAI New York court order (spring 2025)** : OpenAI prohibited from deleting "output log data" even on GDPR request → **active conflict with Art. 17**. DPA needs explicit mention + risk-acceptance documented

### 4.7 Children
- France digital majority = 15 years (Art. 8 GDPR delegation + Loi 2024)
- Musaium age-gate present (DPIA T1.3) : `dateOfBirth` self-declared, server-side age check, rejection if <15
- CNIL Recommendation 7 : "make reasonable efforts" to verify age + parental consent → self-declaration is a defendable minimum for V1, but plan for stronger flow post-launch (CNIL audits since 2024)

---

## 5. EU AI Act — Musaium's position

### 5.1 Risk classification
- Musaium chat + voice = **limited-risk** (recital 132 + Annex III non-trigger)
- NOT high-risk : not biometric ID, no education credentialing, no employment scoring, no critical infrastructure, no automated profiling with legal effect
- Image processing on artwork = NOT facial recognition (focal point is artwork classification, not person identification)
- *Confirm* : if Musaium ever adds emotion recognition (e.g. for engagement scoring of visitors), it flips to HIGH-RISK per Annex III §1(c) — keep this explicitly out of roadmap

### 5.2 Art. 50 obligations (effective 2026-08-02)
Per Article 50(1) + EC Draft Guidelines (consultation closes 2026-06-03) :
- **Disclosure that the user is interacting with an AI system** — Musaium ships this (`AiDisclosureModal`, `AiDisclosureFooter`, `useVoiceDisclosure` hook)
- **Disclosure timing** : must occur "at the first interaction or exposure" (Guidelines §5.2)
- **Audible at start for voice** : the `VoiceSessionIntro` component should include audible disclosure before user speaks
- **Plain language, in user's locale** (FR + EN — Musaium has both)
- **Exemption** : "obvious from the point of view of a reasonably well-informed, observant, and circumspect natural person" — average-consumer standard. **Musaium should NOT rely on the obviousness exemption** : modal + footer is the safer path

Recommended verification (after 2026-06 final Guidelines) : run a quick legal review of the modal copy vs the final EC guidance + the AI Office FAQ.

### 5.3 GPAI (Art. 53) — Musaium's relation
- Musaium is **NOT a GPAI provider** (does not train its own foundation model) — it's a **downstream deployer** of OpenAI/Google models
- Art. 53 obligations (technical documentation, copyright policy, training data summary) fall on OpenAI/Google
- Musaium's duty : ensure that the GPAI providers it uses HAVE complied — practical evidence = OpenAI's DPA + GPAI Code of Practice signature
- DeepSeek's GPAI compliance is opaque ; reinforces decision to disable in EU prod

### 5.4 "AI BOM" requirement — mythbusting
- The R22 prompt mentions "AI BOM requirement (2026-08-02)" — **this is NOT a current regulatory requirement in the AI Act text** (verified : article 50, 53, 55 don't reference AI BOM)
- AI BOM is an industry-best-practice / NIST emerging concept (NIST AI 600-1) but **not legally mandatory** under the AI Act
- Practical recommendation : track which models are used + version, but no formal AI BOM artifact required for limited-risk

### 5.5 Penalties
- Prohibited practices : up to €35M or 7% global turnover
- High-risk / GPAI non-compliance : €15M or 3%
- Other (incl. Art. 50 limited-risk) : €7.5M or 1.5%
- Musaium realistic exposure : Art. 50 zone (€7.5M / 1.5%) — but for a solo-dev pre-revenue, the percentage = practically 0, the flat is symbolic but capped by ability-to-pay considerations in fine calibration

---

## 6. DSA — Musaium's position

- DSA Article 19 micro/small enterprise exemption applies (< 50 emp AND < €10M turnover)
- Musaium = micro-enterprise → **exempt from most online-platform obligations** (notice-and-action, trusted flaggers, transparency reports, statement-of-reasons database)
- Still applies (no exemption) :
  - **Art. 5-8** intermediary liability rules (immunity if no actual knowledge of illegal content)
  - **Art. 11** single point of contact for authorities (publish on website)
  - **Art. 12** designate a legal representative if not established in EU (Musaium = FR, exempt)
  - **Art. 14** clear terms of service publication
  - **Art. 15** transparency report on government orders (likely zero — still must publish)

**Important caveat** : if Musaium implements user-generated content (community reviews of artworks, user-submitted photos) → it BECOMES a "hosting service" under DSA Art. 5 + must honour notice & action even without the platform-tier obligations. Audit current Musaium scope : per AGENTS.md the `review` module + `support` module both have user-supplied text. **Confirm before launch** : are reviews public or strictly admin-side ?

---

## 7. ePrivacy + cookies

- ePrivacy Regulation **withdrawn February 2025** → no replacement on near horizon. Directive 2002/58/EC + FR LCEN remain active.
- Cookies : non-strictly-necessary requires consent (analytics, marketing, A/B test). Per R18, Musaium web has **no analytics yet → no banner needed today**.
- Verify : Sentry session-replay disabled (it's a tracker), no PostHog/GA, no Hotjar
- Push notifications : require prior consent (mobile system permission + GDPR Art. 6(1)(a))
- If a banner is added later : **"reject all" must be as easy as "accept all"** (CNIL Délibération 2020-091 + EDPB Cookie Banner Task Force 2023) — single click each, no dark patterns

---

## 8. NIS2 — out of scope

- Cultural/museum sector NOT in Annex I (high criticality) or II (other critical)
- Size-cap excludes micro + small entities anyway
- Musaium = NOT in scope until : (a) it becomes essential service provider OR (b) scales above small enterprise threshold in a critical sector
- **Nothing to do for V1 launch**

---

## 9. France-specific (CNIL + Code consommation)

### 9.1 CNIL recommendations applicable
- **Mobile app recommendation Sept 2024** (final version) :
  - Minimal permissions for geolocation (Musaium uses `coarse` — OK per `project_geolocation_pipeline.md`)
  - Provide alternative to permission (manual postal code entry) — **status TBD** (verify in app)
  - Technical OS permission ≠ valid GDPR consent → must obtain explicit in-app consent before processing geolocation
- **CNIL AI recommendations finalised 2025-04** : legitimate interest can ground AI training/inference if proportionate ; Musaium relies on consent + contract, so doesn't need to claim LI — simpler
- **CNIL 2026 agenda** (published 2025-11) : multi-property consent, AI in workplace + health, transparency CEF — Musaium not directly targeted

### 9.2 Code de la consommation
- **Mentions légales** : already publicly required ; failure = 1y + €75k (sole trader) / €375k (company)
- **Bouton de rétractation 2026-06-19** : applies to professionals selling at distance to FR consumers, no SME exemption. Musaium freemium V1 → not triggered. Plan for paid tier
- **Politique de confidentialité** in French + clearly accessible : OK per existing privacy-content.ts (FR/EN)

### 9.3 EAA (European Accessibility Act) — enforced since 2025-06-28
- B2C mobile app + landing in scope
- WCAG 2.1 AA = operative (EN 301 549 harmonised)
- WCAG 2.2 = recommended (likely future requirement)
- **Status for Musaium** : web has axe-core in CI (R19) ; mobile = unknown a11y posture (verify via Maestro a11y checks or manual audit)
- **Risk** : French disability associations (e.g. APF France handicap) have been filing mise en demeure since Nov 2025

---

## 10. Compliance gaps for Musaium V1 — prioritised

### P0 (block launch or critical risk before 2026-08)
1. **DPO mandate** — DPIA marks "TBD before 2026-06-01" → engage external DPO (~€500/year micro-business pricing). Mandate letter + contact published in privacy policy.
2. **`SUBPROCESSORS.md`** — referenced in DPIA T1.1 but **does not exist** at `docs/compliance/SUBPROCESSORS.md` (verify). Must publish (OpenAI, Google, Sentry, OVH/VPS host, S3 provider, push notification gateway).
3. **`SECURITY.md` + `/.well-known/security.txt`** — RFC 9116 compliant. CRA pre-positioning, costs 1h to set up.
4. **VDP page** — `museum-web/src/app/[locale]/security/vdp` with disclosure email, scope, safe-harbour language. Required Sep 2026 ; ship now.
5. **Incident response runbook** — `docs/OPS_INCIDENT_RESPONSE.md` with 72h GDPR breach + 24h/72h/14d CRA pipelines. Reference CERT-FR + CNIL portals.
6. **EAA WCAG 2.1 AA audit** — formal screenshot + axe-core report for web + mobile. Already enforced — risk = lawsuit not "future regulation".

### P1 (before 2026-08-02 AI Act enforcement)
7. **DPA template for B2B museums** — standard SCC + Art. 28 controller-processor obligations. Needed once Musaium signs first museum customer.
8. **Re-check AI disclosure modal vs Final EC Guidelines** (publishes ~2026-06) — copy may need tweak.
9. **VoiceSessionIntro audible disclosure** — verify Musaium reads "Vous parlez à une intelligence artificielle" before first user voice input.
10. **Document Schrems III contingency** — DPIA addendum naming EU-only fallback model (Mistral) if DPF struck down.

### P2 (before 2026-09-11 CRA reporting)
11. **ENISA SRP onboarding** — register Musaium as manufacturer w/ CERT-FR as competent CSIRT. Free, online.
12. **SBOM artifact** — `pnpm sbom` or Syft CycloneDX export attached to every release.
13. **Vulnerability triage SLA** — internal policy : Critical = 7 days, High = 30, Medium = 90.

### P3 (before 2027-12-11 CRA full apply)
14. **CE marking self-assessment** — most likely Module A (internal control) since Musaium = not critical PDE.
15. **Technical documentation per Annex VII** — already partially in `docs/ARCHITECTURE.md` (not yet extracted per CLAUDE.md).
16. **Support period commitment** — declare in TOS how long Musaium will provide security updates (CRA minimum = 5 years from market placement).

---

## 11. Documents needed — checklist

| Doc | Required by | Status | Path |
|---|---|---|---|
| Privacy Policy (FR + EN) | GDPR Art. 12-14 | EXISTS | `museum-web/src/lib/privacy-content.ts` |
| Terms of Service | DSA Art. 14 + civil law | TBD (verify) | `museum-web/src/app/[locale]/terms` |
| Mentions légales | Code consommation | TBD (verify) | Footer + dedicated page |
| ROPA | GDPR Art. 30 | EXISTS | `docs/legal/ROPA.md` |
| DPIA | GDPR Art. 35 | EXISTS (DRAFT v1) | `docs/legal/DPIA.md` |
| AI disclosure copy | AI Act Art. 50 | EXISTS | `docs/legal/AI_DISCLOSURE.md` |
| SUBPROCESSORS.md | GDPR Art. 28 + transparency | **MISSING** | `docs/compliance/SUBPROCESSORS.md` |
| DPA template (B2B) | GDPR Art. 28 | **MISSING** | `docs/legal/DPA_TEMPLATE.md` |
| SECURITY.md | CRA preparatory | **MISSING** | repo root |
| security.txt | RFC 9116 + CRA | **MISSING** | `/.well-known/security.txt` |
| VDP page | CRA Art. 13 | **MISSING** | `museum-web/src/app/[locale]/security/vdp` |
| Incident response runbook | GDPR 33 + CRA 14 | **MISSING** | `docs/OPS_INCIDENT_RESPONSE.md` |
| SBOM (CycloneDX or SPDX) | CRA Annex I | PARTIAL (Trivy) | CI artifact per release |
| Cookie policy | ePrivacy + LCEN | N/A (no cookies non-essential V1) | — |
| Single point of contact (DSA Art. 11) | DSA | **MISSING** | Footer + dedicated page |
| Accessibility statement | EAA | **MISSING** | `museum-web/src/app/[locale]/accessibility` |

---

## 12. Top 5 actions for launch 2026-06-01

1. **Mandate external DPO + publish contact** in privacy policy (€500-1000/year, ~2 weeks lead time)
2. **Publish SUBPROCESSORS.md + SECURITY.md + security.txt + VDP page** (1 dev day, no legal review needed for security.txt)
3. **Write `docs/OPS_INCIDENT_RESPONSE.md`** with GDPR-72h + CRA-24h/72h/14d pipelines + CNIL/CERT-FR notification templates (1 dev day)
4. **Run EAA WCAG 2.1 AA audit** on landing + mobile app, publish accessibility statement (2-3 dev days)
5. **Verify Musaium has TOS + mentions légales** in French ; ensure single-point-of-contact published in footer (DSA Art. 11) (½ dev day)

**Total effort** : ~1 week of focused legal-ops work + the DPO mandate lead time. None of these block 2026-06-01 launch in the literal sense, but P0 items #1, #4, #5 are the kind of thing a CNIL letter would target first.

---

## 13. Verdict

**READY TO LAUNCH** with caveats. Musaium's regulatory posture is **above average for a pre-launch micro-enterprise** : GDPR rights endpoints + audit log + DPIA + ROPA + AI disclosure already in place. The blocking gaps are essentially **published artefacts** (DPO contact, SECURITY.md, SUBPROCESSORS.md, VDP page, IR runbook) rather than code changes.

**Honest residual risks** :
- **OpenAI New York court order (spring 2025)** prevents OpenAI from deleting output logs even on GDPR request → Musaium's Art. 17 commitment cannot guarantee full upstream erasure. Document this in DPIA + privacy policy explicitly.
- **EAA enforcement is active** : the highest near-term legal risk is an accessibility lawsuit, not a CNIL fine.
- **DPF Schrems III risk** is non-zero — keep Mistral/Anthropic-EU as documented fallback option.

The 2026-09-11 CRA reporting deadline is **the next hard cliff** after launch. Onboard ENISA SRP and publish VDP before then.

---

## Sources

### CRA (Cyber Resilience Act)
- [Cyber Resilience Act — Reporting obligations | EC](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting)
- [Cyber Resilience Act | EC (overview)](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act)
- [Single Reporting Platform (SRP) — ENISA](https://www.enisa.europa.eu/topics/product-security-and-certification/single-reporting-platform-srp)
- [CRA — Summary of the legislative text | EC](https://digital-strategy.ec.europa.eu/en/policies/cra-summary)
- [Cyber Resilience Act — Open source | EC](https://digital-strategy.ec.europa.eu/en/policies/cra-open-source)
- [CRA: the fine line between SaaS and digital products | DLA Piper, Feb 2026](https://www.dlapiper.com/en/insights/publications/2026/02/cyber-resilience-act-the-fine-line-between-saas-and-digital-products)
- [CRA: What's changing for mobile devices and applications | Mobisec](https://www.mobisec.com/en/regulatory-compliance/cyber-resilience-act-dispositivi-applicazioni-mobile/)
- [EU CRA: Preparing Your VDP for 2026 Reporting | HackerOne](https://www.hackerone.com/blog/cyber-resilience-act-vdp-2026-reporting-readiness)
- [One Year Countdown to EU CRA Compliance | Keysight](https://www.keysight.com/blogs/en/tech/nwvs/2025/09/11/one-year-countdown-to-eu-cra-compliance-september-11-2026-changes-everything)
- [RFC 9116 — security.txt | IETF](https://datatracker.ietf.org/doc/html/rfc9116)
- [Setting Up security.txt for CRA Compliance | CRA Evidence](https://craevidence.com/blog/cra-security-txt-setup-guide)

### EU AI Act
- [Article 50: Transparency Obligations | artificialintelligenceact.eu](https://artificialintelligenceact.eu/article/50/)
- [Annex III: High-Risk AI Systems | artificialintelligenceact.eu](https://artificialintelligenceact.eu/annex/3/)
- [Implementation Timeline | artificialintelligenceact.eu](https://artificialintelligenceact.eu/implementation-timeline/)
- [AI Act | EC](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [Draft guidelines on Article 50 transparency | EC](https://digital-strategy.ec.europa.eu/en/library/draft-guidelines-implementation-transparency-obligations-certain-ai-systems-under-article-50-ai-act)
- [Guidelines for providers of general-purpose AI models | EC](https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers)
- [Article 99: Penalties | artificialintelligenceact.eu](https://artificialintelligenceact.eu/article/99/)
- [EU AI Act August 2026: Voice AI Compliance Checklist | Famulor](https://www.famulor.io/blog/eu-ai-act-august-2026-voice-ai-compliance-checklist)
- [The EU AI Act: 6 Steps to Take Before 2 August 2026 | Orrick](https://www.orrick.com/en/Insights/2025/11/The-EU-AI-Act-6-Steps-to-Take-Before-2-August-2026)

### GDPR
- [GDPR full text | gdpr-info.eu](https://gdpr-info.eu/)
- [Article 33 — Breach notification | gdpr-text.com](https://gdpr-text.com/read/article-33/)
- [EDPB coordinated enforcement framework — 2026 transparency | EDPB](https://www.edpb.europa.eu/news/news/2026/cef-2026-edpb-launches-coordinated-enforcement-action-transparency-and-information_en)
- [Does my organisation need a DPO? | EC](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/data-protection-officers/does-my-companyorganisation-need-have-data-protection-officer-dpo_en)
- [EU-US data transfers | EC](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/eu-us-data-transfers_en)
- [OpenAI Data Processing Addendum](https://openai.com/policies/data-processing-addendum/)
- [Commission proposal to simplify ROPA below 750 employees | Noerr](https://www.noerr.com/en/insights/european-commission-proposal-for-simplification-of-gdpr-record-keeping-obligations-of-organisations-with-fewer-than-750-employees)
- [TikTok €530M fine 2025 + Google €325M + Shein €150M | DSALTA](https://www.dsalta.com/resources/articles/gdpr-fines-2025-2026-lessons-how-to-avoid)
- [CNIL imposes €325M on Google | Goodwin](https://www.goodwinlaw.com/en/insights/publications/2025/09/insights-practices-dpc-cnil-imposes-record-325-million-fine)

### DSA / NIS2
- [Digital Services Act | EC](https://digital-strategy.ec.europa.eu/en/policies/digital-services-act)
- [DSA Article 19 — micro/small exemption | digitalservicesact.cc](https://digitalservicesact.cc/dsa/art16.html)
- [NIS2 SME guidelines and thresholds | Arthur Cox](https://www.arthurcox.com/knowledge/nis2-sme-guidelines-how-do-they-apply-and-thresholds/)

### CNIL / France
- [Mobile applications recommendation | CNIL](https://www.cnil.fr/en/mobile-applications-cnil-publishes-its-recommendations-better-privacy-protection)
- [AI system development — recommendations | CNIL](https://www.cnil.fr/en/ai-system-development-cnils-recommendations-to-comply-gdpr)
- [Parental consent for children under 15 | CNIL](https://www.cnil.fr/en/recommendation-4-seek-parental-consent-children-under-15)
- [CNIL 2026 GDPR + AI guidance agenda | DigWatch](https://dig.watch/updates/cnil-2026-gdpr-ai-guidance-agenda)
- [Bouton de rétractation 19 juin 2026 | Bird & Bird](https://www.twobirds.com/fr/insights/2026/france/nouvelles-obligations-applicables-au-droit-de-r%C3%A9tractation)

### ePrivacy
- [GDPR Cookie Consent in 2026 | Consenteo](https://www.consenteo.com/knowledge-hub/GDPR/gdpr_cookie_consent_2026)

### EAA (European Accessibility Act)
- [EAA comes into effect in June 2025 | AccessibleEU](https://accessible-eu-centre.ec.europa.eu/content-corner/news/eaa-comes-effect-june-2025-are-you-ready-2025-01-31_en)
- [EAA + WCAG 2.2 | OneTrust](https://www.onetrust.com/blog/understanding-the-european-accessibility-act-and-wcag-22/)

---

**End of R22 report.**
