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

## 2026-05-21 — Re-audit (refresh) : TD-TQ-01 + TD-TQ-02 RÉSOLUS, gaps résiduels
Re-scan post-2026-05-18. Family inchangée (5.100.10/5.100.10/5.99.2). 5.100.11 dispo (safe bump, Vue-only). Pas de v6, pas d'advisory applicable.

### ✅ TD-TQ-01 (AbortSignal) — RÉSOLU sur les 3 sites du ticket
- `useMe.ts:29` → `queryFn: ({ signal }) => authService.me({ signal })`.
- `useMuseumDirectory.ts:126,191` → les 2 queryFn forward `{ signal }` dans `searchMuseums` + `listMuseumDirectory` (geo path, fallback, et search). Commentés `TD-TQ-01 / PATTERNS.md:295` (anchor désormais §4).
- Conforme PATTERNS.md §4. axios ^1.16 supporte `{ signal }` nativement.

### ⚠️ TD-TQ-01 — gap résiduel : `useMuseumEnrichment.ts:84`
- `queryFn: async () => { ... }` n'accepte/forward PAS `signal`. `museumApi.getEnrichment()` + `pollUntilReady()` ne sont pas annulables par le signal react-query.
- **Atténuation existante** : `staleTime:Infinity` + `refetchOnMount/WindowFocus/Reconnect:false` + closure-cell `pollTokenRef` (PATTERNS.md §4 fallback) → la race est déjà fermée par le token monotonic. Le polling loop s'abandonne sur `refresh()`.
- **Verdict** : LOW. Le pattern fallback est légitime ici (poll loop multi-await). Forward `{ signal }` quand même dans `getEnrichment` serait du bonus (annulerait le 1er fetch sur unmount), mais pas un bug actif.

### ✅ TD-TQ-02 (invalidation `['user','me']`) — RÉSOLU + renforcé
- `useEmailPasswordAuth.ts:77-98,134` : login + register invalident `['user']` via discriminator `{ sessionEstablished:true }` (gate les short-circuits validation / no-token). EXEMPLAIRE — au-delà du ticket (PATTERNS.md §5).
- `useSocialLogin.ts:69-108` : Apple + Google idem, discriminator `SocialMutationResult.sessionEstablished`.
- `useUpdateTtsVoice.ts:22` : invalide `['user','me']` onSuccess.
- `AuthContext.tsx:219` : foreground resync invalide `['user','me']`.
- **Clé** : `useMe.ts` a été ajouté (`['user','me']` observer) — sans observer souscrit, tous ces invalidate étaient des no-op forward-looking (cf PATTERNS.md §5 CRITICAL). Le ticket était double : invalider ET souscrire.

### ⚠️ Gap NOUVEAU : focusManager / onlineManager NON câblés dans react-query
- `queryClient.ts:45` commente "mobile uses an explicit AppState listener" — TROMPEUR. `useAuthAppStateSync.ts` écoute `AppState` mais SEULEMENT pour le silent token refresh (auth), PAS pour `focusManager.setFocused()`.
- `grep "focusManager|onlineManager|setEventListener"` → 0 hit dans tout museum-frontend. react-query n'a aucun bridge RN.
- **Conséquence** : `refetchOnReconnect:true` (queryClient.ts:54) ne se déclenche JAMAIS sur RN — la détection reconnect de react-query est web-only sans `onlineManager` wiring (PATTERNS.md §8). `networkMode:'online'` ne pause jamais non plus (device jamais vu offline par react-query). Connectivité gérée hors-react-query via `ConnectivityProvider`/`DataModeProvider` (NetInfo direct) → fonctionne pour l'UI mais les queries ne self-heal pas auto sur reconnect.
- **Fix** : câbler `onlineManager.setEventListener` + `focusManager` au bootstrap (PATTERNS.md §8 snippet). MEDIUM — affecte le self-heal offline→online, qui est un PRE-V1 requirement (GPS/chat offline).

### Note prefetch
- `useMuseumPrefetch.ts` utilise un `Map` custom de timestamps + `chatLocalCache`, PAS `queryClient.prefetchQuery`. Délibéré (cache local séparé). Pas un bug ; nouveau code prefetch ciblant une clé react-query DOIT utiliser `prefetchQuery` (PATTERNS.md §12).

### Validations positives reconduites (toujours conformes)
- ✅ `gcTime=24h == persistMaxAge=24h` ; PersistQueryClientProvider wrapper ; buster keyé app version ; `shouldDehydrateQuery` blacklist PII (messages/session/admin/auth/user) ; `resetPersistedCache` removeClient AVANT clear ; object-only v5 ; `placeholderData=keepPreviousData` ; structuralSharing default ; zero callback removed sur useQuery.
