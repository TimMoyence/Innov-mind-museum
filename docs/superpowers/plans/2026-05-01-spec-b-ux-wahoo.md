# Spec B — UX Wahoo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract three shared FE primitives, redesign onboarding, polish daily-art with parallax + swipe-to-save, add chat typing/skeleton, wire reviews haptics + confetti, surface a museum offline-pack prompt, ship a web landing story section, and close the Spec A `ErrorNotice` dismiss-UX gap with the new `ErrorState`.

**Architecture:** New `museum-frontend/shared/ui/` primitives with token-driven styling (`design-system/` extends with per-component tokens). Reanimated v4 + gesture-handler for animations. Confetti via `react-native-confetti-cannon` (new dep). Bottom sheet via `@gorhom/bottom-sheet` (verify presence). Web story via Framer Motion. ErrorState integrated into the existing auth hooks via a new `clearError` exposed from each hook (T3.3-FULL extension).

**Tech Stack:** React Native 0.83 + Expo 55 + Reanimated v4 + gesture-handler + Expo Haptics + react-native-confetti-cannon (new) + @gorhom/bottom-sheet (new or existing) + i18next + zustand. Web: Next.js 15 + Framer Motion. Design system: existing `design-system/` package + tokens.

**Spec source:** `docs/superpowers/specs/2026-05-01-spec-b-ux-wahoo-design.md`

---

## File Structure

### Mobile (`museum-frontend`)
- Create: `shared/ui/LiquidButton.tsx`
- Create: `shared/ui/EmptyState.tsx`
- Create: `shared/ui/ErrorState.tsx`
- Create: `__tests__/shared/ui/LiquidButton.test.tsx`
- Create: `__tests__/shared/ui/EmptyState.test.tsx`
- Create: `__tests__/shared/ui/ErrorState.test.tsx`
- Create: `app/(stack)/onboarding/index.tsx` (new flow entry)
- Create: `app/(stack)/onboarding/_steps/Greeting.tsx`
- Create: `app/(stack)/onboarding/_steps/MuseumMode.tsx`
- Create: `app/(stack)/onboarding/_steps/CameraIntent.tsx`
- Create: `app/(stack)/onboarding/_steps/WalkIntent.tsx`
- Create: `__tests__/app/onboarding.test.tsx`
- Modify: `features/daily-art/ui/DailyArtCard.tsx` (parallax + swipe-to-save)
- Create: `features/chat/ui/TypingPlaceholder.tsx` + test
- Modify: `features/chat/ui/ChatMessageList.tsx` (typing/skeleton wire)
- Modify: `features/review/ui/StarRating.tsx` (haptic on tap)
- Modify: `features/review/ui/ReviewSubmitForm.tsx` (confetti on submit)
- Create: `features/museum/ui/OfflinePackPrompt.tsx` + test
- Modify: `features/museum/ui/MuseumMapView.tsx` (mount prompt)
- Modify: `features/museum/infrastructure/museumStore.ts` (offlinePackChoice persistence)
- Modify: 8 locale dictionaries: drop unused, add new keys (`onboarding.v2.*`, `chat.typing.*`, `museum.offlinePack.*`, `empty.*`, `error.*`).
- Modify: `features/auth/application/useEmailPasswordAuth.ts` (`clearError` export)
- Modify: `features/auth/application/useForgotPassword.ts` (`clearError` export)
- Modify: `features/auth/application/useSocialLogin.ts` (`clearError` export)
- Modify: `app/auth.tsx` (use `ErrorState` + dismiss)
- Modify: `package.json` (+ `react-native-confetti-cannon`, possibly `@gorhom/bottom-sheet`)

### Web (`museum-web`)
- Create: `src/components/landing/StorySection.tsx`
- Create: `src/components/landing/__tests__/StorySection.test.tsx`
- Modify: `src/app/[locale]/page.tsx` (mount story between hero + sections)
- Modify: `src/dictionaries/fr.json` + `en.json` (`landing.story.*`)

