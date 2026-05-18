# Lessons — @react-native-async-storage/async-storage (v2.2.0)

Audit 2026-05-18 : **1 HIGH + 1 MEDIUM + 5 INFO**.

## 🚨 F1 HIGH : Key namespacing INCONSISTENT (10 different prefixes)
- **Cause** : 16 keys across 10 prefix families : `musaium.*`, `auth.*`, `runtime.*`, `settings.*`, `museum.*`, `app.*`, `consent.*`, `carnet.*`, `dashboard.*`, `cert-pinning.*`. Aucun ne carry le `musaium.` global prefix recommandé par PATTERNS §3.
- **Impact** : `getAllKeys` cannot be filtered cleanly. Risk of cross-app collision si app shares storage backend (multi-Expo dev menu, ej. previous app instances during dev).
- **Fix TD-AS-01** : Adopt single `musaium.<feature>.<key>` convention. Codemod 16 keys avec one-shot migration reader (try new key, fallback legacy, write new).

## ⚠️ F3 MEDIUM : `storage.ts` wrapper does NOT try/catch `setItem/removeItem/setJSON`
- Only `getJSON` catches. Risk : unhandled promise rejection on quota exceeded / corrupted DB.
- Audit shows `runtimeSettings.ts:79,87,95` do NOT wrap setItem → errors propagate.
- **Fix TD-AS-02** : add try/catch in wrapper (return Result<void> or void+log) OR systematically wrap at call sites (CI grep rule).

## ⚠️ F2 INFO : Auth tokens persist on web fallback (not native)
- `authTokenStore.ts` correctly uses expo-secure-store on native. Web fallback persists JWT in plaintext localStorage-equivalent.
- Acceptable V1 web (admin panel). Doc tech-debt for B2B prod : replace par sessionStorage/cookie-httpOnly.

## INFO F6 : `musaium.query.cache` peut hit 2MB Android cap silently
- TanStack persister, 24h gcTime, throttleTime:1000. No size monitoring → cache growth on long sessions hits cap → setItem rejects → cache hydration breaks cold start.
- **Fix TD-AS-03** : add periodic size check + `bustOnSizeThreshold` (e.g. wipe at 1.5MB) OR switch to MMKV (out of scope V1).

## INFO F7 : 10+ test files redefine inline `jest.mock` (drift risk)
- Each test reinvents partial surface (getItem/setItem stubs only). Any test calling mergeItem will fail silently.
- **Fix TD-AS-04** : create `museum-frontend/__mocks__/@react-native-async-storage/async-storage.js` exporting upstream `jest/async-storage-mock`. Delete 10+ inline mocks (codemod).

## ✅ Positives
- ZERO `clear()` calls (PATTERNS §4 DON'T respected) — logoutCleanup.ts uses targeted `removeItem`
- queryPersister `shouldDehydrateQuery` PII-allowlist (queryClient.ts:75-92) — blocks auth/user/admin/messages from AsyncStorage plaintext
- chatSessionStore.ts explicitly DOC plaintext rejection (V1 PII security decision)
- Node test runner / Jest split correct (zero AsyncStorage tests in `.test-dist/`)
