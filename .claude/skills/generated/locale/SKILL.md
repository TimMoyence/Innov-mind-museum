---
name: locale
description: "Skill for the [locale] area of InnovMind. 11 symbols across 8 files."
---

# [locale]

11 symbols | 8 files | Cohesion: 100%

## When to Use

- Working with code in `museum-web/`
- Understanding how getPrivacyContent, getDictionary, generateMetadata work
- Modifying [locale]-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-web/src/app/[locale]/page.tsx` | generateMetadata, LandingPage |
| `museum-web/src/app/[locale]/support/page.tsx` | generateMetadata, SupportPage |
| `museum-web/src/app/[locale]/privacy/page.tsx` | generateMetadata, PrivacyPage |
| `museum-web/src/lib/privacy-content.ts` | getPrivacyContent |
| `museum-web/src/lib/i18n.ts` | getDictionary |
| `museum-web/src/app/[locale]/layout.tsx` | LocaleLayout |
| `museum-web/src/app/[locale]/reset-password/page.tsx` | ResetPasswordPage |
| `museum-web/src/app/[locale]/admin/layout.tsx` | AdminLayout |

## Entry Points

Start here when exploring this area:

- **`getPrivacyContent`** (Function) — `museum-web/src/lib/privacy-content.ts:234`
- **`getDictionary`** (Function) — `museum-web/src/lib/i18n.ts:10`
- **`generateMetadata`** (Function) — `museum-web/src/app/[locale]/page.tsx:14`
- **`LandingPage`** (Function) — `museum-web/src/app/[locale]/page.tsx:165`
- **`LocaleLayout`** (Function) — `museum-web/src/app/[locale]/layout.tsx:10`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getPrivacyContent` | Function | `museum-web/src/lib/privacy-content.ts` | 234 |
| `getDictionary` | Function | `museum-web/src/lib/i18n.ts` | 10 |
| `generateMetadata` | Function | `museum-web/src/app/[locale]/page.tsx` | 14 |
| `LandingPage` | Function | `museum-web/src/app/[locale]/page.tsx` | 165 |
| `LocaleLayout` | Function | `museum-web/src/app/[locale]/layout.tsx` | 10 |
| `generateMetadata` | Function | `museum-web/src/app/[locale]/support/page.tsx` | 8 |
| `SupportPage` | Function | `museum-web/src/app/[locale]/support/page.tsx` | 14 |
| `ResetPasswordPage` | Function | `museum-web/src/app/[locale]/reset-password/page.tsx` | 7 |
| `generateMetadata` | Function | `museum-web/src/app/[locale]/privacy/page.tsx` | 8 |
| `PrivacyPage` | Function | `museum-web/src/app/[locale]/privacy/page.tsx` | 14 |
| `AdminLayout` | Function | `museum-web/src/app/[locale]/admin/layout.tsx` | 9 |

## How to Explore

1. `gitnexus_context({name: "getPrivacyContent"})` — see callers and callees
2. `gitnexus_query({query: "[locale]"})` — find related execution flows
3. Read key files listed above for implementation details
