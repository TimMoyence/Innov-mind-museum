# Spec B — UX Wahoo + Shared Primitives

**Date:** 2026-05-01
**Status:** Approved (brainstorm)
**Owner:** Mobile + Web shared
**Related prompt:** Frontend UX Wahoo + AI Caching + Personnalisation (Prompt 6, 2026-04-30)
**Predecessor:** Spec A — Cleanup & Decisions (`docs/superpowers/specs/2026-04-30-spec-a-cleanup-decisions-design.md`)

## Context

Spec A delivered the cleanup foundation: walk V1 wired end-to-end, web admin i18n cleaned, ADR-025 state-management governance with auth.tsx fully migrated to React Hook Form + TanStack `useMutation`, and the museum-web admin DTO layer fully aligned with backend OpenAPI schemas. Spec B builds on that foundation to deliver the visible "wahoo" UX delta: shared primitives that replace ad-hoc UI patterns, polished animations on hero surfaces, haptic and skeleton feedback in critical flows, and a story-driven web landing section.

## Goals

1. Extract three shared UI primitives (`LiquidButton`, `EmptyState`, `ErrorState`) and adopt them at every existing call site to eliminate UI drift.
2. Redesign the first-launch onboarding into a < 30 s interactive flow with Reanimated micro-animations.
3. Polish the daily-art screen with a parallax hero and swipe-to-save gesture.
4. Add a typing indicator + skeleton bubble to the chat assistant slot during streaming and pending states.
5. Add tactile haptics + a confetti success cue to the review submission flow.
6. Surface an opt-in offline pack pre-cache prompt when users are near a registered museum on a strong connection.
7. Introduce a 4-step animated story section on the web landing between the hero and existing 6 sections.
8. Close the Spec A T3.3-FULL ErrorNotice dismiss-UX gap by integrating the new `ErrorState` primitive in `auth.tsx` with a `clearError` mechanism.

## Non-Goals

- Semantic LLM cache, UserMemory personalization, multi-modal artwork recall, voice continuity (Spec C / Spec D — backend semantic cache must land first).
- Refactoring the existing `LiquidScreen` or `GlassCard` primitives.
- Adding a new design tokens scale; existing `tokens.semantic.ts` + `tokens.generated.ts` are sufficient.
- Replacing existing animations with Reanimated where the existing solution works (only add Reanimated where the spec calls for it).
- Adding new locales — keep existing 8 mobile + 2 web locales.

## Section 1 — Shared Primitives (`museum-frontend/shared/ui/` + `design-system/`)

### `LiquidButton`

**File:** `museum-frontend/shared/ui/LiquidButton.tsx` + `museum-frontend/__tests__/shared/ui/LiquidButton.test.tsx`.

**API:**

```ts
export interface LiquidButtonProps {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  iconName?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'leading' | 'trailing';
  loading?: boolean;
  disabled?: boolean;
  hapticOnPress?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}
```

**Behavior:**

- Tap → if `hapticOnPress !== false`, `Haptics.selectionAsync()` fires. Then `onPress()`.
- `loading === true` → disables press, shows inline `ActivityIndicator` colored to match label.
- `disabled === true` → disables press, reduced opacity (token-driven).
- `accessibilityState` reflects busy / disabled. Default `accessibilityRole="button"`.
- Variants drive `backgroundColor`, `borderColor`, `color` via theme tokens (no hard-coded colors).
- Sizes drive padding + font-size via `space[]` and `font[]` tokens.

**Migration scope:**

- `museum-frontend/features/auth/ui/LoginForm.tsx`, `RegisterForm.tsx`, `AuthActionMenu.tsx` — replace existing button-shaped Pressables with `LiquidButton`.
- `museum-frontend/features/chat/ui/ChatHeader.tsx`, `ChatInput.tsx` — adopt where buttons exist.
- Any other site that has a Pressable-with-Text combo styled as a button. Audit via `grep -rln "Pressable" museum-frontend/features` and migrate the obvious cases. Don't touch icon-only Pressables (e.g., chevron-back).

### `EmptyState`

**File:** `museum-frontend/shared/ui/EmptyState.tsx` + tests.

**API:**

```ts
export interface EmptyStateProps {
  variant: 'chat' | 'museums' | 'reviews' | 'dailyArt' | 'conversations';
  title: string;            // i18n-resolved by caller
  description?: string;     // i18n-resolved by caller
  primaryAction?: { label: string; onPress: () => void; iconName?: keyof typeof Ionicons.glyphMap };
  testID?: string;
}
```

