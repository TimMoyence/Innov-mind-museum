---
name: usecase
description: "Skill for the UseCase area of InnovMind. 44 symbols across 20 files."
---

# UseCase

44 symbols | 20 files | Cohesion: 74%

## When to Use

- Working with code in `museum-backend/`
- Understanding how queryOverpassMuseums, geocodeWithNominatim, tooManyRequests work
- Modifying usecase-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | sha256, resolveMuseumId, sanitizeUser, login, socialLogin (+6) |
| `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | insert, rotate, deleteExpiredTokens, findByJti, revokeByJti (+1) |
| `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts` | haversineDistance, toRad, mergeResults, execute, fetchOsmResults (+1) |
| `museum-backend/src/shared/http/overpass.client.ts` | buildQuery, queryOverpassMuseums |
| `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts` | checkLoginRateLimit, clearLoginAttempts |
| `museum-backend/src/modules/auth/core/domain/user.repository.interface.ts` | getUserById, deleteUser |
| `museum-backend/src/modules/auth/core/useCase/deleteAccount.useCase.ts` | deleteByPrefix, execute |
| `museum-backend/src/modules/auth/core/useCase/tokenCleanup.service.ts` | runCleanup |
| `museum-backend/src/shared/http/nominatim.client.ts` | geocodeWithNominatim |
| `museum-backend/src/shared/errors/app.error.ts` | tooManyRequests |

## Entry Points

Start here when exploring this area:

- **`queryOverpassMuseums`** (Function) — `museum-backend/src/shared/http/overpass.client.ts:111`
- **`geocodeWithNominatim`** (Function) — `museum-backend/src/shared/http/nominatim.client.ts:24`
- **`tooManyRequests`** (Function) — `museum-backend/src/shared/errors/app.error.ts:81`
- **`checkLoginRateLimit`** (Function) — `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts:28`
- **`clearLoginAttempts`** (Function) — `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts:65`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `queryOverpassMuseums` | Function | `museum-backend/src/shared/http/overpass.client.ts` | 111 |
| `geocodeWithNominatim` | Function | `museum-backend/src/shared/http/nominatim.client.ts` | 24 |
| `tooManyRequests` | Function | `museum-backend/src/shared/errors/app.error.ts` | 81 |
| `checkLoginRateLimit` | Function | `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts` | 28 |
| `clearLoginAttempts` | Function | `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts` | 65 |
| `insert` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 34 |
| `rotate` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 52 |
| `deleteExpiredTokens` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 70 |
| `runCleanup` | Method | `museum-backend/src/modules/auth/core/useCase/tokenCleanup.service.ts` | 20 |
| `login` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 128 |
| `socialLogin` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 224 |
| `issueSession` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 308 |
| `execute` | Method | `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts` | 136 |
| `fetchOsmResults` | Method | `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts` | 185 |
| `findByJti` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 42 |
| `revokeByJti` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 62 |
| `revokeFamily` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 87 |
| `refresh` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 172 |
| `logout` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 204 |
| `verifyRefreshToken` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 264 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateSessionRouter → Delete` | cross_community | 7 |
| `CreateRateLimitMiddleware → Delete` | cross_community | 6 |
| `FetchEnrichmentData → Delete` | cross_community | 6 |
| `ListSessions → Delete` | cross_community | 6 |
| `AnalyticsPage → Delete` | cross_community | 5 |
| `CreateApp → Delete` | cross_community | 5 |
| `DailyChatLimit → Delete` | cross_community | 5 |
| `UseMuseumDirectory → Delete` | cross_community | 5 |
| `CommitAssistantResponse → Delete` | cross_community | 5 |
| `Execute → Delete` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Secondary | 4 calls |
| Http | 2 calls |
| Middleware | 1 calls |
| Chat | 1 calls |

## How to Explore

1. `gitnexus_context({name: "queryOverpassMuseums"})` — see callers and callees
2. `gitnexus_query({query: "usecase"})` — find related execution flows
3. Read key files listed above for implementation details
