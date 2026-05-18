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