**Behavior:**

- Variant maps to a distinctive Ionicons icon + locked color from theme (e.g. `chat` → `chatbubbles-outline`, `museums` → `business-outline`, `reviews` → `star-outline`, `dailyArt` → `image-outline`, `conversations` → `time-outline`).
- Centered vertical layout: icon → title → description → optional CTA `LiquidButton`.
- All copy passed in by caller via `t()` — keys in 8 locales.

**Migration scope:**

- Chat empty session screen.
- Museum directory empty list.
- Reviews list empty.
- Daily-art saved empty.
- Conversations list empty.

### `ErrorState`

**File:** `museum-frontend/shared/ui/ErrorState.tsx` + tests.

**API:**

```ts
export interface ErrorStateProps {
  title: string;             // i18n-resolved
  description?: string;      // i18n-resolved
  onRetry?: () => void | Promise<void>;
  onDismiss?: () => void;
  retryLabel?: string;
  variant?: 'inline' | 'fullscreen';
  testID?: string;
}
```

**Behavior:**

- Renders a warning Ionicons icon + title + description + buttons.
- Retry button uses `LiquidButton variant="primary"`.
- Dismiss button uses `LiquidButton variant="secondary"` + chevron-down icon (or matches existing `ErrorNotice` dismiss treatment).
- `inline` variant renders as a banner (height-fitted, border, background tint). `fullscreen` variant takes the whole screen and centers (used for screen-level loads).

**Migration scope:**

- `museum-frontend/shared/ui/ErrorNotice.tsx` — replace usages with `ErrorState variant="inline"`. Remove `ErrorNotice.tsx` if no consumers remain after migration.
- Chat error banner.
- Museum directory load failure.
- Daily-art network failure.

### Token / design-system additions

- `design-system/tokens/components/button.ts` — defines per-variant per-size token mappings; emits CSS variables for `museum-web` and TypeScript constants for `museum-frontend`.
- `design-system/tokens/components/empty-state.ts` — color / spacing tokens for the icon backplate.
- `design-system/tokens/components/error-state.ts` — color / spacing tokens.

Run `cd design-system && pnpm build` to regenerate `museum-frontend/shared/ui/tokens.generated.ts` and `museum-web/src/styles/design-tokens.css`.

## Section 2 — Onboarding Redesign

**Files:** `museum-frontend/app/(stack)/onboarding/*` (new), replacing the existing single-file carousel.

**Flow:** 4 screens, < 30 s end-to-end, swipeable forward, persistent skip button on every screen.

1. **Greeting** — animated logo entrance (Reanimated `withTiming` scale + opacity), tagline copy.
2. **Museum mode** — illustration of museum context detection, copy explains GPS-aware geo grounding.
3. **Camera intent** — illustration of artwork photo, copy explains image input flow.
4. **Walk intent** — illustration of guided walk + suggestion chips, copy explains the walk-mode chips from Spec A.

**Tech:**

- `react-native-reanimated` v4 for entrance animations (already a project dep).
- `react-native-gesture-handler` for the swipe-forward gesture (already a project dep).
- New locale keys under `onboarding.v2.*` in all 8 mobile locales.
- First-launch detection: existing `userProfileStore.hasSeenOnboarding` (verify the field exists; if not, add it as a Zustand persist key). Always show skip; on completion or skip, set the flag and route to `/(tabs)/home`.

**Tests:**

- `__tests__/app/onboarding.test.tsx` — render each step, advance via swipe, skip exits and sets the flag.

**Out of scope:** post-onboarding interactive tutorial overlays. Reserved for Spec C.

## Section 3 — Daily-Art Polish (Parallax + Swipe-to-Save)

**File:** `museum-frontend/features/daily-art/ui/DailyArtCard.tsx` + tests.

### Parallax hero

- Wrap the existing daily-art image in `Animated.Image`.
- Use `useAnimatedScrollHandler` from Reanimated to read `scrollY` from the parent `Animated.ScrollView`.
- `useAnimatedStyle` translates the image `translateY` by `scrollY * 0.5` (50% of scroll distance) and scales 1.0 → 1.05 over the first 100 px to mask the over-scroll.

### Swipe-to-save

