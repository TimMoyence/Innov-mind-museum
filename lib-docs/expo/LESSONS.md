# Lessons — expo (mega-family)

Project-specific gotchas pour Expo SDK 55 family dans Musaium. Audit enterprise-grade 2026-05-18 (sampled 15/93 consumers).

## 2026-05-18 — `expo-file-system/legacy` est le subpath transitoire SDK 55
- **Symptôme** : pas de bug, mais migration unit future identifiée.
- **Cause** : SDK 55 a split `expo-file-system` en nouveau API typé (default) + subpath `/legacy` mirror du SDK 54 surface (`cacheDirectory`, `getInfoAsync`, `writeAsStringAsync`, `EncodingType.Base64`, `makeDirectoryAsync`). PATTERNS.md n'a pas le détail (snapshot n'a pas deep-fetch expo-file-system).
- **Sites utilisateurs de `/legacy`** : `museum-frontend/features/chat/application/useTextToSpeech.ts:4`, `imageUploadOptimization.ts`, `offlineImageStorage.ts` + 4 test mocks.
- **Fix** : statu quo acceptable SDK 55. SDK 56+ exigera migration vers nouvelle API typed.
- **Anti-pattern à éviter** : ajouter de nouveaux imports `/legacy` sans planifier la migration.

## 2026-05-18 — `expo-secure-store` doit être loaded via `require()` lazy + Platform.OS guard
- **Symptôme** : prévention crash class type `expo-web-browser` SIGABRT (CLAUDE.md § iOS build chain).
- **Cause** : module native missing (test env, web) → crash launch. Pattern défensif : `require('expo-secure-store')` dans try/catch + fallback storage adapter (AsyncStorage).
- **Site exemplaire** : `museum-frontend/features/auth/infrastructure/authTokenStore.ts:26-39`.
- **Anti-pattern à éviter** : import statique `import * from 'expo-secure-store'` qui crash si module absent à init.
- **À appliquer** : tout nouveau native-only expo module consommé par code qui run aussi en jsdom/web.

## 2026-05-18 — OTA intentionally disabled (ADR-009) — `Updates.reloadAsync` = soft-reset seulement
- **Symptôme** : N/A (orientation doctrine).
- **Cause** : `app.config.ts:343-348` set `updates.enabled: false` + `checkAutomatically: 'NEVER'`. 2 prod call-sites (`ErrorBoundary.handleReload`, `I18nContext` post-locale-change) invoquent `Updates.reloadAsync()` purement pour remount JS bundle (NOT OTA-coupled).
- **Fix** : NE PAS introduire `useUpdates()` polling sans revisit ADR-009. PATTERNS.md §2 `Updates.useUpdates() + reloadAsync` NE s'applique PAS ici.
- **Anti-pattern à éviter** : `useUpdates()` polling, `Updates.checkForUpdateAsync()`.

## 2026-05-18 — Validations positives (conformité confirmée)
- ✅ Zero `expo-av` résidual (migration vers expo-audio + expo-video complète)
- ✅ Zero `router.reset()` (SDK 55 removed)
- ✅ Zero `expo-status-bar` deprecated props (`backgroundColor`, `translucent`, `networkActivityIndicatorVisible`)
- ✅ Zero `experimentalBlurMethod`
- ✅ Zero forbidden `app.json` fields (`newArchEnabled`, `edgeToEdgeEnabled`, `reactCanary`, `notification`)

## 2026-05-20 — Refresh SDK 55 core family (expo / router / updates / babel / build-properties)
- **Sub-package PATTERNS.md promus de stubs → docs dédiées.** Avant, `expo-router`/`expo-updates`/`babel-preset-expo`/`expo-build-properties` n'avaient qu'un stub pointant vers `expo/PATTERNS.md`. Désormais chacun a PATTERNS.md + LESSONS.md + snapshot-2026-05-20.md + VERSION + sources.json. Cite le doc dédié pour les specifics, le parent `expo/` pour la policy SDK-wide.
- **`app.config.ts` est loadé par Node `require` côté Expo CLI** — n'honore PAS l'alias `@/*` ni la compilation transitive des imports `.ts`. Tout helper utilisé dedans DOIT être inliné (cf. `readEnvString` `app.config.ts:12-18`, CI run 25987246319). Anti-pattern : `import { x } from '@/shared/...'` dans app.config.
- **React Compiler configuré via raw plugin sans `experiments.reactCompiler`.** `babel.config.js:5` liste `babel-plugin-react-compiler` mais `app.config.ts:343-345` n'a que `{ typedRoutes: true }`. Le path SDK-recommandé est `experiments.reactCompiler: true` + option preset `react-compiler`. Compile mais bypasse le guard SDK + l'intégration lint eslint-config-expo. Action item non-bloquant (cf. babel-preset-expo/PATTERNS §5).
- **Sécurité RSC CVE (CVE-2025-55182 RCE + 55183/55184/67779 DoS)** patchées SDK 55 expo-router 2026-01-26. **Musaium NON exploitable** : client-only (`web.output:'single'`, pas de `+middleware.ts`/server functions). Ne pas introduire RSC/server output sans revisiter ces CVE.
- **OTA toujours disabled (ADR-009).** Confirmé `app.config.ts:349-354` `enabled:false` + `checkAutomatically:'NEVER'`. 2 call-sites `reloadAsync` (`ErrorBoundary.tsx:41`, `I18nContext.tsx:80`) = soft-reset JS bundle only, pas OTA. PATTERNS expo-updates §1.
- **Babel reanimated/worklets : ne PAS ajouter manuellement.** Reanimated 4.2.1 + worklets 0.7.4 installés ; babel-preset-expo auto-include le plugin worklets (bundlé dans reanimated/plugin) depuis SDK 54. `babel.config.js` correct (aucun plugin worklet manuel). Ajouter les deux = conflit (expo/expo#42684).
