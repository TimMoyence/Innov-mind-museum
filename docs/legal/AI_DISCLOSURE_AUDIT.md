# AI Act Article 50 disclosure — audit & scope review

> **Audit run:** `2026-05-17-w4-compliance-ops-release` (W4 cluster A — TA6 / C9.3b-legal).
> **Reviewer:** dispatcher (opus-4.7, audit-mode) + (TL legal review pending).
> **Source spec:** [`docs/legal/AI_DISCLOSURE.md`](./AI_DISCLOSURE.md) (the *what we do*).
> **This document:** the *audit of whether what we do is enough, where the gaps are, and what evidence the regulator would accept*.
> **AI Act effective date for Art. 50:** **2 August 2026**.
> **V1 launch:** 2026-06-01 (≥ 2 months ahead of obligation).

---

## 1. Scope of the audit

In scope:

1. The five disclosure surfaces declared in `AI_DISCLOSURE.md` §1 (visual modal, audio greeting, persistent badge, on-demand recap modal, persistent footer).
2. Their **trigger semantics** (when shown) vs Art. 50 §1 wording ("at the latest at the time of the first interaction").
3. Their **persistence semantics** (per-session ack, not per-install) vs Recital 142 ("clear and distinguishable to the user, taking into account the circumstances").
4. The **8 locales coverage** (Art. 50 §5 — disclosure must be in a clear, distinguishable, and accessible form).
5. The **audio modality** of the disclosure vs Recital 134 (synthesized voice) + EC draft guidelines (December 2025) on audible disclosure for naturalistic voice.
6. The **persistent footer** rendering coverage across all chat surfaces (Musaium operates voice + text in the same session).
7. The **opt-out / dismiss semantics** — none, since AI use is constitutive of the product, but verify the disclosure cannot be hidden accidentally (e.g. by an a11y rule).

Out of scope of this audit (explicitly):

- The 6(1)(a) consent layer added by S4-P0-02 / ADR-053 (granular third-party AI consent under Apple Guideline 5.1.2(i) + GDPR Art. 7). That is a **separate** obligation, audited via `DPIA_T1.1_addendum.md`.
- Backend (admin web) disclosure surfaces — addressed in §6 below as a deferred follow-up.
- Email transactional template disclosure — addressed in §6 as deferred.
- GPAI provider Art. 53 docs (their burden, not ours).

## 2. Surface-by-surface assessment

### 2.1 `VoiceSessionIntro` modal — voice gating

| Criterion | Status | Evidence |
|---|---|---|
| Renders before microphone activates | ✅ | `museum-frontend/features/chat/ui/VoiceSessionIntro.tsx` blocks mic via `useVoiceDisclosure.acknowledged`. Test: `__tests__/features/chat/useVoiceDisclosure.test.ts`. |
| Cannot be bypassed | ✅ | Full-screen modal, no dismiss-without-ack action wired. |
| "First interaction" interpreted as first voice session (not first chat message) | ✅ | Documented in `AI_DISCLOSURE.md` §2; consistent with EC December 2025 draft guidance §4.3 "first audible interaction triggers the audible disclosure". |
| Per-session ack (re-shown on new session) | ✅ | Storage key `musaium.voice.disclosure_acknowledged.<sessionId>` (`expo-secure-store`); fresh sessionId → fresh ack required. |
| Translated to 8 locales | ✅ | Table in `AI_DISCLOSURE.md` §5 — ar, de, en, es, fr, it, ja, zh. Verified by `npm run check:i18n` gate (must pass on every PR; currently part of `ci-cd-mobile.yml` quality stage). |
| Disclosure copy includes "I am AI" + "I can make mistakes" | ✅ | Per locale table; matches Recital 142 "fallibility" guidance. |
| Audio greeting plays the same disclosure as text shows | ✅ | Audio source key `voice.disclosure.audioGreeting`; same translation file. |
| Graceful degrade when `expo-speech` unavailable (web) | ⚠️ | Status indicator reads "Audio greeting unavailable on this device". Acceptable per Recital 142 ("taking into account the circumstances") — text disclosure carries the obligation in degraded mode. **Recommend** adding a unit test that asserts the modal still renders and the user can ack when `expo-speech` is missing. **Not blocking V1.** |

### 2.2 Persistent AI badge in `ChatHeader`

| Criterion | Status | Evidence |
|---|---|---|
| Visible at all times during the chat session | ✅ | Mounted in header alongside session title. |
| Tappable, opens `AiDisclosureModal` recap | ✅ | `AiDisclosureModal.tsx` referenced from `ChatHeader.tsx`. |
| Distinguishable (visually salient) | ⚠️ | "AI / IA / KI" pill, theme-coloured. **Recommend** an a11y review for color contrast against the chat background in both light + dark themes. **Not blocking V1.** Captured as TD-41. |
| Survives keyboard / dark-mode / RTL layouts | ✅ | Implemented with `marginStart/marginEnd` per CLAUDE.md RTL rule. |

### 2.3 `AiDisclosureFooter` — passive baseline

| Criterion | Status | Evidence |
|---|---|---|
| Rendered below message list, persistent | ✅ | `museum-frontend/features/chat/ui/AiDisclosureFooter.tsx`. |
| Survives keyboard, scrolling | ✅ | Standard `View` with KAV-aware positioning. |
| Carries the same canonical copy | ✅ | Pulls from `i18n` namespace, same source as modal. |

### 2.4 `AiDisclosureModal` recap (on-demand)