- Wrap the card in `Swipeable` from `react-native-gesture-handler`.
- Left-edge action: heart icon, label "Save". Trigger threshold 80 px.
- On trigger, call `dailyArtStore.toggleSaved(artworkId)` and emit `Haptics.notificationAsync(Success)`.
- Animate the action background opacity proportional to swipe distance.

**Tests:**

- Component test renders, asserts swipe gesture invokes `toggleSaved`.
- Visual regression deferred (no Storybook in this project).

## Section 4 — Chat UX (Typing Indicator + Skeleton Bubble)

**File:** `museum-frontend/features/chat/ui/TypingPlaceholder.tsx` + tests + integration in `ChatMessageList.tsx`.

### TypingPlaceholder

- Three-dot animation, 600 ms loop, fades in/out with stagger via Reanimated.
- Localized copy "Musaium réfléchit…" (via `t('chat.typing.label')`) underneath the dots — visible in `audioDescriptionMode` and screen readers.

### Skeleton bubble

- Below the latest user message and ABOVE the streaming assistant bubble while `isPending && !firstTokenReceived`.
- Gray pulse animation (Reanimated `withRepeat` + `withTiming`), height 60 px, width 70% of parent, border radius matches `ChatMessageBubble`.

### Integration logic

- `useChatSession.lastAssistantPending: boolean` — derive from `isPending`, `isStreaming`, and whether the last message is `role: 'assistant' && text === ''`.
- `ChatMessageList` reads this and conditionally renders `<TypingPlaceholder />` or `<SkeletonBubble />`.

**Tests:** unit test for the placeholder + integration test for `ChatMessageList` rendering states.

## Section 5 — Reviews (Haptic + Confetti)

**File:** `museum-frontend/features/review/ui/StarRating.tsx` + `ReviewSubmitForm.tsx`.

- 5-star row: tap on star → `Haptics.selectionAsync()` + visual fill.
- On submit success → `Haptics.notificationAsync(Success)` + render `<ConfettiCannon />` from `react-native-confetti-cannon` (new dep) for 1.5 s.
- Confetti respects `prefersReducedMotion` accessibility setting (skip animation when set).

**Tests:** verify haptic call mock fires on tap; submit triggers confetti element render.

**Dependency:** `react-native-confetti-cannon` (~ 50 kB gzipped, well-maintained, MIT). Add to `museum-frontend/package.json`.

## Section 6 — Map Museum Offline Pack Prompt

**File:** `museum-frontend/features/museum/ui/OfflinePackPrompt.tsx` (new) + integration in `MuseumMapView.tsx`.

**Trigger:**