### Design system (`design-system`)
- Create: `tokens/components/button.ts`
- Create: `tokens/components/empty-state.ts`
- Create: `tokens/components/error-state.ts`
- Modify: `tokens/index.ts` (re-exports)
- Generated: `museum-frontend/shared/ui/tokens.generated.ts` regenerated; `museum-web/src/styles/design-tokens.css` regenerated.

---

## Pre-flight

- [ ] **Step P.1: Verify branch + fresh tree**

Run:
```bash
git status
git log --oneline -3
```
Expect Spec B doc commit at HEAD (`8896f044` or successor).

- [ ] **Step P.2: Run baseline tests**

Run:
```bash
cd museum-backend && pnpm lint && pnpm test
cd ../museum-frontend && npm run lint && npm test
cd ../museum-web && pnpm lint && pnpm test
```
Expected: all green; record the test counts.

- [ ] **Step P.3: Verify dependencies present or pending**

Run:
```bash
grep -E "react-native-confetti-cannon|@gorhom/bottom-sheet" museum-frontend/package.json
```
Note which need installation. They're added in Section 5 / 6 tasks below; do NOT pre-install.

- [ ] **Step P.4: Refresh GitNexus index**

Run:
```bash
npx gitnexus analyze
```

---

## Section 1 — Shared Primitives

### Task 1.1: Design tokens for primitives

**Files:**
- Create: `design-system/tokens/components/button.ts`
- Create: `design-system/tokens/components/empty-state.ts`
- Create: `design-system/tokens/components/error-state.ts`
- Modify: `design-system/tokens/index.ts`

- [ ] **Step 1.1.1: Inspect design-system structure**

Run:
```bash
ls design-system/tokens/
cat design-system/tokens/index.ts | head
```
Identify the existing module pattern (likely TypeScript objects exported with semantic keys).

- [ ] **Step 1.1.2: Author button tokens**

Create `design-system/tokens/components/button.ts`. Define a nested object with the shape:
```ts
export const buttonTokens = {
  primary: { sm: { ... }, md: { ... }, lg: { ... } },
  secondary: { sm: { ... }, md: { ... }, lg: { ... } },
  destructive: { sm: { ... }, md: { ... }, lg: { ... } },
} as const;
```
Each leaf has: `bg`, `bgPressed`, `bgDisabled`, `border`, `text`, `paddingV`, `paddingH`, `fontSize`, `radius`. Use the existing `colors`, `space`, `font` token sources.

- [ ] **Step 1.1.3: Author empty-state + error-state tokens**

Create `design-system/tokens/components/empty-state.ts` and `error-state.ts` with `iconBg`, `iconColor`, `titleColor`, `descriptionColor`, `padding`, `gap` per variant.

- [ ] **Step 1.1.4: Re-export from index + rebuild**

Modify `design-system/tokens/index.ts` to re-export the three new components. Run:
```bash
cd design-system && pnpm build
```
Verify `museum-frontend/shared/ui/tokens.generated.ts` regenerated cleanly. Expect a non-trivial diff.

- [ ] **Step 1.1.5: Commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git commit -m "feat(design-system): button/empty-state/error-state component tokens

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- design-system/tokens/components/button.ts \
     design-system/tokens/components/empty-state.ts \
     design-system/tokens/components/error-state.ts \
     design-system/tokens/index.ts \
     museum-frontend/shared/ui/tokens.generated.ts \
     museum-web/src/styles/design-tokens.css
