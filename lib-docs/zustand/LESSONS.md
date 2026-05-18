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
