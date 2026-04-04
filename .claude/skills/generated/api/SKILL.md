---
name: api
description: "Skill for the Api area of InnovMind. 11 symbols across 6 files."
---

# Api

11 symbols | 6 files | Cohesion: 100%

## When to Use

- Working with code in `museum-admin/`
- Understanding how setTokens, clearTokens, getAccessToken work
- Modifying api-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-admin/src/api/client.ts` | setTokens, clearTokens, getAccessToken, registerLogoutHandler |
| `museum-admin/src/api/auth.api.ts` | login, getMe |
| `museum-frontend/shared/api/httpRequest.ts` | isFormData, httpRequest |
| `museum-admin/src/auth/AuthContext.tsx` | AuthProvider |
| `museum-admin/src/api/admin.api.ts` | listAuditLogs |
| `museum-admin/src/pages/AuditLogsPage.tsx` | AuditLogsPage |

## Entry Points

Start here when exploring this area:

- **`setTokens`** (Function) — `museum-admin/src/api/client.ts:14`
- **`clearTokens`** (Function) — `museum-admin/src/api/client.ts:19`
- **`getAccessToken`** (Function) — `museum-admin/src/api/client.ts:24`
- **`registerLogoutHandler`** (Function) — `museum-admin/src/api/client.ts:32`
- **`login`** (Function) — `museum-admin/src/api/auth.api.ts:3`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `setTokens` | Function | `museum-admin/src/api/client.ts` | 14 |
| `clearTokens` | Function | `museum-admin/src/api/client.ts` | 19 |
| `getAccessToken` | Function | `museum-admin/src/api/client.ts` | 24 |
| `registerLogoutHandler` | Function | `museum-admin/src/api/client.ts` | 32 |
| `login` | Function | `museum-admin/src/api/auth.api.ts` | 3 |
| `getMe` | Function | `museum-admin/src/api/auth.api.ts` | 21 |
| `AuthProvider` | Function | `museum-admin/src/auth/AuthContext.tsx` | 28 |
| `httpRequest` | Function | `museum-frontend/shared/api/httpRequest.ts` | 27 |
| `listAuditLogs` | Function | `museum-admin/src/api/admin.api.ts` | 31 |
| `AuditLogsPage` | Function | `museum-admin/src/pages/AuditLogsPage.tsx` | 5 |
| `isFormData` | Function | `museum-frontend/shared/api/httpRequest.ts` | 13 |

## How to Explore

1. `gitnexus_context({name: "setTokens"})` — see callers and callees
2. `gitnexus_query({query: "api"})` — find related execution flows
3. Read key files listed above for implementation details
