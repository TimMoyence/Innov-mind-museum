# C10 — FE Secondary Features E2E Wiring Audit

Branch `dev` @ HEAD `89852f2a1`. READ-ONLY architect (UFR-022). Method: gitnexus + Grep + Read, all claims `path:line` verified.

Scope: 7 secondary FE features (`museum-frontend/features/` + `app/`). Light pass — wiring/reachability, not deep logic.

---

## 1. conversation/ — VERDICT: PARTIAL (RTL bug)

- WIRED via tab route `app/(tabs)/conversations.tsx:37` (`ConversationsScreen`), reachable as default tab (`app/(tabs)/index.tsx:4` redirects to `/(tabs)/conversations`).
- Full data/actions/bulk hooks mounted: `useConversationsData` (`conversations.tsx:49`), `useConversationsActions`/`useConversationsBulkMode` imported `:14-15`. List renders `ConversationItem` (`:173`), which wraps `SwipeableConversationCard` (`ConversationItem.tsx:92`).
- Resumable: handled on home (`ConversationResumptionBanner`, see home), not in this feature. Tap `ConversationItem` → nav to chat (happy path present).
- Maestro/UFR-021: GRANDFATHERED in `.maestro/coverage-baseline.json:15` (bootstrapped 2026-05-17) — no dedicated swipe-delete happy-path flow.
- ⚠️ **RTL borders bug CONFIRMED** `SwipeableConversationCard.tsx:121-122`: `borderTopRightRadius`/`borderBottomRightRadius` (physical Right) instead of logical `borderTopEndRadius`/`borderBottomEndRadius`. Violates CLAUDE.md RTL gotcha (`shared/ui` / `features` MUST use Start/End). Swipe action is `renderRightActions` (`:107`) — in RTL the delete-action rounded corners face the wrong visual side. Not a dead-end (feature works), but a11y/RTL correctness defect.

## 2. home/ — VERDICT: WIRED (coverage gap)

- `features/home/` is thin (only `HeroSettingsButton.tsx`, `HomeIntentChips.tsx`) — the home *screen* lives at `app/(tabs)/home.tsx:35` (`HomeScreen`), reachable via "Home" tab.
- daily-art mount: `useDailyArt` (`home.tsx:43`) + `DailyArtCard` rendered `:112` with save/skip wired (`save`/`skip` from hook `:43`).
- Proactive banner: `ProactiveMuseumBanner` mounted `home.tsx:96`, fed by `useProactiveMuseumSuggestion` (`:45`). `onStart` → `startConversation` (`:98`), `onDismiss` → `dismissProactiveMuseum` (`:106`).
- Resumption: `ConversationResumptionBanner` + `useResumableSession` imported `:10,12`.
- Dynamic welcome / intent chips: `HomeIntentChips` `:153` (tap → `handleIntentPress`).
- ⚠️ **`onChooseAnother` NOT passed** at `home.tsx:96-109`. The confirm-band banner ("Choose another museum" button, `ProactiveMuseumBanner.tsx:133`) therefore falls back to `onDismiss` (`ProactiveMuseumBanner.tsx:76-80`). This is BY-DESIGN per the component doc (`:13`, `:44`) — not a crash dead-end — but "Choose another" currently just dismisses the banner; it does NOT re-open a museum picker. Functional gap vs label intent (R12-R13 spec ref `:19`).
- 🔧 UFR-021 gap: `home.tsx` is NOT in the grandfather baseline and has NO dedicated Maestro flow tapping daily-art save/skip or the proactive banner. `nav-tabs-roundtrip.yaml:72,91` only taps the "Home" tab label (satisfies route-path sentinel, does NOT exercise the happy path). No `daily-art-card` / `proactive-museum` testID in any `.maestro/*.yaml` (grep empty). Sentinel passes on route-path technicality only.

## 3. settings/ — VERDICT: WIRED