- Within geofence of a registered museum (existing `museumStore.nearestMuseum`).
- `NetInfo.addEventListener` reports `details.cellularGeneration: 4g | 5g` OR `type: wifi`.
- `museumStore.offlinePackChoice[museumId]` is `undefined` (user hasn't decided yet).

**UI:**

- Bottom sheet via `@gorhom/bottom-sheet` (verify presence; add if needed).
- Copy: "Tu es près du musée X. Télécharger le contenu hors-ligne pour explorer sans connexion ?" (i18n).
- Two `LiquidButton` actions: "Télécharger" (primary) and "Plus tard" (secondary).
- On accept, call `museumStore.scheduleOfflinePack(museumId)` (stub for now — actual download mechanism is Spec C scope; record the user's intent + dismiss the sheet).
- On decline, `museumStore.declineOfflinePack(museumId)` records the choice for 30 days.

**Tests:** integration test mocking `NetInfo` + `museumStore`.

## Section 7 — Web Landing Story Section

**File:** `museum-web/src/components/landing/StorySection.tsx` (new) + integration in `museum-web/src/app/[locale]/page.tsx`.

**Structure:** 4-step timeline rendered between the hero section and the existing 6 sections.

- Step 1 — Museum (icon: building, copy: "Visit a partner museum.").
- Step 2 — Photo (icon: camera, copy: "Take a photo or speak.").
- Step 3 — AI (icon: sparkles, copy: "Musaium answers in your tone.").
- Step 4 — Chips (icon: list, copy: "Suggestions guide your next discovery.").

**Tech:**

- Framer Motion `viewport={{ once: true }}` triggers staggered reveals on scroll-into-view.
- Each step: icon scales 0.8 → 1.0, fades in over 400 ms, with 150 ms stagger between steps.
- Connecting line between steps animates left-to-right via `pathLength`.

**i18n:**

- `museum-web/src/dictionaries/{fr,en}.json` — add `landing.story.title` + `landing.story.steps[].{title,description}` arrays.

**Tests:**

- `museum-web/src/components/landing/__tests__/StorySection.test.tsx` (Vitest) — renders 4 steps, asserts each label matches the dictionary, optional snapshot of the ordered DOM.

## Section 8 — ErrorState Integration in auth.tsx (Closes T3.3-FULL Gap)

**Files:**

- `museum-frontend/features/auth/application/useEmailPasswordAuth.ts` — add `clearError: () => void` to the return type, implementation calls `loginMutation.reset()` and `registerMutation.reset()`.
- Same change for `useForgotPassword` and `useSocialLogin`.
- `museum-frontend/app/auth.tsx` — replace the existing `ErrorNotice` rendering with `<ErrorState variant="inline" />` from Section 1. Pass `onDismiss={() => { emailPasswordAuth.clearError(); forgot.clearError(); social.clearError(); }}` so the user can dismiss across all three concurrent error sources.

**Tests:** extend `__tests__/screens/auth.test.tsx` with a "dismiss button clears error and re-submit works" case.

## Tests / Verification

- Each new primitive + redesign component has a unit / component test.
- `npm test` (mobile) and `pnpm test` (web) green after each section.
- iOS simulator manual smoke per section (user-driven). The implementer subagent may run xcrun simctl in headless mode if available; otherwise the smoke is deferred to the user.
- Lighthouse CI re-checked on `museum-web` after the story section to confirm no perf regression.
- Bundle size delta tracked: re-run `npm run build` and compare `metafile.json` against the Spec A baseline.

## Acceptance Criteria

- [ ] `LiquidButton`, `EmptyState`, `ErrorState` in `museum-frontend/shared/ui/` with exported tests.
- [ ] All ad-hoc Pressable-as-button sites in `museum-frontend/features/auth/ui/`, `chat/ui/` migrated to `LiquidButton`.
- [ ] 5 empty states + 3 error states migrated to the new primitives.
- [ ] Onboarding redesign lands; first-launch flag set on completion or skip.
- [ ] Daily-art parallax + swipe-to-save work on iOS simulator.
- [ ] Chat typing indicator + skeleton bubble appear during pending / streaming and disappear on first token.
- [ ] Reviews haptics fire on star tap; confetti renders on submit; reduced-motion honored.
- [ ] Offline pack prompt surfaces only when geofence + strong connection + no prior choice. Accept/decline persist.
- [ ] Web landing has a new story section above the existing 6; Lighthouse perf score unchanged ± 1 point.
- [ ] `auth.tsx` renders `ErrorState` with a working dismiss button.
- [ ] `gitnexus_detect_changes` confirms changes are within the listed files; no surprise blast radius.
- [ ] Spec B baseline tests preserved + new tests added; total mobile + web test count grows by ≥ 20.

## Risks & Open Questions

- **Reanimated version compatibility:** Reanimated v4 is in the project; some animations rely on `useAnimatedStyle` returning interpolations. Verify on iOS 17+ (current Spec A baseline tested on iOS 26 dev simulator).
- **Confetti dependency size:** `react-native-confetti-cannon` adds ~ 50 kB. Acceptable per project bundle budget.
- **Bottom sheet dep:** `@gorhom/bottom-sheet` may not be installed; verify before relying on it. If absent, can fall back to React Native `Modal` with a slide-from-bottom animation, but the sheet polish is preferred.
- **Web Lighthouse perf risk:** Framer Motion staggered reveals add JS work on first paint. Mitigate with `viewport={{ once: true }}` to avoid re-running on scroll.
- **Story section copy drift:** new `landing.story.*` keys must match landing-page tone; product/marketing review recommended before final wording.
- **Offline pack download mechanism deferred:** Spec B records user intent only; the actual content download is Spec C work.

## Out of Scope (explicit reminder)

- Semantic LLM cache, UserMemory personalization, multi-modal recall, voice continuity (Spec C / Spec D).
- ES + DE locales for web (Spec C).
- Lighthouse score uplift program (separate spec).
- Bundle size monitoring CI gate (separate spec).
- Sentry RN deployment target check (parallel spec).
- Deep linking universal-links (parallel spec).
