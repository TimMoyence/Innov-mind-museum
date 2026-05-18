# Lessons — react-native-reanimated v4.2.1 + worklets 0.7.4

Audit 2026-05-18 : **PASS_WITH_WARNINGS**.

## ⚠️ W1 LOW : babel.config.js missing explicit `react-native-worklets/plugin`
- Expo SDK 55 babel-preset-expo auto-includes — safe today MAIS pas traçable.
- **Fix TD-REA-01** : add `'react-native-worklets/plugin'` LAST in plugins array.

## ⚠️ W2 LOW : Infinite `withRepeat(-1)` sans cleanup
- Sites: `SkeletonBox.tsx:38`, `TypingPlaceholder.tsx:36,64`. Mapper GC'd en pratique au unmount mais explicit `cancelAnimation` is defensive.
- **Fix TD-REA-02** : `return () => cancelAnimation(opacity);` dans useEffect cleanup.

## ✅ v4 migration CLEAN
- Zero v3-residual APIs (`runOnJS/runOnUI/executeOnUIRuntimeSync/makeShareableCloneRecursive/useWorkletCallback/useAnimatedGestureHandler/useScrollViewOffset/combineTransition/addWhitelistedNativeProps`)
- `scheduleOnRN` correctly imported from `react-native-worklets` (Confetti.tsx)
- worklet directive correctly applied (ArtworkHeroModal pinch handlers)
- No SharedValue anti-patterns (no destructure, no sub-property mutation, no writes inside useAnimatedStyle)
- FadeIn (4 onboarding slides) layout animation idiomatic