- Hub `app/(stack)/settings.tsx:39` (`SettingsScreen`), reachable from home `HeroSettingsButton` + tab nav.
- AI consent card: `SettingsAiConsentCard` mounted `settings.tsx:213`.
- Accessibility card: `SettingsAccessibilityCard` mounted `:215`.
- Voice preference: **`VoicePreferenceSection` MOUNTED** `settings.tsx:217` (`currentVoice={profile?.user.ttsVoice ?? null}`) — confirmed wired, not orphan.
- Language: `LANGUAGE_OPTIONS` imported `:24`; also surfaced in `preferences.tsx` (i18n switch). Both reachable.
- All other cards present (Theme/Security/Privacy/DataMode/Compliance/DangerZone) mounted.
- Maestro: `settings-flow.yaml` taps Settings → Privacy → Terms; `settings-locale-switch.yaml`, `settings-audio-description.yaml` cover locale/a11y. No dedicated voice-pref happy-path flow (`grep voice .maestro` → only `audio-recording-flow.yaml`).

## 4. legal/ — VERDICT: WIRED

- Privacy route `app/(stack)/privacy.tsx:26` consumes `PrivacyMetaRow` (`:11`); content from `features/legal/privacyPolicyContent.ts`.
- Terms route `app/(stack)/terms.tsx:15` consumes `TERMS_OF_SERVICE_CONTENT` (`:6`).
- Both reachable from `settings-flow.yaml:63,76` (tap "Privacy (RGPD)" / "Terms of Service").
- AI disclosure: present as privacy §12 (`privacyPolicyContent.ts:340` id `ai-disclosure`, EU AI Act Art. 50 ref `:345`), AND surfaced live in chat (`AiDisclosureSheetContent` via bottom-sheet-router `routes.ts:155`, opened from `ChatHeader` `onOpenAiDisclosure` `chat/[sessionId].tsx:363,476`), chat footer (`AiDisclosureFooter` `ChatSessionSurface.tsx:92`), and onboarding toast (`GreetingSlide.tsx:34`). Well-surfaced, no orphan.

## 5. diagnostics/ — VERDICT: WIRED (dev-only, gated)

- `PerfOverlay` / `perfStore` / `useFpsMeter` consumed in `features/museum/ui/MuseumMapView.tsx:163,236,286` — `<PerfOverlay />` rendered only under `__DEV__` guard (`:286`). `perfStore.markRenderStart/End` also `__DEV__`-gated (`:236`).
- No production route mounts it; dev-only by design. Not orphan (has a real `__DEV__` consumer). No UFR-021 obligation (dev-only).

## 6. art-keywords/ — VERDICT: WIRED (headless feature, no UI)

- No UI files (taxonomy/classifier only — correct, it's a data feature).
- `useArtKeywordsSync()` mounted app-wide at `app/_layout.tsx:84`.
- `useArtKeywordsClassifier` consumed in chat: `features/chat/application/useChatSession.ts:65` (`classifyText`).
- Backed by `/api/chat/art-keywords` (generated `openapi.ts:1960`). Fully wired, not orphan.

## 7. onboarding/ — VERDICT: WIRED

- Route `app/(stack)/onboarding.tsx:34` (`OnboardingScreen`) mounts all 4 slides: `GreetingSlide`/`MuseumModeSlide`/`CameraIntentSlide`/`WalkIntentSlide` (`:88-94`) + `StepIndicator`, driven by `useOnboarding` (`:16`).
- Reachable: first-launch flow + manual from home ("Onboarding"). Completion wires to `useUserProfileStore` (`:22`).
- Maestro: `onboarding-flow.yaml` (full happy path: Skip/Next×N → "Get Started" `:77`), `onboarding-full-carousel.yaml`, `onboarding-skip-anonymous.yaml`. Strong coverage.

---

## ⚠️ Orphans / Ruptures

- **No true orphan screens.** All 7 features are reachable / consumed by a live consumer.
- `onChooseAnother` rupture (`home.tsx:96`): "Choose another museum" button silently degrades to dismiss — no picker re-open. By-design fallback, but label promises an action it doesn't deliver.

## 🔧 Gaps

1. **RTL borders bug** `SwipeableConversationCard.tsx:121-122` — physical `borderTop/BottomRightRadius` → must be `…EndRadius` (CLAUDE.md RTL gotcha, EN 301 549 §9.1.3.2).
2. **home.tsx UFR-021 gap** — not grandfathered, no Maestro flow exercising daily-art save/skip or proactive banner happy-path; sentinel passes on route-path technicality only.
3. **`onChooseAnother` not wired** `home.tsx:96` — confirm-band "Choose another" degrades to dismiss (no museum re-pick).
4. (Minor) No dedicated `VoicePreferenceSection` happy-path Maestro flow despite voice being a core V1 feature.
