# Lessons — @tanstack/react-query (family v5.100.x)

Project-specific gotchas. Audit enterprise-grade 2026-05-18 (11 consumers audités).

## 2026-05-18 — queryFn ignore AbortSignal → race condition GPS jitter
- **Symptôme** : `useMuseumDirectory` keepPreviousData path : rapid GPS jitter crée requests overlapping → late response du précédent location peut clobber le résultat current.
- **Cause** : `queryFn: () => api.get(url)` ignore `QueryFunctionContext.signal`. v5 standard : `queryFn: ({ signal }) => api.get(url, { signal })`. PATTERNS.md §Coverage warnings explicite "signal (AbortSignal) integration in particular is important for cancellation".
- **Sites** : 
  - `museum-frontend/features/auth/application/useMe.ts:27`
  - `museum-frontend/features/museum/application/useMuseumDirectory.ts:122,181`
- **Fix** : voir TD-TQ-01. Thread `{ signal }` from ctx into authService.me + museumApi.searchMuseums + listMuseumDirectory. Verify httpClient (axios) supports `{ signal }` config option.
- **Anti-pattern à éviter** : ajouter une nouvelle useQuery sans `signal` forwarding.

## 2026-05-18 — useMutation onSuccess login : NO invalidation de ['user', 'me']
- **Symptôme** : edge case post-login user B : `['user','me']` peut servir stale data session A jusqu'à staleTime (5min) ou foreground transition.
- **Cause** : Login/register/social-login mutations dans `useEmailPasswordAuth.ts:57-105` + `useSocialLogin.ts:65-81` NE déclenchent PAS `queryClient.invalidateQueries({ queryKey: ['user'] })` onSuccess. Mitigé partiellement par `resetPersistedCache + queryClient.clear()` sur logout, mais PAS sur cold-start login ou session swap (logout puis login B immédiat).
- **Fix** : voir TD-TQ-02. Ajouter `onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user'] })` aux 4 mutations OR centralize dans loginWithSession.
- **Anti-pattern à éviter** : créer une mutation auth sans invalider les queries d'identité dérivées.

## 2026-05-18 — Validations positives EXEMPLAIRES (conformité confirmée)
- ✅ **QueryClient init** : `gcTime=24h` aligned with `persistMaxAge=24h` (PATTERNS.md §3 DO satisfait — gcTime ≥ maxAge).
- ✅ **PersistQueryClientProvider** wrapper (vs bare persistQueryClient) — handles subscribe/unsubscribe + hydration race.
- ✅ **Cache buster keyed on appVersion** — cache wipe sur app upgrade (idiomatic persist-client).
- ✅ **`shouldDehydrateQuery` security-aware** : whitelist non-sensitive prefixes blockant auth/user/admin/messages/session PII de AsyncStorage plaintext. **Au-delà** de ce que PATTERNS.md mandate.
- ✅ **Object-only syntax v5** : zero positional args.
- ✅ **`placeholderData=keepPreviousData`** : correct v5 rename usage (replaces v4 keepPreviousData boolean flag).
- ✅ **`resetPersistedCache()` removes AsyncStorage key BEFORE `queryClient.clear()`** — correct order (évite hydration de stale blob sur crash mid-reset).
- ✅ **No v5-removed callbacks** : zero `onSuccess/onError/onSettled` sur useQuery (queries seulement).
- ✅ **structuralSharing not globally disabled** (default true, conforme).
- ✅ **DevTools NOT installed** : DX choice (React Native débug via Flipper/RN DevTools), acceptable.

## 2026-05-18 — Polish opportunity : `['notifications']` queryKey flat
- **Site** : `AuthContext.tsx:220` — queryKey `['notifications']` est flat. Bénéficierait de hierarchical scope `['notifications', userId]` pour multi-tenant invalidation.
- **Status** : LOW priority polish.
