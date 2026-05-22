# intl-pluralrules — Musaium Lessons

## 2026-05-20

Promoted from family-collapse stub (pointed at `i18next/PATTERNS.md`) to dedicated docs.

- **Polyfill is NOT removable on RN 0.83 — verified, do not bury (UFR-016 N/A).** Hermes ships native `Intl.Collator`/`NumberFormat`/`DateTimeFormat` but NOT `Intl.PluralRules` (confirmed against Hermes `IntlAPIs.md` + 2026 ecosystem guidance). i18next pluralization depends on the global `Intl.PluralRules`; remove the polyfill and EN/FR look fine while Arabic (6 categories) / Slavic-style locales silently mis-pluralize — invisible in primary-locale smoke. Re-evaluate only when a Hermes release explicitly lists native PluralRules + the 8 locales verify.
- **Import order is load-bearing.** `import 'intl-pluralrules'` is line 1 of `shared/i18n/i18n.ts`, before `import i18n from 'i18next'`. It's a bare side-effect import that patches the global; i18next reads `Intl.PluralRules` at `.init()`. If an import sorter moves it below i18next, the resolver builds against the unpatched (missing) global → wrong plurals. Keep it pinned at top.
- **This is `eemeli/intl-pluralrules`, NOT `@formatjs/intl-pluralrules`.** Web advice to use `/polyfill-force` is FormatJS-specific and does not apply — the eemeli bare import is the correct (and conditional/no-op-if-present) entry.
- **Version**: `^2.0.1`, latest `2.0.1` (2023-07-06). Zero drift, stable. v1→v2 dropped IE11 + added `selectRange`; irrelevant to `^2`. Nothing to bump.
- **Date/number formatting uses native Intl, not this polyfill.** `Intl.DateTimeFormat` (dates) is Hermes-native and used directly (`SettingsAiConsentCard.tsx`, `QuotaUpsellModal.tsx`). This package's scope is plural selection ONLY.
