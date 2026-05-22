# Lessons — react-native-worklets (v0.7.4)

## 2026-05-20

First dedicated audit (was previously a stub pointing to react-native-reanimated). Installed **0.7.4** via reanimated 4.2.1; latest stable **0.8.3** (minor drift, benign). Verdict: GREEN.

- **Babel — correct, do not touch.** `museum-frontend/babel.config.js` is `presets: ['babel-preset-expo']` + `plugins: ['babel-plugin-react-compiler']`. Verified in `node_modules/babel-preset-expo/build/index.js`: the preset **auto-injects `react-native-worklets/plugin` as the LAST plugin** when the package is installed, and it is **mutually exclusive** with the legacy `react-native-reanimated/plugin` (worklets supersedes it for reanimated 4.x). Adding either plugin manually would double-apply/mis-order. No action.
- **`scheduleOnRN` already adopted.** `shared/ui/Confetti.tsx:11,124` imports `scheduleOnRN` from `react-native-worklets` and calls it inside a `withTiming` completion worklet to fire the JS `onAnimationEnd` prop. This is the modern (0.8+) replacement for `runOnJS` — forward-looking and correct. No deprecated `runOnJS`/`runOnUI` call sites found in app code.
- **Direct imports are minimal.** Only `Confetti.tsx` imports the package directly. The `'worklet'` directive usage (`ArtworkHeroModal.tsx:83,88`) needs no import — the babel plugin handles it.
- **Version lockstep rule.** Do NOT bump `react-native-worklets` 0.7.4→0.8.3 in isolation. It must move with `react-native-reanimated` (4.2.1 declares the dep); the worklet ABI must agree across plugin + native runtime. Bump reanimated, let worklets follow.
- **No security advisories** (GitHub GHSA, NPM ecosystem, 2026-05-21). No GitHub Releases published for the package (monorepo; track via reanimated changelog + npm versions).
