# Lessons — react-i18next

Project-specific gotchas (human-edited). Core i18next plural/polyfill/format
findings live in `../i18next/LESSONS.md`. react-i18next 17.0.4 locked (latest 17.0.8).

## 2026-05-20

First dedicated react-i18next lessons (was a stub pointing to the i18next family
file). Promoted to a full PATTERNS.md + LESSONS.md per UFR-022.

- **🟠 R1 HIGH — peer-dep drift (i18next ↔ react-i18next)** — react-i18next
  `latest` 17.0.8 peer-requires `i18next >= 26.2.0`. Project pins i18next
  `^26.0.6` (locked 26.0.6) and react-i18next `^17.0.4` (locked 17.0.4) — both
  `^` ranges drift independently. A fresh `npm install` can resolve
  react-i18next → 17.0.8 against i18next 26.0.6 → **unmet peer dependency**
  (silent until a 17.0.7+ feature like `scopeNs` is hit). Fix: bump the pair
  together (i18next 26.2.0 + react-i18next 17.0.8) or pin exact versions in
  `package.json`. Verify after install: `npm ls i18next react-i18next`.

- **✅ R2 — single `<Trans>` site is correct** —
  `features/auth/ui/GdprConsentCheckbox.tsx:55` uses `components={{terms, privacy}}`
  with markup-tag JSON (`<terms>…</terms>`). AR string keeps the tags
  reorderable (`أوافق على <terms>…</terms> و<privacy>…</privacy>`) — RTL safe.
  Lives inside a `useTranslation()`-driven component → re-renders on lng change.
  Keep this as the reference pattern for any embedded-JSX translation.

- **✅ R3 — `useSuspense:false` is consistent** — set globally in
  `shared/i18n/i18n.ts:33` and per-call in
  `shared/ui/StartupConfigurationErrorScreen.tsx:21`. Safe today because all 8
  locales are bundled statically (`resources`) and (after F7) init is immediate,
  so `ready` is effectively always true. **Trap**: if anyone adds a lazy
  namespace/backend, the global `useSuspense:false` means components will render
  with missing keys instead of suspending — they'd need an explicit `ready` gate.
  Document this before introducing any lazy ns.

- **✅ R4 — `changeLanguage` subscription correct** — `I18nContext.tsx` drives
  `i18n.changeLanguage` + persists via `setOnLanguageChange` callback (shared →
  features decoupling). RTL flips gated by `needsRTLReload` + `Updates.reloadAsync()`.
  Do not mutate `i18n.language` directly anywhere.

- **ℹ️ R5 — React 19 compat is fine** — RN 0.83 ships React 19; react-i18next
  17.x carries the v16.x ref/prop-warning fixes (17.0.4 removed the
  `'i18nIsDynamicList'` DOM-prop warning). No 17.x React 19 regression observed.
