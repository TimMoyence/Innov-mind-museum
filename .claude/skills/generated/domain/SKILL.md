---
name: domain
description: "Skill for the Domain area of InnovMind. 61 symbols across 36 files."
---

# Domain

61 symbols | 36 files | Cohesion: 80%

## When to Use

- Working with code in `museum-backend/`
- Understanding how notFound, isCreateSessionResponseDTO, isPostMessageResponseDTO work
- Modifying domain-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-frontend/features/chat/domain/contracts.ts` | isRecord, isCreateSessionResponseDTO, isPostMessageResponseDTO, isGetSessionResponseDTO, isDeleteSessionResponseDTO (+2) |
| `museum-backend/src/modules/auth/core/domain/user.repository.interface.ts` | registerUser, setVerificationToken, updatePassword, consumeResetTokenAndUpdatePassword, registerSocialUser (+1) |
| `museum-backend/src/modules/admin/domain/admin.repository.interface.ts` | resolveReport, listUsers, changeUserRole, countAdmins, IAdminRepository |
| `museum-backend/src/modules/museum/core/domain/museum.repository.interface.ts` | update, findById, findBySlug |
| `museum-backend/src/modules/auth/core/domain/apiKey.repository.interface.ts` | remove, findByUserId, save |
| `museum-backend/src/modules/auth/core/domain/socialAccount.repository.interface.ts` | findByProviderAndProviderUserId, create, ISocialAccountRepository |
| `museum-frontend/features/chat/domain/dashboard-session.ts` | formatSessionTime, truncate, mapSessionToDashboardCard |
| `museum-backend/src/modules/review/domain/review.repository.interface.ts` | moderateReview, IReviewRepository |
| `museum-backend/src/modules/auth/core/domain/social-token-verifier.port.ts` | verify, SocialTokenVerifier |
| `museum-backend/src/shared/errors/app.error.ts` | notFound |

## Entry Points

Start here when exploring this area:

- **`notFound`** (Function) — `museum-backend/src/shared/errors/app.error.ts:38`
- **`isCreateSessionResponseDTO`** (Function) — `museum-frontend/features/chat/domain/contracts.ts:62`
- **`isPostMessageResponseDTO`** (Function) — `museum-frontend/features/chat/domain/contracts.ts:82`
- **`isGetSessionResponseDTO`** (Function) — `museum-frontend/features/chat/domain/contracts.ts:114`
- **`isDeleteSessionResponseDTO`** (Function) — `museum-frontend/features/chat/domain/contracts.ts:168`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ApiKey` | Class | `museum-backend/src/modules/auth/core/domain/apiKey.entity.ts` | 14 |
| `ReviewRepositoryPg` | Class | `museum-backend/src/modules/review/adapters/secondary/review.repository.pg.ts` | 26 |
| `AdminRepositoryPg` | Class | `museum-backend/src/modules/admin/adapters/secondary/admin.repository.pg.ts` | 89 |
| `UserRepositoryPg` | Class | `museum-backend/src/modules/auth/adapters/secondary/user.repository.pg.ts` | 11 |
| `SocialAccountRepositoryPg` | Class | `museum-backend/src/modules/auth/adapters/secondary/social-account.repository.pg.ts` | 21 |
| `SocialTokenVerifierAdapter` | Class | `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.adapter.ts` | 12 |
| `notFound` | Function | `museum-backend/src/shared/errors/app.error.ts` | 38 |
| `isCreateSessionResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 62 |
| `isPostMessageResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 82 |
| `isGetSessionResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 114 |
| `isDeleteSessionResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 168 |
| `isReportMessageResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 183 |
| `isListSessionsResponseDTO` | Function | `museum-frontend/features/chat/domain/contracts.ts` | 198 |
| `validateNameField` | Function | `museum-backend/src/shared/validation/input.ts` | 40 |
| `validateEmail` | Function | `museum-backend/src/shared/validation/email.ts` | 6 |
| `validatePassword` | Function | `museum-backend/src/shared/validation/password.ts` | 19 |
| `mapSessionToDashboardCard` | Function | `museum-frontend/features/chat/domain/dashboard-session.ts` | 37 |
| `IReviewRepository` | Interface | `museum-backend/src/modules/review/domain/review.repository.interface.ts` | 9 |
| `IAdminRepository` | Interface | `museum-backend/src/modules/admin/domain/admin.repository.interface.ts` | 19 |
| `IUserRepository` | Interface | `museum-backend/src/modules/auth/core/domain/user.repository.interface.ts` | 3 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |
| `Execute → AppError` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Http | 10 calls |
| Secondary | 6 calls |
| UseCase | 3 calls |

## How to Explore

1. `gitnexus_context({name: "notFound"})` — see callers and callees
2. `gitnexus_query({query: "domain"})` — find related execution flows
3. Read key files listed above for implementation details