```

### Task 1.2: LiquidButton component + tests

**Files:**
- Create: `museum-frontend/shared/ui/LiquidButton.tsx`
- Create: `museum-frontend/__tests__/shared/ui/LiquidButton.test.tsx`

- [ ] **Step 1.2.1: Write failing tests**

Create the test file. Cases:
- Renders label and icon when provided.
- Press fires onPress.
- `hapticOnPress !== false` triggers Haptics.selectionAsync (mock).
- `loading` shows ActivityIndicator and disables press.
- `disabled` reduces opacity, disables press, sets accessibilityState.
- Variants apply correct token-driven background colors (assert via `toHaveStyle`).
- Sizes apply correct padding.

- [ ] **Step 1.2.2: Run tests — FAIL**

```bash
cd museum-frontend && npm test -- --testPathPattern=LiquidButton
```

- [ ] **Step 1.2.3: Implement LiquidButton**

Create the component per the API in Spec B Section 1. Use the new `buttonTokens` from `design-system`. Wrap Pressable; render leading/trailing icon if provided; render ActivityIndicator inline when loading; map `disabled || loading` to `accessibilityState.disabled / busy`.

- [ ] **Step 1.2.4: Run tests — PASS**

- [ ] **Step 1.2.5: Commit**

```bash
git commit -m "feat(ui,mobile): LiquidButton primitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/shared/ui/LiquidButton.tsx \
     museum-frontend/__tests__/shared/ui/LiquidButton.test.tsx
```

### Task 1.3: EmptyState component + tests

Same pattern as 1.2. 5 cases:
- Renders icon for each variant (`chat`, `museums`, `reviews`, `dailyArt`, `conversations`).
- Renders title + description.
- Optional CTA renders LiquidButton; tap fires `primaryAction.onPress`.
- Without CTA, no button rendered.
- Accessibility: title is `accessibilityRole="header"`.

Implement, commit:

```bash
git commit -m "feat(ui,mobile): EmptyState primitive (5 variants)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/shared/ui/EmptyState.tsx \
     museum-frontend/__tests__/shared/ui/EmptyState.test.tsx
```

### Task 1.4: ErrorState component + tests

Same pattern as 1.2. Cases:
- Renders title + description + warning icon.
- `onRetry` renders retry button using LiquidButton primary; tap fires it.
- `onDismiss` renders dismiss button using LiquidButton secondary; tap fires it.
- `inline` vs `fullscreen` variant produce different containers.
- Accessibility: `accessibilityRole="alert"` on the container.

Implement, commit:

```bash
git commit -m "feat(ui,mobile): ErrorState primitive (inline + fullscreen variants)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/shared/ui/ErrorState.tsx \
     museum-frontend/__tests__/shared/ui/ErrorState.test.tsx