| Criterion | Status | Evidence |
|---|---|---|
| Opens on badge tap | ✅ | `ChatHeader` wires `onPress` to setter. |
| Carries "Learn more" link | ✅ | Currently points to in-app `/privacy` route (per `AI_DISCLOSURE.md` §7 deferred). When marketing site is live, switch to `https://musaium.com/{locale}/ai-disclosure`. Tracked as TD-42. |

## 3. Where disclosure does **not** yet appear (gaps)

These are documented gaps where Art. 50 *may* apply if the surface materialises. None are blocking V1 because the surface is not in the V1 product.

| Surface | V1 status | Art. 50 applicability | Mitigation |
|---|---|---|---|
| Admin web (`museum-web/admin/*`) | Internal only, no end-user | Out of scope (Art. 50 covers "natural persons" interacting with the AI; admins are operators) | None needed pre-V1. Tracked as TD-43 if/when admin gains end-user-facing AI surfaces. |
| Transactional emails (e.g. session recap auto-summary) | Not shipped V1 | If a session-summary email is later sent, it must carry a disclosure footer ("This summary was generated by AI from your session.") | Doc added below §6 for V1.1 spec; do NOT ship summary emails without the footer. |
| Marketing landing AI-generated copy | Static, human-edited | Not Art. 50 (human-authored) | n/a; if A/B variants become AI-generated, disclosure required. |
| Push notifications | Static templates | Not Art. 50 | n/a. |

## 4. Evidence kit (for regulator request)

If the CNIL or a notified body asks us to demonstrate compliance with Art. 50, we hand over:

1. This audit document.
2. `AI_DISCLOSURE.md` (the spec).
3. Source code refs (from `AI_DISCLOSURE.md` §4) — pinned by git SHA at audit time.
4. Screenshots (FR + EN) of each surface, captured for the V1 build:
   - `VoiceSessionIntro` modal first display.
   - `ChatHeader` with AI badge visible.
   - `AiDisclosureModal` recap when badge tapped.
   - `AiDisclosureFooter` at the bottom of a long chat.
5. Translation source files (`museum-frontend/shared/locales/<locale>/translation.json` `voice.disclosure.*` namespace) — proves 8-locale parity.
6. `__tests__/features/chat/useVoiceDisclosure.test.ts` (proves the gate is enforced under unit test).
7. The `npm run check:i18n` CI log from a recent passing PR (proves no locale drift).
8. ADR(s) documenting any disclosure copy changes (`docs/adr/ADR-NNN-*.md`).

This kit is the **launch-time evidence** the founder should snapshot in `team-reports/2026-06-01-launch-evidence/` on V1 cut day.

## 5. Locale specifics — Arabic + Japanese + Chinese acceptability

A short note for legal review (these locales are commonly flagged when a French / EU operator argues 8-locale compliance):

- **Arabic** — RTL layout enforced via logical-side props (CLAUDE.md gotcha). Disclosure copy was reviewed by a native AR speaker on 2026-04-23 (per ADR notes; verify in `docs/adr/ADR-XXX-rtl-arabic-review.md`). Audio greeting plays via `expo-speech` AR voice; smoke-tested on iOS + Android.
- **Japanese** — copy is concise to fit `ChatHeader` pill width (`AI`). Recital 142 "clear and distinguishable" satisfied because the on-tap recap and modal carry the full disclosure.
- **Chinese (simplified)** — `zh` resolves to Mandarin Simplified. We do NOT ship `zh-TW` (traditional). If a Hong Kong / Taiwan launch is planned, traditional script + cultural review required.

## 6. Recommendations + V1.1 follow-ups

| # | Item | Severity | Owner | When |
|---|---|---|---|---|
| 1 | Add unit test: modal renders correctly when `expo-speech` is unavailable (web/dev-build) | low | mobile | V1.0 nice-to-have, V1.1 required |
| 2 | A11y contrast audit on the AI badge (light + dark, all locales) | medium | mobile + design | V1.0 if time permits (TD-41), V1.1 mandatory |
| 3 | Replace in-app `/privacy` "Learn more" link with marketing site URL once available | low | mobile (TD-42) | V1.1 |
| 4 | Add session-summary email disclosure footer template — DO NOT ship summary emails without it | medium | BE + legal | When summary emails are scoped (post-V1) |
| 5 | Snapshot the §4 evidence kit on launch day | high | TL | 2026-06-01 |
| 6 | Locale FR + EN re-review against EC December 2025 draft Art. 50 guidelines once finalised | high | legal | When EC finalises (target Q3 2026) |
| 7 | Re-audit this document at +6 months post-launch (drift check) | medium | TL | 2026-12-01 |

## 7. Verdict

> **Pre-launch verdict (2026-05-17):** `AI_DISCLOSURE.md` implementation appears **compliant with AI Act Art. 50 §1** for the V1 chat (voice + text) surface, in 8 locales, with both audible and visible disclosure surfaces, on a per-session basis.
> **Caveats:** items 1–4 in §6 should be tracked in TECH_DEBT (TD-41 a11y badge, TD-42 marketing link, TD-43 admin AI surfaces, TD-44 email summaries) — none blocking V1. Items 5–7 are operational follow-ups.
> **Legal sign-off:** PENDING. This document is the audit; counsel review converts the verdict from "appears compliant" to "deemed compliant".

## 8. Done = ?

TA6 (C9.3b-legal) is closed when:

- [ ] This file committed.
- [ ] Cross-link added from `AI_DISCLOSURE.md` §"See also" (or a top-of-file pointer) to this audit.
- [ ] TECH_DEBT items TD-41..TD-44 entered (handled by TE2).
- [ ] Pending legal review noted in `team-reports/` so TL doesn't lose track of the §7 caveat.
