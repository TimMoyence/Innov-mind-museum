---
name: analytics
description: "Skill for the Analytics area of InnovMind. 11 symbols across 3 files."
---

# Analytics

11 symbols | 3 files | Cohesion: 81%

## When to Use

- Working with code in `museum-web/`
- Understanding how apiGet, apiPatch, onLogout work
- Modifying analytics-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-web/src/lib/api.ts` | ApiError, processQueue, getBaseUrl, doRefresh, refreshAccessToken (+3) |
| `museum-web/src/app/[locale]/admin/analytics/page.tsx` | AnalyticsPage, fetchAll |
| `museum-frontend/features/settings/application/useSettingsActions.ts` | onLogout |

## Entry Points

Start here when exploring this area:

- **`apiGet`** (Function) — `museum-web/src/lib/api.ts:181`
- **`apiPatch`** (Function) — `museum-web/src/lib/api.ts:189`
- **`onLogout`** (Function) — `museum-frontend/features/settings/application/useSettingsActions.ts:45`
- **`AnalyticsPage`** (Function) — `museum-web/src/app/[locale]/admin/analytics/page.tsx:71`
- **`fetchAll`** (Function) — `museum-web/src/app/[locale]/admin/analytics/page.tsx:92`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ApiError` | Class | `museum-web/src/lib/api.ts` | 11 |
| `apiGet` | Function | `museum-web/src/lib/api.ts` | 181 |
| `apiPatch` | Function | `museum-web/src/lib/api.ts` | 189 |
| `onLogout` | Function | `museum-frontend/features/settings/application/useSettingsActions.ts` | 45 |
| `AnalyticsPage` | Function | `museum-web/src/app/[locale]/admin/analytics/page.tsx` | 71 |
| `fetchAll` | Function | `museum-web/src/app/[locale]/admin/analytics/page.tsx` | 92 |
| `processQueue` | Function | `museum-web/src/lib/api.ts` | 54 |
| `getBaseUrl` | Function | `museum-web/src/lib/api.ts` | 67 |
| `doRefresh` | Function | `museum-web/src/lib/api.ts` | 76 |
| `refreshAccessToken` | Function | `museum-web/src/lib/api.ts` | 93 |
| `request` | Function | `museum-web/src/lib/api.ts` | 118 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AnalyticsPage → GetBaseUrl` | intra_community | 7 |
| `AnalyticsPage → ApiError` | intra_community | 7 |
| `AnalyticsPage → ProcessQueue` | intra_community | 6 |
| `AnalyticsPage → ClearTokens` | cross_community | 6 |
| `AnalyticsPage → OnLogout` | intra_community | 6 |
| `HandleSendReply → GetBaseUrl` | cross_community | 6 |
| `HandleSendReply → ApiError` | cross_community | 6 |
| `HandleSendReply → SetTokens` | cross_community | 6 |
| `FetchAll → SetTokens` | cross_community | 6 |
| `AnalyticsPage → Delete` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_57 | 2 calls |
| Admin | 1 calls |
| Middleware | 1 calls |

## How to Explore

1. `gitnexus_context({name: "apiGet"})` — see callers and callees
2. `gitnexus_query({query: "analytics"})` — find related execution flows
3. Read key files listed above for implementation details