```

### Task 1.5: Migrate auth screens to LiquidButton

**Files:**
- Modify: `museum-frontend/features/auth/ui/LoginForm.tsx`
- Modify: `museum-frontend/features/auth/ui/RegisterForm.tsx`
- Modify: `museum-frontend/features/auth/ui/AuthActionMenu.tsx`
- Modify: `museum-frontend/features/auth/ui/AuthModeSwitchButton.tsx`
- Possibly modify: `museum-frontend/features/auth/ui/SocialLoginButtons.tsx` (provider buttons)
- Modify: `museum-frontend/features/auth/ui/authStyles.ts` (drop button-specific styles now owned by LiquidButton)
- Update existing auth tests if button selectors change.

- [ ] **Step 1.5.1: Audit each file for button-shaped Pressables**

Run:
```bash
grep -n "Pressable\|TouchableOpacity" museum-frontend/features/auth/ui/*.tsx
```

- [ ] **Step 1.5.2: Replace each button Pressable with LiquidButton**

Match prop names, propagate `accessibilityLabel`, `testID`, etc.

- [ ] **Step 1.5.3: Run auth tests + lint**

```bash
npm test -- --testPathPattern="auth"
npm run lint
```
Both green.

- [ ] **Step 1.5.4: Commit**

```bash
git commit -m "refactor(auth,mobile): adopt LiquidButton in auth screens

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- <list-files-actually-changed>
```

### Task 1.6: Migrate chat screens to LiquidButton

Same pattern as 1.5 for `museum-frontend/features/chat/ui/ChatHeader.tsx`, `ChatInput.tsx`, and any other button-shaped Pressables in `chat/ui/`.

Commit message: `refactor(chat,mobile): adopt LiquidButton in chat screens`.

### Task 1.7: Migrate empty-state call sites to EmptyState

**Files:**
- Modify the 5 empty-state contexts:
  - Chat empty session (`features/chat/ui/...` — find current implementation).
  - Museum directory empty list.
  - Reviews list empty.
  - Daily-art saved empty.
  - Conversations list empty.
- Modify locales: add `empty.<variant>.title` and `empty.<variant>.description` keys to all 8 mobile locales.

Each migration: drop ad-hoc Empty UI, import `EmptyState`, pass `t('empty.<variant>.title')` etc.

Run `npm run check:i18n` to verify parity. Commit.

### Task 1.8: Migrate ErrorNotice usages to ErrorState (inline)

**Files:**
- Modify each consumer of `ErrorNotice` (excluding auth.tsx — handled in §8).
- Drop `museum-frontend/shared/ui/ErrorNotice.tsx` if no consumers remain after migration.

Run `grep -rln "ErrorNotice" museum-frontend/` to enumerate consumers.

Commit message: `refactor(ui,mobile): drop ErrorNotice in favor of ErrorState`.

---

## Section 2 — Onboarding Redesign

### Task 2.1: Add `hasSeenOnboarding` flag if missing

- [ ] **Step 2.1.1: Inspect userProfileStore**

```bash
grep -n "hasSeenOnboarding" museum-frontend/features/settings/infrastructure/userProfileStore.ts
```

If absent, add a new field with `false` default + persist key. Commit:
```bash
git commit -m "feat(settings,mobile): hasSeenOnboarding persist flag for v2 onboarding

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/features/settings/infrastructure/userProfileStore.ts
```

### Task 2.2: Onboarding step components + flow

**Files:**
- Create the 4 step components + the index entry.
- Add locale keys `onboarding.v2.<step>.title|description|next|skip`.

- [ ] **Step 2.2.1: Failing test first**

Create `museum-frontend/__tests__/app/onboarding.test.tsx`. Cases:
- Renders step 1 (Greeting) on mount.
- "Next" advances to step 2; same to step 3; same to step 4.
- "Skip" on any step exits and sets `hasSeenOnboarding`.
- "Done" on step 4 exits and sets `hasSeenOnboarding`.

- [ ] **Step 2.2.2: Implement**

Use Reanimated entrance animations on each step.

- [ ] **Step 2.2.3: Commit**

```bash
git commit -m "feat(onboarding,mobile): 4-step Reanimated v2 flow with skip + done

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-frontend/app/\(stack\)/onboarding/ \
     museum-frontend/__tests__/app/onboarding.test.tsx \
     museum-frontend/shared/locales/
```

### Task 2.3: Wire root navigator to show onboarding on first launch

- [ ] **Step 2.3.1: Modify root layout**

In `museum-frontend/app/_layout.tsx`, read `userProfileStore.hasSeenOnboarding`; if false on first navigation, redirect to `/(stack)/onboarding`. Test the redirect flow.

- [ ] **Step 2.3.2: Commit**

---

## Section 3 — Daily-Art Polish

### Task 3.1: Parallax hero

**Files:**
- Modify: `museum-frontend/features/daily-art/ui/DailyArtCard.tsx`
- Possibly modify: `museum-frontend/app/(stack)/daily-art.tsx` if scroll lives there.

- [ ] **Step 3.1.1: Convert ScrollView to Animated.ScrollView with onScroll handler**

- [ ] **Step 3.1.2: Wrap hero image in Animated.Image with translateY/scale derived from scrollY**

- [ ] **Step 3.1.3: Test rendering does not crash, scroll handler reads scrollY**

- [ ] **Step 3.1.4: Commit**

### Task 3.2: Swipe-to-save

**Files:**
- Modify: `museum-frontend/features/daily-art/ui/DailyArtCard.tsx`
- Modify: `museum-frontend/features/daily-art/infrastructure/dailyArtStore.ts` (add `toggleSaved` if missing)

- [ ] **Step 3.2.1: Wrap card in Swipeable from gesture-handler**

- [ ] **Step 3.2.2: Left action triggers toggleSaved + Haptics.notificationAsync(Success)**

- [ ] **Step 3.2.3: Test gesture-handler simulation**

- [ ] **Step 3.2.4: Commit**

---

## Section 4 — Chat UX (Typing + Skeleton)

### Task 4.1: TypingPlaceholder + SkeletonBubble primitives

**Files:**
- Create: `museum-frontend/features/chat/ui/TypingPlaceholder.tsx`
- Create: `museum-frontend/__tests__/features/chat/TypingPlaceholder.test.tsx`

Steps mirror Task 1.2 / 1.3 / 1.4. Reanimated `withRepeat + withTiming` for the dot loop and the skeleton pulse. Localize copy via `t('chat.typing.label')`.

Commit.

### Task 4.2: Wire TypingPlaceholder into ChatMessageList

**Files:**
- Modify: `museum-frontend/features/chat/ui/ChatMessageList.tsx`
- Modify: `museum-frontend/features/chat/application/useChatSession.ts` (expose `lastAssistantPending` derived state)
- Update existing chat tests + add a new test asserting placeholder visibility transitions.

Commit message: `feat(chat,mobile): typing indicator + skeleton bubble during pending/streaming`.

---

## Section 5 — Reviews (Haptic + Confetti)

### Task 5.1: Add `react-native-confetti-cannon`

```bash
cd museum-frontend && npm install react-native-confetti-cannon
```

Commit `package.json` + `package-lock.json`.

### Task 5.2: Star tap haptic

**Files:**
- Modify: `museum-frontend/features/review/ui/StarRating.tsx`
- Update existing test or add new case asserting `Haptics.selectionAsync` mock fires.

Commit.

### Task 5.3: Submit success confetti

**Files:**
- Modify: `museum-frontend/features/review/ui/ReviewSubmitForm.tsx`
- Add reduced-motion check via `AccessibilityInfo.isReduceMotionEnabled()`.
- Test: submit invokes confetti render conditionally on reduced motion off.

Commit.

---

## Section 6 — Map Offline Pack Prompt

### Task 6.1: museumStore offlinePackChoice persistence

**Files:**
- Modify: `museum-frontend/features/museum/infrastructure/museumStore.ts`

Add `offlinePackChoice: Record<number, { decision: 'accepted' | 'declined'; recordedAt: string }>` to the persisted store. Add `scheduleOfflinePack(museumId)` and `declineOfflinePack(museumId)` actions.

Commit.

### Task 6.2: OfflinePackPrompt component

**Files:**
- Create: `museum-frontend/features/museum/ui/OfflinePackPrompt.tsx`
- Create: tests for trigger logic + button actions.

If `@gorhom/bottom-sheet` is not installed, install it (`npm install @gorhom/bottom-sheet`). Otherwise reuse.

Commit.

### Task 6.3: Wire prompt into MuseumMapView

**Files:**
- Modify: `museum-frontend/features/museum/ui/MuseumMapView.tsx`

Mount `OfflinePackPrompt` conditionally on geofence + connection strength + no prior choice. Test integration.

Commit.

---

## Section 7 — Web Landing Story Section

### Task 7.1: StorySection component

**Files:**
- Create: `museum-web/src/components/landing/StorySection.tsx`
- Create: `museum-web/src/components/landing/__tests__/StorySection.test.tsx`
- Modify: `museum-web/src/dictionaries/fr.json` + `en.json`

Implement per Spec B Section 7. Vitest tests assert each step label matches dictionary.

Commit:
```bash
git commit -m "feat(web): landing story section (4-step animated timeline)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" \
  -- museum-web/src/components/landing/StorySection.tsx \
     museum-web/src/components/landing/__tests__/StorySection.test.tsx \
     museum-web/src/dictionaries/fr.json \
     museum-web/src/dictionaries/en.json
```

### Task 7.2: Mount in landing page

**Files:**
- Modify: `museum-web/src/app/[locale]/page.tsx`

Insert `<StorySection />` between the hero and the first existing section. Run lint + test + build. Lighthouse re-check (manual).

Commit.

---

## Section 8 — auth.tsx ErrorState Integration

### Task 8.1: Expose `clearError` from each auth hook

**Files:**
- Modify: `museum-frontend/features/auth/application/useEmailPasswordAuth.ts`
- Modify: `museum-frontend/features/auth/application/useForgotPassword.ts`
- Modify: `museum-frontend/features/auth/application/useSocialLogin.ts`

Each hook adds `clearError: () => void` returning `mutation.reset()` (and `setInfoMessage(null)` if the hook owns infoMessage state).

Commit.

### Task 8.2: Replace ErrorNotice with ErrorState in auth.tsx

**Files:**
- Modify: `museum-frontend/app/auth.tsx`
- Update: `__tests__/screens/auth.test.tsx` with new test case asserting dismiss works.

```ts
const errorMessage = emailPasswordAuth.errorMessage ?? forgot.errorMessage ?? social.errorMessage;
const handleDismissError = () => {
  emailPasswordAuth.clearError();
  forgot.clearError();
  social.clearError();
};

return (
  // ...existing JSX
  errorMessage && (
    <ErrorState
      variant="inline"
      title={t('auth.error.title', { defaultValue: 'Erreur' })}
      description={errorMessage}
      onDismiss={handleDismissError}
    />
  )
);
```

Commit.

---

## Post-flight

- [ ] **Step Q.1: Repo-wide lint + tests**

Run:
```bash
cd museum-backend && pnpm lint && pnpm test
cd ../museum-frontend && npm run lint && npm test
cd ../museum-web && pnpm lint && pnpm test
```
All green; counts ≥ baseline + new tests.

- [ ] **Step Q.2: GitNexus detect_changes**

Confirm only Spec B-scoped symbols affected.

- [ ] **Step Q.3: iOS simulator manual smoke**

User-driven OR via xcrun simctl in headless mode if available. Walk through:
1. First launch → onboarding 4 steps + skip path.
2. Daily-art parallax + swipe-to-save (heart appears, save persists).
3. Chat: send a message → typing dots + skeleton; first token clears them.
4. Reviews: tap stars (haptic) → submit (confetti).
5. Map: enter geofence on Wi-Fi → offline-pack prompt; accept then decline a different museum.
6. Auth: trigger an error (wrong password) → dismiss with the new ErrorState button.

- [ ] **Step Q.4: Web Lighthouse re-check**

```bash
cd museum-web && pnpm build
# Then run Lighthouse via the existing CI script or manually in Chrome DevTools.
```
Compare to Spec A baseline; perf, a11y, best-practices, SEO each within ± 1 point.

- [ ] **Step Q.5: Bundle size delta**

Mobile: not actively tracked; check Metro output if a budget exists. Web: compare the new build's `metafile.json` (if Next.js exposes one) against the Spec A baseline.

---

## Self-Review (auto-applied during writing)

1. **Spec coverage:** all 8 sections of `2026-05-01-spec-b-ux-wahoo-design.md` mapped to tasks.
2. **Placeholder scan:** no "TBD"; concrete steps in each task; commit messages are templated but include real intent.
3. **Type consistency:** primitive APIs declared in §1 are reused unchanged in §5–§8 (`LiquidButton`, `ErrorState`).

---

## Out of Scope (reminder)

- Semantic LLM cache, UserMemory personalization, multi-modal recall, voice continuity (Spec C / Spec D).
- ES + DE locales for web (separate spec).
- Lighthouse score uplift program (separate spec).
- Bundle size monitoring CI gate (separate spec).
- Sentry RN deployment target check (separate spec).
- Deep linking universal-links (separate spec).
