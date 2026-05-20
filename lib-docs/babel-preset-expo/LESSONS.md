# Lessons — babel-preset-expo (Musaium)

Project gotchas for `babel-preset-expo@~55.0.8` in Musaium. Human-edited; agents do not touch.

## 2026-05-20 — React Compiler via raw plugin, missing `experiments.reactCompiler`
- **Cause**: `babel.config.js:5` lists `babel-plugin-react-compiler` as a raw top-level plugin, but `app.config.ts:343-345` sets `experiments` to `{ typedRoutes: true }` only — `experiments.reactCompiler` is absent. The SDK-recommended path is `experiments.reactCompiler: true` + the preset `react-compiler` option.
- **Impact**: compiles fine; difference is the SDK guard + eslint-config-expo React-Compiler lint integration. Non-blocking.
- **À appliquer**: reviewer SHOULD flag NEW React-Compiler config using the raw plugin without the experiment flag. If revisiting, migrate to `experiments.reactCompiler: true` and drop the raw plugin.

## 2026-05-20 — do NOT add reanimated/worklets plugin manually
- **Cause**: react-native-reanimated 4.2.1 + react-native-worklets 0.7.4 are installed. babel-preset-expo auto-includes the worklets plugin (bundled inside reanimated/plugin) since SDK 54. `babel.config.js` correctly omits it.
- **Anti-pattern à éviter**: adding `react-native-reanimated/plugin` and/or `react-native-worklets/plugin` to the plugins array → conflict (expo/expo#42684). If ever needed outside the preset, it MUST be the LAST plugin.

## 2026-05-20 — babel.config.js must stay minimal + `api.cache(true)`
- **Cause**: `presets: ['babel-preset-expo']` covers RN preset + decorators + web tree-shaking + font icons + reanimated/worklets. `api.cache(true)` caches per-env. Don't add transforms the preset already provides.
