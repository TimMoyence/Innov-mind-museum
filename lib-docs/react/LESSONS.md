# Lessons — react (family : react + react-dom v19.2.6)

Project-specific gotchas. Audit enterprise-grade 2026-05-18 (sampled 15 files cross-FE+web).

## 🚨 2026-05-18 — useSessionLoader HIGH : async fetch SANS cancellation flag (stale data race)
- **Symptôme** : navigation rapide entre chats → stale fetch de session A peut clobber state de session B (state corruption visible).
- **Cause** : `useSessionLoader.ts:25-56` await `chatApi.getSession` puis setMessages/setSessionTitle UNCONDITIONALLY. Pas de cancellation flag. Memory `feedback_closure_cell_cancellation_react_hooks` violée.
- **Fix** : voir TD-REACT-01. Pattern de cancellation déjà implémenté correctement dans `useResumableSession` et `useProactiveMuseumSuggestion` — copier byte-for-byte :
  ```ts
  useEffect(() => {
    const state = { cancelled: false };
    void (async () => {
      const data = await chatApi.getSession(sessionId);
      if (state.cancelled) return;
      setMessages(data.messages);
      // ...
    })();
    return () => { state.cancelled = true; };
  }, [sessionId]);
  ```
- **Anti-pattern à éviter** : tout `useEffect` qui await puis setState directement sans cancellation flag (B1/B2/B6 recurrence).
- **Ref** : `museum-frontend/features/chat/application/useSessionLoader.ts:25-56` — sibling correct : `useResumableSession.ts`.

## 2026-05-18 — 8 providers utilisent `<Context.Provider value={…}>` legacy (codemod-grade)
- **Symptôme** : pas de bug runtime mais sur deprecation path React 19.
- **Cause** : React 19 préfère `<Context value={…}>{children}</Context>` (Provider drop). Codemod upstream disponible.
- **Sites** :
  - `museum-frontend/features/auth/application/AuthContext.tsx:333`
  - `museum-frontend/features/paywall/application/PaywallProvider.tsx:95`
  - `museum-frontend/features/chat/application/DataModeProvider.tsx:94`
  - `museum-frontend/shared/ui/ThemeContext.tsx:56`
  - `museum-frontend/shared/i18n/I18nContext.tsx:101`
  - `museum-frontend/shared/infrastructure/connectivity/ConnectivityProvider.tsx:34`
  - `museum-web/src/lib/admin-dictionary.tsx:36`
  - `museum-web/src/lib/auth.tsx:189`
- **Fix** : voir TD-REACT-02. One-line change per provider, mécanique.

## 2026-05-18 — Admin user-detail page = textbook candidate `useActionState` + `useOptimistic`
- **Symptôme** : UX latence visible (user voit row stale jusqu'au network roundtrip).
- **Cause** : `museum-web/src/app/[locale]/admin/users/[id]/page.tsx:131-239` manual `useState(busy)` + try/finally pour runMutation(suspend/unsuspend/delete/role). React 19 Actions sont conçus pour ça.
- **Fix** : voir TD-REACT-03. Migrate to `useActionState((prev, formData) => …)` per mutation OR `startTransition(async () => …)` + `isPending`. Add `useOptimistic` autour de `user` pour toggle instantané.
- **Anti-pattern à éviter** : nouveau form/mutation page avec `useState(busy)` manuel quand React 19 Actions disponible.

## 2026-05-18 — Validations positives (conformité confirmée)
- ✅ **Zero production `forwardRef`** (4 sites restants tous test-harness). React 19 ref-as-prop adopté.
- ✅ **Zero `flushSync`** (clean).
- ✅ **`use()` hook correct adoption** : `museum-web/src/app/[locale]/admin/users/[id]/page.tsx:113` `const { locale, id } = use(params)` pour Next.js 15 async params.
- ✅ **`useSyncExternalStore` correct** : `features/chat/application/useOfflineQueue.ts:32-35` (offline queue singleton, concurrent-safe).
- ✅ **Effect cleanup hygiene** : useTextToSpeech, useAudioRecorder, useStreamingState, PaywallProvider tous retournent cleanup correct.

## 2026-05-18 — Polish opportunities `<Activity>` (React 19.2)
- **Site identifié** : `museum-frontend/app/(tabs)/museums.tsx:51-101` — Map↔List view toggle crossfade puis setViewMode UNMOUNT subtree. Candidate pour `<Activity mode={viewMode === 'map' ? 'visible' : 'hidden'}>` qui preserve map camera state across back-toggle.
- **Status** : deferred polish (V1.1+).
