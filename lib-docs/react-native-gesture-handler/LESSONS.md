# Lessons — react-native-gesture-handler (v2.31.0)

Audit 2026-05-18 : **🚨 2 BLOCKERS** — gestures silently fail in prod sans fix.

## 🚨 F1 HIGH : `GestureHandlerRootView` MISSING root → gestures silent-fail (BLOCKER pre-V1)
- **Cause** : grep `GestureHandlerRootView` in museum-frontend/{app,features,shared,components}/** = **0 hits**. app/_layout.tsx renders Stack sans wrapper. index.js only imports 'expo-router/entry'. Expo-router build/ does NOT contain GestureHandlerRootView non plus.
- **Impact** : PATTERNS.md §2 "Gestures rendered outside its subtree are silently ignored." Pinch-zoom ArtworkHeroModal + Swipeable DailyArtCard/SwipeableConversationCard may silently fail in prod. **Android New Arch (RCT_NEW_ARCH_ENABLED=1) = hard-required**.
- **Fix TD-RNGH-01** : Wrap Stack subtree dans `<GestureHandlerRootView style={{flex:1}}>` at app/_layout.tsx top of return().

## 🚨 F2 HIGH : `ArtworkHeroModal` Modal does NOT re-wrap GestureHandlerRootView (BLOCKER pre-V1)
- **Cause** : `museum-frontend/features/chat/ui/ArtworkHeroModal.tsx:97-141` renders `<Modal>` with `<GestureDetector gesture={pinch}>` INSIDE the Modal SANS nested GestureHandlerRootView.
- **Impact** : PATTERNS.md §2 Modal wrapping : "modal is presented in its own native window ; gestures inside MUST be re-wrapped." Pinch-zoom (entire purpose of this modal per R20 docstring) **will silently NOT fire** on iOS/Android.
- **Fix TD-RNGH-02** : Wrap `<SafeAreaView>` body inside `<Modal>` with `<GestureHandlerRootView style={{flex:1}}>`.

## ⚠️ F3 MEDIUM : Gesture instance recreated every render
- `ArtworkHeroModal.tsx:76-85` calls `Gesture.Pinch().onUpdate(...).onEnd(...)` inline → fresh gesture instance every render.
- **Fix TD-RNGH-03** : wrap in `useMemo(() => Gesture.Pinch()...., [])`.

## ⚠️ F4 MEDIUM : Legacy Swipeable + Animated API used
- `DailyArtCard.tsx:3,37,178` + `SwipeableConversationCard.tsx:1,4` import legacy Swipeable + Animated avec `// eslint-disable-next-line @typescript-eslint/no-deprecated`.
- v2.31.0 ships `ReanimatedSwipeable` as modern equivalent.
- **Fix TD-RNGH-04** : migrate to `<ReanimatedSwipeable>` from `react-native-gesture-handler/ReanimatedSwipeable`.

## ⚠️ F5 LOW : Jest gestureHandler setup — verify test runner
- Project uses Node.js test runner per CLAUDE.md (not Jest). Finding likely N/A. Verify on next test failure.

## ✅ Positives
- Pinch focal-point timing correct (no e.focalX/focalY read in onUpdate — only e.scale)
- Worklet directive correctly applied
- Lazy mount pattern (return null when !visible) equivalent to .enabled(false)
