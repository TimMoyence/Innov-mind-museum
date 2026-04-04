---
name: middleware
description: "Skill for the Middleware area of InnovMind. 60 symbols across 29 files."
---

# Middleware

60 symbols | 29 files | Cohesion: 76%

## When to Use

- Working with code in `museum-backend/`
- Understanding how middleware, openApiRequest, tooManyRequests work
- Modifying middleware-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts` | todayStr, secondsUntilMidnightUtc, checkInMemory, dailyChatLimit, clearDailyChatLimitBuckets |
| `museum-backend/src/modules/chat/infrastructure/chat.repository.typeorm.ts` | listSessionMessages, fetchMessageCounts, fetchMessagePreviews, listSessions, exportUserData |
| `museum-backend/src/helpers/middleware/apiKey.middleware.ts` | sendUnauthorized, checkApiKeyValidity, verifyTokenHash, validateApiKey |
| `museum-web/src/middleware.ts` | getPreferredLocale, pathnameHasLocale, middleware |
| `museum-backend/src/shared/rate-limit/in-memory-bucket-store.ts` | get, set, clear |
| `museum-backend/src/helpers/middleware/redis-rate-limit-store.ts` | increment, incrementFallback, clear |
| `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts` | isRetryableError, assembleResponse, generate |
| `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts` | checkLoginRateLimit, recordFailedLogin, _resetAllAttempts |
| `museum-frontend/shared/api/openapiClient.ts` | appendQuery, openApiRequest |
| `museum-backend/tests/helpers/chat/chatTestApp.ts` | persistMessageReport, exportUserData |

## Entry Points

Start here when exploring this area:

- **`middleware`** (Function) — `museum-web/src/middleware.ts:21`
- **`openApiRequest`** (Function) — `museum-frontend/shared/api/openapiClient.ts:118`
- **`tooManyRequests`** (Function) — `museum-backend/src/shared/errors/app.error.ts:81`
- **`createRateLimitMiddleware`** (Function) — `museum-backend/src/helpers/middleware/rate-limit.middleware.ts:47`
- **`dailyChatLimit`** (Function) — `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts:92`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `SearchMuseumsUseCase` | Class | `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts` | 129 |
| `middleware` | Function | `museum-web/src/middleware.ts` | 21 |
| `openApiRequest` | Function | `museum-frontend/shared/api/openapiClient.ts` | 118 |
| `tooManyRequests` | Function | `museum-backend/src/shared/errors/app.error.ts` | 81 |
| `createRateLimitMiddleware` | Function | `museum-backend/src/helpers/middleware/rate-limit.middleware.ts` | 47 |
| `dailyChatLimit` | Function | `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts` | 92 |
| `checkLoginRateLimit` | Function | `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts` | 28 |
| `recordFailedLogin` | Function | `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts` | 48 |
| `resolveRequestBaseUrl` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat-route.helpers.ts` | 149 |
| `validateApiKey` | Function | `museum-backend/src/helpers/middleware/apiKey.middleware.ts` | 68 |
| `validateQuery` | Function | `museum-backend/src/helpers/middleware/validate-query.middleware.ts` | 13 |
| `validateBody` | Function | `museum-backend/src/helpers/middleware/validate-body.middleware.ts` | 11 |
| `requireRole` | Function | `museum-backend/src/helpers/middleware/require-role.middleware.ts` | 10 |
| `buildSearchMuseumsUseCase` | Function | `museum-backend/src/modules/museum/core/useCase/index.ts` | 23 |
| `createMuseumRouter` | Function | `museum-backend/src/modules/museum/adapters/primary/http/museum.route.ts` | 164 |
| `clearRateLimitBuckets` | Function | `museum-backend/src/helpers/middleware/rate-limit.middleware.ts` | 152 |
| `clearDailyChatLimitBuckets` | Function | `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts` | 144 |
| `_resetAllAttempts` | Function | `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts` | 70 |
| `get` | Method | `museum-backend/src/shared/rate-limit/in-memory-bucket-store.ts` | 31 |
| `set` | Method | `museum-backend/src/shared/rate-limit/in-memory-bucket-store.ts` | 36 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateSessionRouter → Delete` | cross_community | 7 |
| `CreatePostMessageHandler → Get` | cross_community | 7 |
| `CreateRateLimitMiddleware → Delete` | cross_community | 6 |
| `CreateRateLimitMiddleware → StopSweep` | cross_community | 6 |
| `FetchEnrichmentData → Delete` | cross_community | 6 |
| `CreateAudioHandler → Get` | cross_community | 6 |
| `CreateImageServeHandler → Get` | cross_community | 6 |
| `ListSessions → Delete` | cross_community | 6 |
| `ListSessions → StopSweep` | cross_community | 6 |
| `AnalyticsPage → Delete` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Secondary | 5 calls |
| Http | 5 calls |
| Chat | 2 calls |
| Rate-limit | 2 calls |
| Application | 1 calls |

## How to Explore

1. `gitnexus_context({name: "middleware"})` — see callers and callees
2. `gitnexus_query({query: "middleware"})` — find related execution flows
3. Read key files listed above for implementation details
