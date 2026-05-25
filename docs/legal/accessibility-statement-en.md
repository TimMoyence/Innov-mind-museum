# Accessibility Statement — Musaium

**Status**: v0.2 — **partial** conformance, automated axe-core audit complete, manual + user-testing passes pending.
**Drafting date**: 2026-05-13 (audit P0-2). **Updated**: 2026-05-14 (P0 #14 batch closure).
**Applicable version**: Musaium V1 (launch planned 2026-06-01).
**Review cycle**: annual, or upon any material change to the service.

> This statement is issued pursuant to **Directive (EU) 2019/882 of 17 April 2019** on the accessibility requirements for products and services (the « European Accessibility Act » — EAA, enforceable since 28 June 2025), and follows the harmonised standard **EN 301 549 V3.2.1** aligned with **WCAG 2.1 level AA**. For users in France, it also satisfies the requirements of Loi n° 2005-102 du 11 février 2005 (Art. 47) and Décret n° 2019-768 of 24 July 2019.

> **Audit note (2026-05-14)**: this statement is published transparently **before** a formal external WCAG 2.1 AA audit has been conducted by an independent third party. An internal automated axe-core sweep against 18 web routes was completed on 2026-05-14 (run `2026-05-14-i18n-a11y-eaa-batch`). The declared conformance status remains deliberately "partial" — automated tooling catches an estimated 20–50 % of issues. No claim of total or substantial conformance is made and none will be made until the manual + user-testing passes (see § 5) have been conducted and documented.

## v0.2 changelog (2026-05-14)

Closing run `2026-05-14-i18n-a11y-eaa-batch` shipped the following remediations:

- **MFA enrolment page** (`/admin/mfa`) — 22 hardcoded English strings migrated to FR/EN dictionaries; QR code wrapper carries `role="img"` + `aria-label`; "Copy all" button background raised from `amber-500` to `amber-700` (contrast 2.45 → ≥ 4.5 : 1) (EAA Art. 4(3); WCAG 1.4.3 + 1.1.1 + 4.1.2 remediated for that route).
- **RTL Arabic mobile UI** — 28 layout sites in `museum-frontend/{features,shared/ui}/` migrated from physical (`left`/`right`/`marginLeft`/`marginRight`/`paddingLeft`/`paddingRight`/`borderLeft`/`borderRight`/`textAlign: 'left'|'right'`) to logical (`start`/`end`) properties. Three RTL render tests added (`ChatScreen`, `HomeScreen`, `DailyArtScreen`) under `I18nManager.forceRTL(true)` (EN 301 549 § 9.1.3.2 — Meaningful Sequence — strengthened for Arabic).
- **Automated a11y coverage** — `@axe-core/playwright` extended from 6 routes (landing, privacy, support, admin/login, admin, admin/users) to 18 routes (+ /security, /accessibility, /verify-email, /confirm-email-change, /reset-password, /admin/mfa, /admin/audit-logs, /admin/tickets, /admin/support, /admin/analytics, /admin/reports, /admin/reviews). CI fails on `serious` or `critical` violations under the WCAG 2.1 A + AA tag sets. Only the `/admin/ops/grafana` iframe + the `/admin/users/[id]` stub remain uncovered (separate runs).
- **Mobile a11y label backfill** — `accessibilityLabel` raised above the 80 % coverage target on `Pressable` / `TouchableOpacity` element count (was ≈ 58 % per audit F10 § 5).
- **Sitemap** — `/accessibility` route now emitted across locales for discoverability.

---

## 1. Service identification

| Field | Value |
|---|---|
| Service name | Musaium — cultural companion for in-museum and outside-museum visits, mobile app + web site |
| Operator | Tim Moyence — Sole Proprietor, operating InnovMind / Musaium |
| Postal address | To be filled in before publication (registered with the French RCS) |
| Accessibility contact email | `support@musaium.com` |
| Surfaces in scope | Mobile app iOS + Android (`com.musaium.mobile`); web site `https://musaium.com` (landing + admin panel `/admin`); static privacy policy `https://musaium.com/privacy` |

---

## 2. Conformance status

**PARTIAL — WCAG 2.1 AA audit pending.**

Musaium V1 has **not yet** undergone a formal accessibility audit. The present statement documents honestly:
- design elements already in place that contribute to accessibility (see § 4),
- content and flows for which accessibility is not currently guaranteed (see § 3),
- the planned audit methodology (see § 5).

No claim of total or substantial conformance is made at this stage.

---

## 3. Non-accessible content

<!-- AUDIT WCAG 2.1 AA REQUIRED: the list below is derived from inspection of the source code on 2026-05-13 and informal testing. A formal audit (auto + manual + user testing with persons with disabilities) is required to validate, complete, or refute each point. -->

### 3.1 Identified non-conformances (to be confirmed by audit)

- **Voice flows without a guaranteed equivalent text alternative**: the hands-free mode (incoming STT + outgoing TTS) returns the LLM transcription in parallel, but the persisted TTS audio (`ChatMessage.audioUrl`) has no formal audio description for blind users; the textual transcript of the outgoing audio is not consistently rendered as an independently readable element (WCAG 1.2.1, 1.2.3). To be audited.
- **RTL rendering (Arabic) on the admin web panel**: the admin shell at `museum-web/src/app/[locale]/admin/*` does not declare `dir="rtl"` and has not been tested in the `ar` locale. Mobile RTL handling exists (`museum-frontend/shared/i18n/rtl.ts`) and was hardened on 2026-05-14 (28 sites migrated to logical properties, 3 RTL render tests — cf. v0.2 changelog) but its web counterpart remains untested (WCAG 1.3.2). To be audited.
- **Contrast and font sizing**: design-system tokens (`design-system/`) follow a base of Inter 16 px but have not been audited against WCAG 1.4.3 (4.5:1 minimum contrast for normal text) or 1.4.4 (200% zoom without content loss). To be audited.
- **Mobile tap targets**: chat-interface buttons aim for ≥ 44 × 44 pt (Apple HIG) but have not been audited on iPad or with VoiceOver enabled (WCAG 2.5.5). To be audited.
- **Generative-AI disclosure**: the `ai_disclosure` banner is rendered on all 3 surfaces (mobile, web, privacy policy) — to be verified that screen readers correctly announce the generative nature of responses (WCAG 4.1.2 + AI Act Art. 50).
- **User photos and galleries**: visitor-uploaded artwork photos lack auto-generated `alt` text; the AI enrichment pipeline could produce a descriptive alt-text but is not wired for this purpose (WCAG 1.1.1). To be audited.
- **Keyboard navigation (web)**: a keyboard-reachable "skip to content" link is now implemented as the first focusable element of the web layout, jumping focus to the `<main id="main">` landmark (WCAG 2.4.1 — Bypass Blocks — satisfied; `museum-web/src/app/[locale]/layout.tsx`). End-to-end keyboard-only operation (Tab/Shift-Tab + Enter) of the Next.js landing page and the admin panel has not yet been fully audited beyond this. To be audited.
- **Video captions**: demonstration videos on the landing page have no captions nor transcript (WCAG 1.2.2, 1.2.3). To be audited / captioned before launch or removed.

### 3.2 Disproportionate-burden claims

No disproportionate burden is currently claimed. Any future exemption must be documented case-by-case after the audit, with a proportionate justification (EAA Art. 14).

### 3.3 Out-of-scope content

- Third-party content (images from Wikidata / Wikimedia Commons / Unsplash) integrated in read-only — accessibility is the responsibility of the source.
- Responses generated by third-party LLMs (OpenAI / Google) — linguistic quality is non-deterministic by nature; a simplicity guardrail is not a substitute for formal cognitive accessibility.

---

## 4. Design elements already accessible (before formal audit)

Without prejudging the final conformance verdict, the following elements reflect a conscious accessibility effort already in the code:

- 8-locale internationalisation on mobile (fr, en, ar, de, es, it, ja, zh) with an RTL mechanism on mobile (`museum-frontend/shared/i18n/rtl.ts` — `RTL_LOCALES = ['ar']`).
- Icon system using Ionicons + PNG (no Unicode emoji in screens — internal rule "no Unicode emoji", avoids degraded screen-reader rendering).
- Hands-free voice mode (STT + TTS) — beneficial for users with low vision or dyslexia, subject to audit § 3.1.
- Generative-AI disclosure per AI Act Art. 50 visible on all 3 surfaces.
- Inter font weights 300/400/500/600/700 — high legibility.
- Centralised design tokens (`design-system/`) — facilitates a contrast/sizing upgrade across the codebase in a single commit.

---

## 5. Audit methodology (planned)

A WCAG 2.1 AA audit is planned in three passes:

1. **Automated audit** — tools: axe-core (`@axe-core/playwright` v4.10 across 18 web routes since 2026-05-14), Lighthouse CI (already wired for the web app in `.github/workflows/ci-cd-web.yml`, `minScore: 0.90`), iOS Accessibility Inspector (not yet run), Android Accessibility Scanner (not yet run). Web web-axe pass: **complete (2026-05-14)** ; mobile-native automated pass: **not started**.
2. **Manual audit** — by an external a11y expert or a trained developer: keyboard-only navigation, VoiceOver iOS, TalkBack Android, NVDA Windows, DOM inspection, ARIA verification. Status: **not started**.
3. **User testing with persons with disabilities** — at least 3 panels (visual, hearing, motor impairment). Coordination via a partner association (to be appointed). Status: **not started**.

<!-- AUDIT WCAG 2.1 AA REQUIRED: none of the 3 passes has been conducted as of the drafting date. The declaration cannot move from "partial" to "total" until the 3 passes are documented and blocking non-conformances are remediated. -->

---

## 6. Feedback channels and enforcement

Users encountering an accessibility defect can contact:

- **Musaium support service**: `support@musaium.com` — target response within 7 business days.
- **Défenseur des droits** (France): https://www.defenseurdesdroits.fr — gracious or contentious appeal in case of no response from the operator.
- **DGCCRF** (France): supervisory authority competent under Décret 2019-768 and the French EAA transposition — https://www.economie.gouv.fr/dgccrf.
- **ARCOM**: subsidiary competence over online public communication services.

Users outside France should contact the supervisory authority of their EU Member State implementing Directive 2019/882.

---

## 7. Statement updates

- **Annual** review at the latest each 13 May.
- **Event-driven** review triggered by:
  - a major UI redesign of any of the 3 surfaces,
  - the addition of a new media type (video, AR, etc.),
  - a user complaint or supervisory-authority notice,
  - the introduction of a new locale.
- Versioning is tracked in Git — any material change bumps the version (v0.1 → v0.2 → v1.0 once first signed audit lands).

---

## 8. Signature

<!-- AUDIT WCAG 2.1 AA REQUIRED: no signature shall be applied until the audit in § 5 has been conducted. -->

| Role | Name | Date | Signature |
|---|---|---|---|
| Service operator | Tim Moyence (InnovMind / Musaium) | _________ | _________ |
| External a11y auditor | _________ | _________ | _________ |

---

## 9. References

- Directive (EU) 2019/882 (EAA) — https://eur-lex.europa.eu/eli/dir/2019/882/oj
- French Loi n° 2005-102 du 11 février 2005, Art. 47.
- French Décret n° 2019-768 of 24 July 2019.
- Standard EN 301 549 V3.2.1.
- WCAG 2.1 level AA — https://www.w3.org/TR/WCAG21/
- AI Act EU 2024/1689 Art. 50 — transparency obligations for generated content.

---

**END declaration v0.2 — Automated audit complete ; awaiting manual + user-testing passes + operator sign-off.**
