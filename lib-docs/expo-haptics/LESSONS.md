# expo-haptics — Project Lessons (Musaium, human-edited)

## 2026-05-20

- **Map intent to family, not feel** — `selectionAsync()` for discrete value changes (dominant Musaium pattern, ~13 sites: StarRating, swipe commit, chips), `notificationAsync(Success|Warning|Error)` for operation outcomes, `impactAsync(style)` for physical collisions (ChatInput send = `Light`). Don't use a generic `impact(Heavy)` buzz for everything.
- **Always `void Haptics.x()`, never await** — haptics are cosmetic; awaiting adds latency to the interaction and a rejection must never bubble. Existing sites use `void` correctly.
- **Don't overuse** — reserve for intentional, discrete, user-initiated taps. Never in scroll/keystroke/animation-tick hot paths (battery + iOS Taptic throttles repeats anyway). Reject PRs sprinkling impacts on incidental events.
- **iOS silently no-ops** under Low Power Mode, disabled-in-Settings, active camera, or dictation. Never gate logic on the buzz having fired.
- **Web ≈ no-op** — safe to call unguarded, just won't fire. No `Platform.OS` guard needed.
- **`performAndroidHapticsAsync` is Android-only** and does nothing on iOS — only for Android-specific texture; not currently used in Musaium.
