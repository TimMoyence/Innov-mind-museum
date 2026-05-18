# Lessons — i18next + react-i18next + intl-pluralrules

Audit 2026-05-18 : **🚨 3 AR LAUNCH BLOCKERS** (F1+F2+F3). v26 migration clean (no legacy `interpolation.format` callback).

## 🚨 F1 CRITICAL : `intl-pluralrules` polyfill loaded TOO LATE
- **Cause** : `museum-frontend/shared/i18n/i18n.ts:1 import 'intl-pluralrules';` — but `index.js:1` imports only `'expo-router/entry'`. Polyfill loads when `app/_layout.tsx` evaluates `shared/i18n/i18n.ts` — fine today MAIS ANY future module qui import i18next AVANT _layout.tsx (error-bootstrap, top-level breadcrumbs, devtools shim) → Hermes runtime missing `Intl.PluralRules`.
- **AR HAZARD** : AR is CLDR Category 6 (zero/one/two/few/many/other). Without polyfill, all forms collapse to `_other` silently — looks like translator bug.
- **Fix TD-I18N-01** : Move `import 'intl-pluralrules';` to `museum-frontend/index.js:1` LINE 1 (BEFORE `import 'expo-router/entry'`).

## 🚨 F2 HIGH : Arabic plural keys MISSING (CLDR Category 6 NOT authored)
- **Site** : `museum-frontend/shared/locales/ar/translation.json:1156-1157` — `minutesShort_zero` only (no `_one/_two/_few/_many/_other`), `report_other` only.
- **Symptôme** : even WITH F1 fix, AR output wrong. For count=2 (should be `_two`), count=3 (should be `_few`), count=11 (should be `_many`) → i18next returns base key.
- **Fix TD-I18N-02** : Author AR forms `_one/_two/_few/_many/_other` for `carnet.minutesShort` + `chat.report` BEFORE AR launch. Add ESLint/sentinel : `*_zero` requires `_one/_other` siblings ; AR locale requires all 6.

## 🚨 F3 HIGH : Hand-rolled `_zero` ternary BYPASSES i18next plural resolution
- **Site** : `museum-frontend/app/(stack)/carnet/[sessionId].tsx:160-162` — `detail.durationLabel === '0' ? t('carnet.minutesShort_zero') : t('carnet.minutesShort', {count})`.
- **Cause** : i18next plural resolution is triggered BY `count` variable ; `_zero` automatically selected pour count=0 IF polyfill loaded AND JSON v4 plural wired. Hand-rolling masked F1 bug pour EN/FR (collapse naturally) BUT bypasses entire mechanism pour AR.
- **Fix TD-I18N-03** : Call `t('carnet.minutesShort', { count: Number(detail.durationLabel) })` unconditionally. Requires F1 fix first.

## ⚠️ F4 MEDIUM : Pre-formatted dates interpolated as opaque strings
- **Site** : `museum-frontend/features/settings/ui/SettingsAiConsentCard.tsx:78,82,147`.
- **Problème** : (a) translators can't reorder date vs surrounding text (RTL/AR critical), (b) duplicates `Intl.DateTimeFormat` allocation, (c) `useMemo` keys on nothing → never re-allocate when `i18n.language` change.
- **Fix TD-I18N-04** : Use v26 built-in formatter — JSON `"Granted on {{date, datetime(dateStyle: medium)}}"` + site `t('settings.ai_consent_granted_on', { date: new Date(row.grantedAt) })`. Drop `useMemo` formatter ladder.

## ⚠️ F5 MEDIUM : `i18n.init` missing `supportedLngs`
- **Cause** : only `fallbackLng: 'en'` declared. `SupportedLocale` enum exists dans `shared/config/supportedLocales.ts` but NOT passed to i18next — i18next happily attempt to load any locale `changeLanguage()` is called with.
- **Fix TD-I18N-05** : add `supportedLngs: SUPPORTED_LOCALES` (DRY import) + `defaultNS: 'translation'` + `ns: ['translation']` explicit.

## ⚠️ F7 LOW : i18n init never `await`-ed
- Static `resources: {...}` makes gap microseconds (no backend fetch) — safe en pratique mais tests/cold-start race exists. Fix : `initImmediate: false` (1 line).

## ✅ Positives
- v26 migration clean (zero `interpolation.format` callback usage)
- TypeScript declaration merging present (`CustomTypeOptions { defaultNS: 'translation'; resources: ... }`)
- `<Trans>` correctly used at single site `GdprConsentCheckbox.tsx:55` with `components={{terms, privacy}}`
- `changeLanguage` re-render via react-i18next subscription confirmed correct
- RTL transition uses `Updates.reloadAsync()` (mandatory pour `I18nManager.forceRTL`)
- No `keyPrefix` + `ns:key` anti-pattern

## Recommended fix order
1. **F1** (move polyfill to index.js:1) — 1 line, unlocks F2/F3
2. **F3** (drop ternary, single t() call) — 3 lines
3. **F2** (author AR plural forms) — translator task, BLOCKS AR launch
4. **F5** (supportedLngs + defaultNS) — 5 lines
5. **F4** (built-in datetime formatter) — generalize before more dates
6. **F7** (initImmediate: false) — 1 line
