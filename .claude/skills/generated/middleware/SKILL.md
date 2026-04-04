---
name: middleware
description: "Skill for the Middleware area of InnovMind. 32 symbols across 17 files."
---

# Middleware

32 symbols | 17 files | Cohesion: 70%

## When to Use

- Working with code in `museum-backend/`
- Understanding how validateApiKey, openApiRequest, createRateLimitMiddleware work
- Modifying middleware-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts` | clearDailyChatLimitBuckets, todayStr, secondsUntilMidnightUtc, checkInMemory, dailyChatLimit |
| `museum-backend/src/helpers/middleware/apiKey.middleware.ts` | checkApiKeyValidity, verifyTokenHash, validateApiKey |
| `museum-backend/src/helpers/middleware/redis-rate-limit-store.ts` | increment, incrementFallback, clear |
| `museum-backend/tests/helpers/auth/inMemoryApiKeyRepository.ts` | findByPrefix, updateLastUsed |
| `museum-backend/src/modules/auth/adapters/secondary/apiKey.repository.pg.ts` | findByPrefix, updateLastUsed |
| `museum-backend/src/modules/auth/core/domain/apiKey.repository.interface.ts` | findByPrefix, updateLastUsed |
| `museum-frontend/shared/api/openapiClient.ts` | appendQuery, openApiRequest |
| `museum-backend/src/shared/rate-limit/in-memory-bucket-store.ts` | set, clear |
| `museum-backend/src/helpers/middleware/rate-limit.middleware.ts` | createRateLimitMiddleware, clearRateLimitBuckets |
| `museum-backend/src/modules/museum/adapters/primary/http/museum.route.ts` | buildHandleSearch, createMuseumRouter |

## Entry Points

Start here when exploring this area:

- **`validateApiKey`** (Function) — `museum-backend/src/helpers/middleware/apiKey.middleware.ts:68`
- **`openApiRequest`** (Function) — `museum-frontend/shared/api/openapiClient.ts:118`
- **`createRateLimitMiddleware`** (Function) — `museum-backend/src/helpers/middleware/rate-limit.middleware.ts:47`
- **`validateQuery`** (Function) — `museum-backend/src/helpers/middleware/validate-query.middleware.ts:13`
- **`validateBody`** (Function) — `museum-backend/src/helpers/middleware/validate-body.middleware.ts:11`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `SearchMuseumsUseCase` | Class | `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts` | 129 |
| `validateApiKey` | Function | `museum-backend/src/helpers/middleware/apiKey.middleware.ts` | 68 |
| `openApiRequest` | Function | `museum-frontend/shared/api/openapiClient.ts` | 118 |
| `createRateLimitMiddleware` | Function | `museum-backend/src/helpers/middleware/rate-limit.middleware.ts` | 47 |
| `validateQuery` | Function | `museum-backend/src/helpers/middleware/validate-query.middleware.ts` | 13 |
| `validateBody` | Function | `museum-backend/src/helpers/middleware/validate-body.middleware.ts` | 11 |
| `buildSearchMuseumsUseCase` | Function | `museum-backend/src/modules/museum/core/useCase/index.ts` | 23 |
| `createMuseumRouter` | Function | `museum-backend/src/modules/museum/adapters/primary/http/museum.route.ts` | 164 |
| `clearRateLimitBuckets` | Function | `museum-backend/src/helpers/middleware/rate-limit.middleware.ts` | 152 |
| `clearDailyChatLimitBuckets` | Function | `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts` | 144 |
| `_resetAllAttempts` | Function | `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts` | 70 |
| `dailyChatLimit` | Function | `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts` | 92 |
| `findByPrefix` | Method | `museum-backend/tests/helpers/auth/inMemoryApiKeyRepository.ts` | 8 |
| `updateLastUsed` | Method | `museum-backend/tests/helpers/auth/inMemoryApiKeyRepository.ts` | 32 |
| `findByPrefix` | Method | `museum-backend/src/modules/auth/adapters/secondary/apiKey.repository.pg.ts` | 14 |
| `updateLastUsed` | Method | `museum-backend/src/modules/auth/adapters/secondary/apiKey.repository.pg.ts` | 50 |
| `findByPrefix` | Method | `museum-backend/src/modules/auth/core/domain/apiKey.repository.interface.ts` | 5 |
| `updateLastUsed` | Method | `museum-backend/src/modules/auth/core/domain/apiKey.repository.interface.ts` | 17 |
| `set` | Method | `museum-backend/src/shared/rate-limit/in-memory-bucket-store.ts` | 36 |
| `constructor` | Method | `museum-backend/src/shared/feature-flags/feature-flags.port.ts` | 12 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateSessionRouter → Delete` | cross_community | 7 |
| `CreateRateLimitMiddleware → Delete` | cross_community | 6 |
| `CreateRateLimitMiddleware → StopSweep` | cross_community | 6 |
| `FetchEnrichmentData → Delete` | cross_community | 6 |
| `ListSessions → Delete` | cross_community | 6 |
| `ListSessions → StopSweep` | cross_community | 6 |
| `AnalyticsPage → Delete` | cross_community | 5 |
| `AnalyticsPage → StopSweep` | cross_community | 5 |
| `CreateApp → Delete` | cross_community | 5 |
| `CreateApp → StopSweep` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Chat | 3 calls |
| Http | 3 calls |
| UseCase | 2 calls |
| Rate-limit | 2 calls |
| Secondary | 2 calls |

## How to Explore

1. `gitnexus_context({name: "validateApiKey"})` — see callers and callees
2. `gitnexus_query({query: "middleware"})` — find related execution flows
3. Read key files listed above for implementation details
