---
name: context
description: "Skill for the Context area of InnovMind. 13 symbols across 5 files."
---

# Context

13 symbols | 5 files | Cohesion: 91%

## When to Use

- Working with code in `museum-frontend/`
- Understanding how extractUserIdFromToken, AuthProvider, checkAuth work
- Modifying context-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-frontend/context/AuthContext.tsx` | identifySentryUser, AuthProvider, checkAuth, logout, checkTokenValidity |
| `museum-frontend/features/auth/infrastructure/authTokenStore.ts` | getRefreshToken, setRefreshToken, clearRefreshToken |
| `museum-frontend/features/auth/infrastructure/authApi.ts` | refresh, completeOnboarding, deleteAccount |
| `museum-frontend/context/authLogic.pure.ts` | extractUserIdFromToken |
| `museum-frontend/features/settings/application/useSettingsActions.ts` | onDeleteAccount |

## Entry Points

Start here when exploring this area:

- **`extractUserIdFromToken`** (Function) — `museum-frontend/context/authLogic.pure.ts:6`
- **`AuthProvider`** (Function) — `museum-frontend/context/AuthContext.tsx:72`
- **`checkAuth`** (Function) — `museum-frontend/context/AuthContext.tsx:93`
- **`logout`** (Function) — `museum-frontend/context/AuthContext.tsx:181`
- **`checkTokenValidity`** (Function) — `museum-frontend/context/AuthContext.tsx:203`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `extractUserIdFromToken` | Function | `museum-frontend/context/authLogic.pure.ts` | 6 |
| `AuthProvider` | Function | `museum-frontend/context/AuthContext.tsx` | 72 |
| `checkAuth` | Function | `museum-frontend/context/AuthContext.tsx` | 93 |
| `logout` | Function | `museum-frontend/context/AuthContext.tsx` | 181 |
| `checkTokenValidity` | Function | `museum-frontend/context/AuthContext.tsx` | 203 |
| `onDeleteAccount` | Function | `museum-frontend/features/settings/application/useSettingsActions.ts` | 58 |
| `getRefreshToken` | Method | `museum-frontend/features/auth/infrastructure/authTokenStore.ts` | 78 |
| `setRefreshToken` | Method | `museum-frontend/features/auth/infrastructure/authTokenStore.ts` | 85 |
| `clearRefreshToken` | Method | `museum-frontend/features/auth/infrastructure/authTokenStore.ts` | 89 |
| `refresh` | Method | `museum-frontend/features/auth/infrastructure/authApi.ts` | 55 |
| `completeOnboarding` | Method | `museum-frontend/features/auth/infrastructure/authApi.ts` | 108 |
| `deleteAccount` | Method | `museum-frontend/features/auth/infrastructure/authApi.ts` | 116 |
| `identifySentryUser` | Function | `museum-frontend/context/AuthContext.tsx` | 21 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AuthProvider → GetItem` | cross_community | 5 |
| `AuthProvider → SetItem` | cross_community | 5 |
| `AuthProvider → ExtractUserIdFromToken` | intra_community | 4 |
| `CheckTokenValidity → GetItem` | cross_community | 4 |
| `CheckTokenValidity → SetItem` | cross_community | 4 |
| `OnDeleteAccount → RemoveItem` | cross_community | 4 |
| `Logout → GetItem` | cross_community | 4 |
| `Logout → RemoveItem` | cross_community | 4 |
| `AuthProvider → Refresh` | intra_community | 3 |
| `CheckTokenValidity → ExtractUserIdFromToken` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Infrastructure | 2 calls |
| App | 1 calls |
| Secondary | 1 calls |

## How to Explore

1. `gitnexus_context({name: "extractUserIdFromToken"})` — see callers and callees
2. `gitnexus_query({query: "context"})` — find related execution flows
3. Read key files listed above for implementation details
