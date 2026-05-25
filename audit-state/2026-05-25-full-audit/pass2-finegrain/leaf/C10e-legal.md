# C10e — LEGAL (mobile) — Pass 2 fine-grain leaf audit

- **RUN**: 2026-05-25-full-audit / pass2-finegrain
- **Scope**: `museum-frontend/features/legal/` (privacy policy, terms, AI disclosure) + Expo routes
- **HEAD**: `1fb32f5bafc5ada0b97e7ce10af39d02834df8af` (dev), READ-ONLY (UFR-022, UFR-013)
- **Verdict**: **WIRED** (1 minor observation, no rupture)

## Feature inventory

| Artifact | Path | Role |
|---|---|---|
| Privacy content | `museum-frontend/features/legal/privacyPolicyContent.ts` | Structured GDPR/EU-AI-Act policy, 15 sections, 19 subprocessors |
| Terms content | `museum-frontend/features/legal/termsOfServiceContent.ts` | 10-section ToS |
| Privacy meta row | `museum-frontend/features/legal/ui/PrivacyMetaRow.tsx` | Presentational row (label/value + placeholder pill) |
| Privacy screen | `museum-frontend/app/(stack)/privacy.tsx` | Route `/(stack)/privacy` |
| Terms screen | `museum-frontend/app/(stack)/terms.tsx` | Route `/(stack)/terms` |
| AI disclosure sheet | `museum-frontend/features/chat/ui/AiDisclosureSheetContent.tsx` | On-demand recap (NB: lives under `features/chat/`, not `features/legal/`) |

## Reachability — screens atteignables ? OUI

Both legal routes registered in the Stack: `museum-frontend/app/_layout.tsx:215` (privacy) + `:216` (terms). No route-not-found risk.

**Privacy** reachable from:
- Settings floating menu — `museum-frontend/app/(stack)/settings.tsx:90` (`open('/(stack)/privacy')`)
- Pre-login signup — `museum-frontend/app/auth.tsx:257`
- Support screen — `museum-frontend/app/(stack)/support.tsx:78`
- Preferences — `museum-frontend/app/(stack)/preferences.tsx:98`
- Chat (voice consent + AI-disclosure "learn more") — `chat/[sessionId].tsx:314` & `:367`
- Terms screen (cross-link) — `terms.tsx:33` & `:88`

**Terms** reachable from:
- Settings compliance card — `museum-frontend/features/settings/ui/SettingsComplianceLinks.tsx:45` (`onNavigate('/(stack)/terms')`), component rendered at `settings.tsx:221`
- Pre-login signup — `museum-frontend/app/auth.tsx:254`

No dead-end / orphan. Both screens self-link to each other and back to settings/support.

## AI disclosure — AiDisclosureSheetContent monté ? OUI

- Registered as bottom-sheet route `ai-disclosure` — `museum-frontend/features/chat/ui/bottom-sheet-router/routes.ts:150-155` (`Content: AiDisclosureSheetContent`).
- Opened from chat header badge → `chat/[sessionId].tsx:363-370` (`openAiDisclosure` → `openSheet('ai-disclosure', { onLearnMore })`), badge wired at `ChatHeader.tsx:79/84` (`testID="ai-disclosure-badge"`).
- "Learn more" routes to `/(stack)/privacy` (`chat/[sessionId].tsx:367`), closing the sheet first.
- Persistent footer variant `AiDisclosureFooter` mounted in `ChatSessionSurface.tsx:92`.
- EU AI Act Art. 50 disclosure also embedded as privacy §12 (`privacyPolicyContent.ts:340-345`).

## i18n — chrome localized, legal body EN-only by design

- **Localized (8 locales en/fr/es/de/it/ar/zh/ja)**: all screen chrome via `t()` — `privacy.*`, `terms.*`, `voice.disclosure.*`, `a11y.*`. AI-disclosure sheet 100% i18n (`AiDisclosureSheetContent.tsx:33,39,47,53` → `voice.disclosure.{modalTitle,modalClose,aiNotice,modalLearnMore}`); all 5 subkeys present in all 8 locales. `terms.version_note` / `privacy.status_ready` / `privacy.pending_count` present en+fr (`locales/{en,fr}/translation.json:406-407,425`).
- **EN-only (intentional)**: the actual legal body text (policy sections, ToS clauses, subprocessor rows) is hard-coded English in the `.ts` content files — NOT a defect. These are codegen'd from BE canonical (`museum-backend/src/shared/legal/privacy-content.canonical.json`) by `museum-frontend/scripts/codegen-legal-content.mjs`, guarded by drift sentinel `museum-backend/scripts/sentinels/privacy-content-drift.mjs` (both exist). Single authoritative legal language is a legitimate compliance choice.
- **Minor**: privacy metadata row LABELS are hard-coded EN literals (`privacy.tsx:32-37`: `'Version'`, `'Last updated'`, `'Controller'`, `'Address'`, `'Privacy contact'`, `'DPO contact'`) — not passed through `t()`. Values are i18n-neutral data; only the 6 labels are unlocalized. Low severity (cosmetic, en/fr both readable). Terms screen uses `t('terms.version_note', {...})` correctly (`terms.tsx:60`).

## Version / age coherence with BE canonical — CONSISTENT

| Field | FE | BE canonical | Match |
|---|---|---|---|
| Privacy version | `1.0.0` (`privacyPolicyContent.ts:195`) | `1.0.0` (`privacy-content.canonical.json:2`) | ✓ |
| Privacy lastUpdated | `2026-05-21` (`:196`) | `2026-05-21` (`:3`) | ✓ |
| Terms version | `1.0.0` (`termsOfServiceContent.ts:19`) | `1.0.0` (`terms-content.canonical.json`) | ✓ |
| Terms lastUpdated | `2026-05-21` (`:20`) | matches | ✓ |
| **Minimum age** | **15** (`privacyPolicyContent.ts:322-327` §10 "Children & Minors", CNIL Délib. 2021-018, Art. 8 GDPR) | **15** (`privacy-content.canonical.json:114-116`) | ✓ |

Age 15 = canonical French digital majority, cited consistently FE↔BE. No drift.

## Placeholders / release readiness — CLEAN

- `isPrivacyPlaceholderValue()` flags any value containing `'TO_FILL_'` (`privacyPolicyContent.ts:375-377`).
- The 2 `TO_FILL_` matches in the file are BOTH inside the helper's JSDoc + impl (`:373`, `:376`) — **zero shipped placeholder values**.
- All 6 metadata values are real: controller `InnovMind (Tim Moyence, Entrepreneur Individuel)` (`:197`), contact `tim.moyence@gmail.com` (`:199`), DPO `Non désigné (non requis art. 37 RGPD)` (`:200`). Contact email consistent across §6/§11 (`:224`, `:318`) and BE.
- → status pill renders "Release-ready metadata" (`privacy.tsx:117`), no warning banner.

## Ruptures

None. One LOW-severity observation only:
- `privacy.tsx:32-37` — 6 metadata row labels hard-coded English (not `t()`). Cosmetic, not a wiring break.

## Conclusion

LEGAL feature is **WIRED** and **release-ready**: both screens reachable (settings + auth + cross-links), AI disclosure sheet mounted & navigable, version/age coherent with BE canonical (age 15), no shipped placeholders, drift sentinel + codegen in place. Legal body is single-language EN by design (compliance); UI chrome fully i18n across 8 locales.
