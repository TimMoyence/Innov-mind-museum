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

## 2026-05-20 — Refresh: TD-REACT-01 CLOSED (cancellation tick adopté)
- **Status** : ✅ FERMÉ. `useSessionLoader.ts` utilise désormais un `loadTickRef` (ref-tick variant, `useSessionLoader.ts:35-65`) — l'await→setState est gardé par `if (tick.cancelled) return` (ligne 55). Side-effects R9/R10 (Sentry capture + `storeSetSession` shared-cache hydration) restent UNCONDITIONNELS, placés AVANT le guard (lignes 53-54, 63) — voir commentaires R9/R10. Pattern documenté `PATTERNS.md` §3 (variant b).
- **Leçon** : la cancellation a 2 formes valides — closure-cell flag dans `useEffect` (variant a) OU ref-tick dans un `useCallback` (variant b). Choisir (b) quand l'async vit dans un callback re-déclenchable manuellement (reload).

## 2026-05-20 — TD-REACT-02 toujours OUVERT : 8 sites `<Context.Provider>` (re-vérifié, count inchangé)
- **Re-scan 2026-05-21** : `grep -rn "Context.Provider"` confirme exactement 8 sites production (6 FE + 2 web), identiques au baseline -18 :
  - FE : `features/chat/application/DataModeProvider.tsx:94`, `features/auth/application/AuthContext.tsx:333`, `features/paywall/application/PaywallProvider.tsx:95`, `shared/ui/ThemeContext.tsx:56`, `shared/i18n/I18nContext.tsx:101`, `shared/infrastructure/connectivity/ConnectivityProvider.tsx:34`
  - web : `src/lib/auth.tsx:189`, `src/lib/admin-dictionary.tsx:36`
- **Fix** : `<Context value>{children}</Context>` (PATTERNS §2b). One-liner par site, codemod upstream dispo. Aucun bug runtime — deprecation path uniquement.

## 2026-05-20 — TD-REACT-03 OUVERT : admin user page = candidate Actions (confirmé par lecture)
- **Site** : `museum-web/src/app/[locale]/admin/users/[id]/page.tsx:168-239` — `runMutation` manuel = `setBusy(true)` + try/catch/finally `setBusy(false)`, 4 mutations (role/suspend/unsuspend/delete) toutes via ce wrapper. C'est exactement le boilerplate que React 19 Actions supprime.
- **Fix** : migrer vers `useActionState((prev, fd) => …)` par mutation OU `startTransition(async …)` + `isPending` ; envelopper `user` dans `useOptimistic` pour toggle suspend/role instantané. Note : museum-web n'a PAS le React Compiler → les `useCallback` ici (lignes 136, 162, 168, 204-239) restent load-bearing tant que la migration Actions n'est pas faite.
- **Anti-pattern** : `PATTERNS.md:§5` ligne "DON'T ship new mutation pages with manual useState(busy)".

## 2026-05-20 — Sécurité : 7 advisories React = TOUTES RSC-scoped, non-exploitables ici
- **Constat** : toutes les GHSA React publiées (Dec 2025 → May 2026) ciblent React Server Components (DoS Server Actions + 1 Critical RSC + 1 source-code-exposure Moderate). Musaium n'écrit AUCUN RSC (museum-web App Router mais pages = client components / static ; voir scan : zéro `createRoot`/`hydrateRoot` custom, Next.js gère le bootstrap). Donc surface d'attaque = nulle côté Musaium.
- **Action** : rester pinné ≥19.2.6 (FE déjà `19.2.6`, web `^19.2.0` résout ≥19.2.6) suffit — tous les fixes inclus. Pas de bump requis.

## 2026-05-20 — React Compiler ON en FE, OFF en web (asymétrie à connaître)
- **Constat** : `museum-frontend/babel.config.js:5` active `babel-plugin-react-compiler` ; `museum-web/next.config.*` ne l'active PAS.
- **Implication** : en FE, les nouveaux `useMemo`/`useCallback` sont en général redondants (compiler memoize) — audit compte 208 `useCallback` + 73 `useMemo`, à traiter comme suspects en review. En web, la mémoïsation manuelle reste nécessaire (ex admin page). Ne pas appliquer la même règle aux 2 apps.
