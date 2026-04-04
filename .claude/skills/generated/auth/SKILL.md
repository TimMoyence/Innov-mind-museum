---
name: auth
description: "Skill for the Auth area of InnovMind. 22 symbols across 15 files."
---

# Auth

22 symbols | 15 files | Cohesion: 97%

## When to Use

- Working with code in `museum-backend/`
- Understanding how LoginPage, RequireAuth, useAuth work
- Modifying auth-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/tests/unit/auth/authSession.service.test.ts` | makeMockRepos, createService |
| `museum-backend/tests/unit/auth/user-repository.test.ts` | makeMockQb, buildMocks |
| `museum-backend/tests/unit/auth/resetPassword.useCase.test.ts` | makeUser, makeUserRepo |
| `museum-backend/tests/unit/auth/refresh-token-repo.test.ts` | makeMockQb, buildMocks |
| `museum-backend/tests/unit/auth/forgotPassword.useCase.test.ts` | makeUser, makeUserRepo |
| `museum-backend/tests/unit/auth/deleteAccount.useCase.test.ts` | makeUser, makeUserRepo |
| `museum-backend/tests/unit/auth/changeEmail.useCase.test.ts` | makeUser, makeUserRepo |
| `museum-admin/src/pages/LoginPage.tsx` | LoginPage |
| `museum-admin/src/auth/RequireAuth.tsx` | RequireAuth |
| `museum-admin/src/auth/AuthContext.tsx` | useAuth |

## Entry Points

Start here when exploring this area:

- **`LoginPage`** (Function) — `museum-admin/src/pages/LoginPage.tsx:4`
- **`RequireAuth`** (Function) — `museum-admin/src/auth/RequireAuth.tsx:3`
- **`useAuth`** (Function) — `museum-admin/src/auth/AuthContext.tsx:80`
- **`AppLayout`** (Function) — `museum-admin/src/components/layout/AppLayout.tsx:9`
- **`AuthSessionService`** (Class) — `museum-backend/src/modules/auth/core/useCase/authSession.service.ts:111`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AuthSessionService` | Class | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 111 |
| `InMemoryApiKeyRepository` | Class | `museum-backend/tests/helpers/auth/inMemoryApiKeyRepository.ts` | 4 |
| `ApiKeyRepositoryPg` | Class | `museum-backend/src/modules/auth/adapters/secondary/apiKey.repository.pg.ts` | 6 |
| `LoginPage` | Function | `museum-admin/src/pages/LoginPage.tsx` | 4 |
| `RequireAuth` | Function | `museum-admin/src/auth/RequireAuth.tsx` | 3 |
| `useAuth` | Function | `museum-admin/src/auth/AuthContext.tsx` | 80 |
| `AppLayout` | Function | `museum-admin/src/components/layout/AppLayout.tsx` | 9 |
| `ApiKeyRepository` | Interface | `museum-backend/src/modules/auth/core/domain/apiKey.repository.interface.ts` | 3 |
| `makeMockRepos` | Function | `museum-backend/tests/unit/auth/authSession.service.test.ts` | 53 |
| `createService` | Function | `museum-backend/tests/unit/auth/authSession.service.test.ts` | 84 |
| `makeMockQb` | Function | `museum-backend/tests/unit/auth/user-repository.test.ts` | 15 |
| `buildMocks` | Function | `museum-backend/tests/unit/auth/user-repository.test.ts` | 29 |
| `makeUser` | Function | `museum-backend/tests/unit/auth/resetPassword.useCase.test.ts` | 15 |
| `makeUserRepo` | Function | `museum-backend/tests/unit/auth/resetPassword.useCase.test.ts` | 27 |
| `makeMockQb` | Function | `museum-backend/tests/unit/auth/refresh-token-repo.test.ts` | 9 |
| `buildMocks` | Function | `museum-backend/tests/unit/auth/refresh-token-repo.test.ts` | 23 |
| `makeUser` | Function | `museum-backend/tests/unit/auth/forgotPassword.useCase.test.ts` | 5 |
| `makeUserRepo` | Function | `museum-backend/tests/unit/auth/forgotPassword.useCase.test.ts` | 17 |
| `makeUser` | Function | `museum-backend/tests/unit/auth/deleteAccount.useCase.test.ts` | 7 |
| `makeUserRepo` | Function | `museum-backend/tests/unit/auth/deleteAccount.useCase.test.ts` | 19 |

## How to Explore

1. `gitnexus_context({name: "LoginPage"})` — see callers and callees
2. `gitnexus_query({query: "auth"})` — find related execution flows
3. Read key files listed above for implementation details
