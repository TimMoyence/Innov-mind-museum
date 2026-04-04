---
name: domain
description: "Skill for the Domain area of InnovMind. 77 symbols across 47 files."
---

# Domain

77 symbols | 47 files | Cohesion: 80%

## When to Use

- Working with code in `museum-backend/`
- Understanding how notFound, ensureSessionOwnership, ensureMessageAccess work
- Modifying domain-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/modules/admin/domain/admin.repository.interface.ts` | resolveReport, listUsers, changeUserRole, countAdmins, IAdminRepository (+4) |
| `museum-frontend/features/chat/domain/contracts.ts` | isRecord, isCreateSessionResponseDTO, isPostMessageResponseDTO, isGetSessionResponseDTO, isDeleteSessionResponseDTO (+2) |
| `museum-backend/src/modules/auth/core/domain/user.repository.interface.ts` | registerUser, setVerificationToken, updatePassword, consumeResetTokenAndUpdatePassword, registerSocialUser |
| `museum-backend/src/modules/museum/core/domain/museum.repository.interface.ts` | update, findById, findBySlug |
| `museum-backend/src/modules/auth/core/domain/apiKey.repository.interface.ts` | remove, findByUserId, save |
| `museum-backend/src/modules/support/domain/support.repository.interface.ts` | getTicketById, addMessage, updateTicket |
| `museum-frontend/features/chat/domain/dashboard-session.ts` | formatSessionTime, truncate, mapSessionToDashboardCard |
| `museum-backend/src/shared/errors/app.error.ts` | notFound, forbidden |
| `museum-backend/src/modules/review/domain/review.repository.interface.ts` | moderateReview, IReviewRepository |
| `museum-backend/src/modules/chat/application/session-access.ts` | ensureSessionOwnership, ensureMessageAccess |

## Entry Points

Start here when exploring this area:

- **`notFound`** (Function) — `museum-backend/src/shared/errors/app.error.ts:38`
- **`ensureSessionOwnership`** (Function) — `museum-backend/src/modules/chat/application/session-access.ts:22`
- **`ensureMessageAccess`** (Function) — `museum-backend/src/modules/chat/application/session-access.ts:69`
- **`isCreateSessionResponseDTO`** (Function) — `museum-frontend/features/chat/domain/contracts.ts:62`
- **`isPostMessageResponseDTO`** (Function) — `museum-frontend/features/chat/domain/contracts.ts:82`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ApiKey` | Class | `museum-backend/src/modules/auth/core/domain/apiKey.entity.ts` | 14 |
| `ReviewRepositoryPg` | Class | `museum-backend/src/modules/review/adapters/secondary/review.repository.pg.ts` | 26 |
| `AdminRepositoryPg` | Class | `museum-backend/src/modules/admin/adapters/secondary/admin.repository.pg.ts` | 89 |
| `notFound` | Function | `museum-backend/src/shared/errors/app.error.ts` | 38 |
| `ensureSessionOwnership` | Function | `museum-backend/src/modules/chat/application/session-access.ts` | 22 |
| `ensureMessageAccess` | Function | `museum-backend/src/modules/chat/application/session-access.ts` | 69 |
| `isCreateSessionResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 62 |
| `isPostMessageResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 82 |
| `isGetSessionResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 114 |
| `isDeleteSessionResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 168 |
| `isReportMessageResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 183 |
| `isListSessionsResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 198 |
| `validateNameField` | Function | `museum-backend/src/shared/validation/input.ts` | 40 |
| `validateEmail` | Function | `museum-backend/src/shared/validation/email.ts` | 6 |
| `forbidden` | Function | `museum-backend/src/shared/errors/app.error.ts` | 67 |
| `validatePassword` | Function | `museum-backend/src/shared/validation/password.ts` | 19 |
| `mapSessionToDashboardCard` | Function | `museum-frontend/features/chat/domain/dashboard-session.ts` | 37 |
| `IReviewRepository` | Interface | `museum-backend/src/modules/review/domain/review.repository.interface.ts` | 9 |
| `IAdminRepository` | Interface | `museum-backend/src/modules/admin/domain/admin.repository.interface.ts` | 19 |
| `execute` | Method | `museum-backend/src/modules/review/useCase/moderateReview.useCase.ts` | 18 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateImageServeHandler → AppError` | cross_community | 6 |
| `CreateImageServeHandler → Get` | cross_community | 6 |
| `CreateMediaRouter → GetMessageById` | cross_community | 5 |
| `CreateMediaRouter → GetMessageById` | cross_community | 5 |
| `CreateImageServeHandler → GetMessageById` | cross_community | 5 |
| `CreateImageServeHandler → GetMessageById` | cross_community | 5 |
| `ReportMessage → AppError` | cross_community | 4 |
| `ReportMessage → Get` | cross_community | 4 |
| `SynthesizeSpeech → AppError` | cross_community | 4 |
| `SynthesizeSpeech → Get` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Http | 13 calls |
| Secondary | 7 calls |
| UseCase | 3 calls |
| Chat | 1 calls |

## How to Explore

1. `gitnexus_context({name: "notFound"})` — see callers and callees
2. `gitnexus_query({query: "domain"})` — find related execution flows
3. Read key files listed above for implementation details
