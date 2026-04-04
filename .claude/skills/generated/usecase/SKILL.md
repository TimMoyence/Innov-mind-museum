---
name: usecase
description: "Skill for the UseCase area of InnovMind. 58 symbols across 29 files."
---

# UseCase

58 symbols | 29 files | Cohesion: 80%

## When to Use

- Working with code in `museum-backend/`
- Understanding how queryOverpassMuseums, geocodeWithNominatim, forbidden work
- Modifying usecase-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | unauthorized, refresh, logout, verifyRefreshToken, assertRefreshTokenUsable (+6) |
| `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts` | haversineDistance, toRad, mergeResults, execute, fetchOsmResults (+1) |
| `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | findByJti, revokeByJti, revokeFamily, deleteExpiredTokens, insert (+1) |
| `museum-backend/src/modules/admin/domain/admin.repository.interface.ts` | getUsageAnalytics, getStats, getEngagementAnalytics, getContentAnalytics |
| `museum-backend/src/modules/support/domain/support.repository.interface.ts` | getTicketById, addMessage, updateTicket |
| `museum-backend/src/shared/http/overpass.client.ts` | buildQuery, queryOverpassMuseums |
| `museum-backend/src/modules/auth/core/useCase/tokenCleanup.service.ts` | runCleanup, startScheduler |
| `museum-backend/src/modules/auth/core/useCase/deleteAccount.useCase.ts` | deleteByPrefix, execute |
| `museum-backend/src/modules/auth/core/domain/user.repository.interface.ts` | getUserById, deleteUser |
| `museum-backend/src/shared/http/nominatim.client.ts` | geocodeWithNominatim |

## Entry Points

Start here when exploring this area:

- **`queryOverpassMuseums`** (Function) — `museum-backend/src/shared/http/overpass.client.ts:111`
- **`geocodeWithNominatim`** (Function) — `museum-backend/src/shared/http/nominatim.client.ts:24`
- **`forbidden`** (Function) — `museum-backend/src/shared/errors/app.error.ts:67`
- **`execute`** (Method) — `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts:136`
- **`fetchOsmResults`** (Method) — `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts:185`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `queryOverpassMuseums` | Function | `museum-backend/src/shared/http/overpass.client.ts` | 111 |
| `geocodeWithNominatim` | Function | `museum-backend/src/shared/http/nominatim.client.ts` | 24 |
| `forbidden` | Function | `museum-backend/src/shared/errors/app.error.ts` | 67 |
| `execute` | Method | `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts` | 136 |
| `fetchOsmResults` | Method | `museum-backend/src/modules/museum/core/useCase/searchMuseums.useCase.ts` | 185 |
| `refresh` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 172 |
| `logout` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 204 |
| `verifyRefreshToken` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 264 |
| `assertRefreshTokenUsable` | Method | `museum-backend/src/modules/auth/core/useCase/authSession.service.ts` | 287 |
| `findByJti` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 42 |
| `revokeByJti` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 62 |
| `revokeFamily` | Method | `museum-backend/src/modules/auth/core/domain/refresh-token.repository.interface.ts` | 87 |
| `execute` | Method | `museum-backend/src/modules/support/useCase/updateTicketStatus.useCase.ts` | 24 |
| `execute` | Method | `museum-backend/src/modules/support/useCase/getTicketDetail.useCase.ts` | 17 |
| `execute` | Method | `museum-backend/src/modules/support/useCase/addTicketMessage.useCase.ts` | 18 |
| `getTicketById` | Method | `museum-backend/src/modules/support/domain/support.repository.interface.ts` | 20 |
| `addMessage` | Method | `museum-backend/src/modules/support/domain/support.repository.interface.ts` | 23 |
| `updateTicket` | Method | `museum-backend/src/modules/support/domain/support.repository.interface.ts` | 26 |
| `runCleanup` | Method | `museum-backend/src/modules/auth/core/useCase/tokenCleanup.service.ts` | 20 |
| `startScheduler` | Method | `museum-backend/src/modules/auth/core/useCase/tokenCleanup.service.ts` | 42 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Execute → Delete` | cross_community | 5 |
| `Execute → StopSweep` | cross_community | 5 |
| `UseAudioRecorder → DeleteExpiredTokens` | cross_community | 5 |
| `DailyArtCard → DeleteExpiredTokens` | cross_community | 5 |
| `Refresh → AppError` | cross_community | 4 |
| `Execute → BuildQuery` | intra_community | 4 |
| `Execute → ToRad` | intra_community | 4 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → FindAll` | cross_community | 3 |
| `Execute → FindAll` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Secondary | 4 calls |
| Http | 4 calls |
| Domain | 3 calls |
| Middleware | 1 calls |

## How to Explore

1. `gitnexus_context({name: "queryOverpassMuseums"})` — see callers and callees
2. `gitnexus_query({query: "usecase"})` — find related execution flows
3. Read key files listed above for implementation details
