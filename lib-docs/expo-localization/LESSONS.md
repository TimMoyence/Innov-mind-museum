# expo-localization — LESSONS (Musaium project gotchas)

Human-edited. Agents append a dated section; never rewrite prior dates.

## 2026-05-20

- **Guard `getLocales()[0].languageCode` against `null`.** It is `string | null` (null on Web / unusual device configs). `detectDeviceLanguage` (`shared/i18n/I18nContext.tsx:39-46`) checks `locales.length > 0 && locales[0].languageCode` before mapping, then falls back to `'en'` inside a try/catch. Skipping the null-guard crashes locale detection on edge devices.
- **Musaium does NOT derive RTL from `textDirection`.** `shared/i18n/rtl.ts` hardcodes `RTL_LOCALES = ['ar']` and matches `locale.startsWith('ar')`. Intentional: only one RTL language ships, and a hardcoded list is deterministic + unit-testable (`__tests__/infrastructure/rtl.test.ts`). The upstream-correct signal is `getLocales()[0].textDirection === 'rtl'`; switch to it only if he/fa/ur are added.
- **RTL flip needs a full reload, not a re-render.** `I18nManager.forceRTL` only takes effect after `Updates.reloadAsync()`. `I18nContext.tsx:74-91` gates the reload behind `needsRTLReload(current, next)` so only LTR↔RTL crossings reload; same-direction language switches hot-swap via `i18n.changeLanguage`. In dev/bare workflow `reloadAsync` may be unavailable → falls through to in-place change.
- **Locale change must update i18next AND the HTTP client.** Every language switch calls both `i18n.changeLanguage(lang)` and `setHttpLocale(lang)` (Accept-Language to backend). Updating only one desyncs FE copy from BE-rendered responses.
- **8 supported locales are guardrail-significant.** `SUPPORTED_LOCALES = ['en','fr','es','de','it','ja','zh','ar']` mirrors the 8 locales the LLM07 promptfoo adversarial corpus tests. `toSupportedLocale` narrows any device tag (`'fr-FR'`) to this set; unknown → `'en'`.
- **Prefer `Intl.DateTimeFormat(locale, ...)` over `getCalendars()` field assembly for dates.** Aligns with CLAUDE.md ISO-wire gotcha (BE emits ISO 8601 UTC, FE formats via Intl). Read `timeZone`/`uses24hourClock` from `getCalendars()` only if you need device-calendar nuance the post-visit carnet doesn't yet require.
- **`measurementSystem` / `currencyCode` are `null` on Web** — never rely on them in shared code that also runs in the web admin/landing context.
