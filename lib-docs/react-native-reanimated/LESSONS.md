# Lessons — react-native-reanimated v4.2.1 + worklets 0.7.4

## 2026-05-20

Refresh audit (lib-doc-curator, UFR-022). Pin: reanimated 4.2.1 / worklets 0.7.4 / RN 0.83.6 / Expo SDK 55. Latest upstream 4.3.1 / worklets 0.8.3. **No security advisories.** Verdict: **PASS_WITH_WARNINGS** (3 low warnings, all carried/known; migration to v4 confirmed CLEAN). 9 importing files scanned.

### ⚠️ W1 LOW : babel.config.js missing explicit `react-native-worklets/plugin` (carried from -18)
- `museum-frontend/babel.config.js` only lists `babel-plugin-react-compiler`; the worklets plugin is auto-included by `babel-preset-expo` (Expo SDK ≥50). Safe today, not traceable — a future Expo bump dropping the auto-include would silently break every worklet.
- **Fix TD-REA-01** : add `'react-native-worklets/plugin'` LAST in the plugins array.

### ⚠️ W2 LOW : infinite `withRepeat(-1)` cleanup — RESOLVED, keep watching
- `SkeletonBox.tsx:47`, `TypingPlaceholder.tsx:48,78` now all `cancelAnimation(opacity)` in `useEffect` cleanup (TD-REA-02 done). Pattern is correct; flag any NEW `withRepeat(..., -1)` site that omits cleanup.

### ⚠️ W3 LOW : test introspects private `_value` (NEW this audit)
- `__tests__/features/chat/ui/ImageCompareCardSkeleton.test.tsx:67` reads `flat.opacity._value`. This targets **RN-core `Animated.Value`** (the component imports `Animated` from `react-native`, not Reanimated) — so it's technically outside this lib — but it is the exact anti-pattern in memory `feedback_opaque_animated_value_test_contract` (DON'T #10). Private field, version-fragile.
- **Fix** : assert observable state — `toJSON()` snapshot of the rendered style, or assert the reduce-motion code path produces a literal `opacity: 1` number (the test already has the `typeof flat.opacity === 'number'` branch; the `_value` fallback is the only fragile part). Low priority since RN-core Animated.Value is stable, but should not be copied to any Reanimated SharedValue test.

### ⚠️ React Compiler interaction (advisory, no live violation)
- `babel-plugin-react-compiler@^1.0.0` is enabled. `Confetti`/`SkeletonBox`/`TypingPlaceholder` write `sv.value = withTiming(...)` inside `useEffect` — tolerated. Forward-safe form is `sv.set(...)` / `sv.get()` (PATTERNS DON'T #11). Prefer `.set()`/`.get()` in all new Reanimated code.

### ✅ v4 migration CLEAN (re-confirmed)
- Zero v3-residual APIs across all 9 files (no `runOnJS`/`runOnUI`/`executeOnUIRuntimeSync`/`makeShareableCloneRecursive`/`useWorkletCallback`/`useAnimatedGestureHandler`/`useScrollViewOffset`/`combineTransition`/`addWhitelisted*Props`).
- `scheduleOnRN` correctly imported from `react-native-worklets` (`Confetti.tsx:11,124`).
- Worklet directives correct (`ArtworkHeroModal.tsx:83,88` pinch handlers).
- No SharedValue anti-patterns (no destructure, no sub-property mutation, no writes inside `useAnimatedStyle`).
- `FadeIn.duration(400)` layout animation idiomatic on 4 onboarding slides.
- `interpolate` + `Extrapolation.CLAMP` in `SwipeableConversationCard.tsx` correct; hooks correctly hosted in child `DeleteAction` (renderRightActions can't host hooks).
- `key={state.route}` remount pattern in `BottomSheetRouter.tsx:155` matches both memory `feedback_state_machine_react_key` AND upstream layout-animation docs ("changing key unmounts+remounts → re-triggers entering").

### Upgrade note (4.2.1 → 4.3.1)
- Not urgent — 4.2.1 fully supported on RN 0.83. If upgrading: **must bump worklets 0.7.4 → 0.8.x in the same change** (4.3.x drops worklets 0.7.x). Only behavioral delta is 4.3.0's compile-time AnimatedStyle type check (a safety improvement). Smoke spring-heavy screens after.
