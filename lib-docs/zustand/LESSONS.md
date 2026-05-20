# Lessons — zustand (v5.0.12)

Audit 2026-05-18 : **PASS-with-2-MINOR**. 9 stores audités, 16 consumers verified.

## ⚠️ F1 MINOR : `dataModeStore.ts` missing `version` AND `partialize`
- Schema evolution path absent — future field additions will silently rehydrate stale shape sans migration.
- **Fix TD-ZUS-01** : add `version: 1, partialize: (s) => ({ preference: s.preference })` for parity avec sibling stores (runtimeSettingsStore, audioDescriptionStore).

## ⚠️ F2 MINOR : `offlinePackChoiceStore.ts` missing `partialize`
- zustand will attempt to serialize action functions → JSON.stringify drops silently (functionally safe) BUT breaks future inspection + adds noise on disk.
- **Fix TD-ZUS-02** : add `partialize: (state) => ({ choices: state.choices })`.

## ✅ Positives EXEMPLAIRES (9 stores)
- ALL named import `import { create } from 'zustand'` v5 ✅
- ALL curried form `create<MyState>()((set, get) => ({...}))` ✅
- 7/9 persist correctly avec AsyncStorage via `createJSONStorage` + key + version + partialize + (artKeywordsStore has migrate v1→v2 ✅)
- **chatSessionStore** : PII intentionally NOT persisted (OWASP-MASVS rationale documented inline)
- Zero `useShallow` needed (all selectors atomic — single field or single action ref) → ZERO infinite-loop risk v5 §5 gotcha 6

## ⚠️ INFO opportunities
- **F3 (all 9 stores)** : if future refactor returns `({a,b})` ou `[a,b]` from selector → infinite-loop risk. Document doctrine.
- **F4 (all 9)** : no `devtools` middleware gated on `__DEV__` — DX cost only. Optional `__DEV__ ? devtools(creator, {name}) : creator`.
- **F5** : `conversationsStore.setItems` creates fresh array refs every call → consumers re-render on every setItems/appendItems. Intentional design choice.

## Anti-patterns à éviter
- ❌ Default import `import create from 'zustand'` (v5 BROKEN)
- ❌ Non-curried form `create<MyState>((set) => ({}))` (v5 BROKEN)
- ❌ Selector returning fresh objects/arrays WITHOUT `useShallow` → infinite loop
- ❌ persist sans version + partialize → schema bloat + no migration path

## 2026-05-20 — Re-audit (UFR-022 refresh). Verdict: PASS-with-1-OPEN-TD.

Re-audit of the 9 zustand stores @ pinned `^5.0.12` (installed 5.0.12 ; latest 5.0.13 = devtools-only patch, bump optional/zero-risk). Both 2026-05-18 MINORs are now **FIXED in source** ; one pre-existing tech-debt race remains.

### ✅ TD-ZUS-01 (was F1) RESOLVED
`dataModeStore.ts:41-42` now declares `version: 1` + `partialize: (s) => ({ preference: s.preference })`. Verified by `__tests__/features/settings/dataModeStore.persist.test.ts` (version assert + partialize-narrowing assert + R11 pre-fix unversioned-blob rehydrate). Closed.

### ✅ TD-ZUS-02 (was F2) RESOLVED
`offlinePackChoiceStore.ts:53-57` now declares `version: 1` + `partialize: (s) => ({ choices: s.choices })`. Action fns excluded from disk payload. Closed.

### ⚠️ F1-NEW (carry of TD-14) — `dataModeStore` STILL lacks `_hydrated` + `onRehydrateStorage`
- **The async-rehydration race is still open.** `dataModeStore.ts` got `version`/`partialize` but NOT the `_hydrated` flag nor the `onRehydrateStorage` callback that its 3 sibling settings stores all have (`runtimeSettingsStore.ts:35,74-78`, `audioDescriptionStore.ts:43,57-61`, `userProfileStore.ts:53,91-95`).
- **Impact** : `DataModeProvider.tsx:74-78` reads `preference` via selector and immediately computes `resolved` + calls `setCurrentDataMode(resolved)` in an effect. On cold boot, AsyncStorage hydration is a microtask AFTER `create()`, so the first render uses the in-memory default `'auto'` — a stored `'low'`/`'normal'` is briefly ignored, then self-corrects when rehydration fires a store update. Transient wrong-data-mode window (low-data users momentarily on `normal` → unwanted heavy fetch on a metered/2G boot). Matches TD-14 §"dataModeStore race" exactly.
- **Fix (TD-14 step 2)** : align on the sibling pattern — add `_hydrated: false` to the state + `onRehydrateStorage: () => (state) => { if (state) state._hydrated = true }`, then gate `DataModeProvider`'s `setCurrentDataMode` effect (and any boot consumer) on `useDataModePreferenceStore((s) => s._hydrated)`. Upstream-canonical equivalent: `persist.onFinishHydration()` + `persist.hasHydrated()` (snapshot §persisting-store-data). PATTERNS.md §4 "DO gate boot-time reads".
- **Severity** : LOW-MEDIUM (self-healing, no crash; matters only on metered cold boot). Tracked by TD-14, not a new TD.

### ✅ Positives confirmed (unchanged from 2026-05-18, re-verified)
- ALL 9 stores: named `import { create }` + curried `create<S>()((set,get)=>({}))` v5-correct.
- 8/9 persist via `createJSONStorage(() => storage)` (AsyncStorage wrapper) + `name` + `version` + `partialize`. `artKeywordsStore` has a real v1→v2 `migrate` (returns migrated obj ✅).
- `chatSessionStore` correctly NON-persisted (PII / OWASP-MASVS, rationale inline `:5-33`) — re-hydrated via API on focus.
- ZERO `useShallow` needed (every selector is single-field / single-action ref → no v5 infinite-loop risk). If a future refactor returns `({a,b})`/`[a,b]` from a selector, `useShallow` becomes mandatory.
- `useSessionLoader.ts` closure-cell cancellation (`CancellationTick`) is exemplary; `getState()` post-await fresh-read is intentional, not a stale-closure bug.
- Test discipline solid: `beforeEach` `setState` reset (singleton-leak guard), storage-Map mock, `jest.isolateModules` rehydrate test, `persist.getOptions()` config asserts.

### React 19 / version
- zustand 5 `useSyncExternalStore`-native → React 19 fully compatible, no shims. No CVE/GHSA (`security-advisories` empty). 5.0.13 diff = devtools-only (`v5.0.12...v5.0.13`), safe optional bump.
