---
name: i18n
description: "Skill for the I18n area of InnovMind. 16 symbols across 8 files."
---

# I18n

16 symbols | 8 files | Cohesion: 86%

## When to Use

- Working with code in `museum-backend/`
- Understanding how isRTLLocale, applyRTLLayout, needsRTLReload work
- Modifying i18n-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/shared/i18n/locale.ts` | isSupportedLocale, extractLangCode, resolveLocale, parseAcceptLanguageHeader |
| `museum-frontend/shared/i18n/rtl.ts` | isRTLLocale, applyRTLLayout, needsRTLReload |
| `museum-frontend/shared/config/supportedLocales.ts` | isSupportedLocale, toSupportedLocale |
| `museum-frontend/shared/i18n/I18nContext.tsx` | detectDeviceLanguage, I18nProvider |
| `museum-backend/src/modules/chat/application/llm-sections.ts` | lastNonEmptyTexts, createSummaryFallback |
| `museum-backend/src/shared/i18n/fallback-messages.ts` | buildLocalizedFallback |
| `museum-backend/src/modules/chat/application/chat-message.service.ts` | buildCommitPayload |
| `museum-backend/src/helpers/middleware/accept-language.middleware.ts` | acceptLanguageMiddleware |

## Entry Points

Start here when exploring this area:

- **`isRTLLocale`** (Function) — `museum-frontend/shared/i18n/rtl.ts:4`
- **`applyRTLLayout`** (Function) — `museum-frontend/shared/i18n/rtl.ts:8`
- **`needsRTLReload`** (Function) — `museum-frontend/shared/i18n/rtl.ts:16`
- **`isSupportedLocale`** (Function) — `museum-frontend/shared/config/supportedLocales.ts:20`
- **`toSupportedLocale`** (Function) — `museum-frontend/shared/config/supportedLocales.ts:28`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isRTLLocale` | Function | `museum-frontend/shared/i18n/rtl.ts` | 4 |
| `applyRTLLayout` | Function | `museum-frontend/shared/i18n/rtl.ts` | 8 |
| `needsRTLReload` | Function | `museum-frontend/shared/i18n/rtl.ts` | 16 |
| `isSupportedLocale` | Function | `museum-frontend/shared/config/supportedLocales.ts` | 20 |
| `toSupportedLocale` | Function | `museum-frontend/shared/config/supportedLocales.ts` | 28 |
| `I18nProvider` | Function | `museum-frontend/shared/i18n/I18nContext.tsx` | 48 |
| `isSupportedLocale` | Function | `museum-backend/src/shared/i18n/locale.ts` | 15 |
| `extractLangCode` | Function | `museum-backend/src/shared/i18n/locale.ts` | 22 |
| `resolveLocale` | Function | `museum-backend/src/shared/i18n/locale.ts` | 31 |
| `buildLocalizedFallback` | Function | `museum-backend/src/shared/i18n/fallback-messages.ts` | 75 |
| `createSummaryFallback` | Function | `museum-backend/src/modules/chat/application/llm-sections.ts` | 143 |
| `parseAcceptLanguageHeader` | Function | `museum-backend/src/shared/i18n/locale.ts` | 51 |
| `acceptLanguageMiddleware` | Function | `museum-backend/src/helpers/middleware/accept-language.middleware.ts` | 17 |
| `buildCommitPayload` | Method | `museum-backend/src/modules/chat/application/chat-message.service.ts` | 281 |
| `detectDeviceLanguage` | Function | `museum-frontend/shared/i18n/I18nContext.tsx` | 36 |
| `lastNonEmptyTexts` | Function | `museum-backend/src/modules/chat/application/llm-sections.ts` | 129 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Push → ExtractLangCode` | cross_community | 6 |
| `Push → IsSupportedLocale` | cross_community | 6 |
| `I18nProvider → IsSupportedLocale` | intra_community | 4 |
| `CommitAssistantResponse → ExtractLangCode` | cross_community | 4 |
| `CommitAssistantResponse → IsSupportedLocale` | cross_community | 4 |
| `I18nProvider → IsRTLLocale` | intra_community | 3 |
| `CreateSummaryFallback → ExtractLangCode` | intra_community | 3 |
| `CreateSummaryFallback → IsSupportedLocale` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Infrastructure | 1 calls |

## How to Explore

1. `gitnexus_context({name: "isRTLLocale"})` — see callers and callees
2. `gitnexus_query({query: "i18n"})` — find related execution flows
3. Read key files listed above for implementation details
