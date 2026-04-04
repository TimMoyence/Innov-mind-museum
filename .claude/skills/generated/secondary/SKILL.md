---
name: secondary
description: "Skill for the Secondary area of InnovMind. 137 symbols across 37 files."
---

# Secondary

137 symbols | 37 files | Cohesion: 82%

## When to Use

- Working with code in `museum-backend/`
- Understanding how verifyAppleIdToken, verifyGoogleIdToken, verifySocialIdToken work
- Modifying secondary-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/modules/chat/adapters/secondary/image-storage.s3.ts` | canonicalQueryString, buildS3PresignedReadUrl, extractXmlValues, extractXmlValue, listObjectsByPrefix (+9) |
| `museum-backend/src/modules/admin/adapters/secondary/admin.repository.pg.ts` | granularityToTrunc, getUsageAnalytics, buildDateFilter, mapTs, mapReport (+6) |
| `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts` | invoke, isRetryableError, invokeSection, assembleResponse, generate (+5) |
| `museum-backend/src/modules/chat/adapters/secondary/audio-transcriber.openai.ts` | toLanguageHint, toAudioFileName, assertOpenAiAvailable, decodeAudioPayload, buildTranscriptionFormData (+3) |
| `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts` | fetchJwks, jwkToPem, getSigningKey, decodeHeader, verifyAppleIdToken (+2) |
| `museum-backend/src/modules/auth/adapters/secondary/user.repository.pg.ts` | consumeResetTokenAndUpdatePassword, verifyEmail, consumeEmailChangeToken, getUserByEmail, registerUser (+2) |
| `museum-backend/src/modules/auth/adapters/secondary/refresh-token.repository.pg.ts` | revokeByJti, revokeAllForUser, revokeFamily, toRow, insert (+2) |
| `museum-backend/src/modules/chat/adapters/secondary/llm-circuit-breaker.ts` | CircuitOpenError, execute, recordSuccess, recordFailure, trip (+2) |
| `museum-backend/src/modules/support/adapters/secondary/support.repository.pg.ts` | toTicketDTO, createTicket, listTickets, getTicketById, updateTicket (+2) |
| `museum-backend/src/modules/support/adapters/secondary/support-contact-email.notifier.ts` | escapeHtml, buildSupportContactHtml, notify, EmailSupportContactNotifier, NoopSupportContactNotifier |

## Entry Points

Start here when exploring this area:

- **`verifyAppleIdToken`** (Function) — `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts:106`
- **`verifyGoogleIdToken`** (Function) — `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts:135`
- **`verifySocialIdToken`** (Function) — `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts:169`
- **`unauthorized`** (Function) — `museum-backend/src/shared/errors/app.error.ts:95`
- **`conflict`** (Function) — `museum-backend/src/shared/errors/app.error.ts:53`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AppError` | Class | `museum-backend/src/shared/errors/app.error.ts` | 1 |
| `CircuitOpenError` | Class | `museum-backend/src/modules/chat/adapters/secondary/llm-circuit-breaker.ts` | 3 |
| `LocalImageStorage` | Class | `museum-backend/src/modules/chat/adapters/secondary/image-storage.stub.ts` | 38 |
| `S3CompatibleImageStorage` | Class | `museum-backend/src/modules/chat/adapters/secondary/image-storage.s3.ts` | 505 |
| `FakeOcrService` | Class | `museum-backend/tests/helpers/chat/fakeOcrService.ts` | 3 |
| `TesseractOcrService` | Class | `museum-backend/src/modules/chat/adapters/secondary/ocr-service.ts` | 11 |
| `DisabledOcrService` | Class | `museum-backend/src/modules/chat/adapters/secondary/ocr-service.ts` | 80 |
| `Semaphore` | Class | `museum-backend/src/modules/chat/application/semaphore.ts` | 32 |
| `LLMCircuitBreaker` | Class | `museum-backend/src/modules/chat/adapters/secondary/llm-circuit-breaker.ts` | 22 |
| `EmailSupportContactNotifier` | Class | `museum-backend/src/modules/support/adapters/secondary/support-contact-email.notifier.ts` | 38 |
| `NoopSupportContactNotifier` | Class | `museum-backend/src/modules/support/adapters/secondary/support-contact-email.notifier.ts` | 56 |
| `UserRepositoryPg` | Class | `museum-backend/src/modules/auth/adapters/secondary/user.repository.pg.ts` | 11 |
| `SocialTokenVerifierAdapter` | Class | `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.adapter.ts` | 12 |
| `SocialAccountRepositoryPg` | Class | `museum-backend/src/modules/auth/adapters/secondary/social-account.repository.pg.ts` | 21 |
| `verifyAppleIdToken` | Function | `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts` | 106 |
| `verifyGoogleIdToken` | Function | `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts` | 135 |
| `verifySocialIdToken` | Function | `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts` | 169 |
| `unauthorized` | Function | `museum-backend/src/shared/errors/app.error.ts` | 95 |
| `conflict` | Function | `museum-backend/src/shared/errors/app.error.ts` | 53 |
| `buildS3PresignedReadUrl` | Function | `museum-backend/src/modules/chat/adapters/secondary/image-storage.s3.ts` | 261 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreatePostMessageHandler → AppError` | cross_community | 7 |
| `CreatePostMessageHandler → ExtractText` | cross_community | 7 |
| `PostMessageStream → AppError` | cross_community | 6 |
| `PostMessageStream → GetScheduler` | cross_community | 6 |
| `CreateMediaRouter → AppError` | cross_community | 6 |
| `PostMessage → AppError` | cross_community | 6 |
| `CreateAudioHandler → AppError` | cross_community | 6 |
| `ProcessInputImage → Finish` | cross_community | 6 |
| `CreateImageServeHandler → AppError` | cross_community | 6 |
| `AuthProvider → SetItem` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Http | 3 calls |
| Chat | 2 calls |
| Middleware | 2 calls |
| UseCase | 2 calls |
| Application | 2 calls |
| Settings | 1 calls |
| Domain | 1 calls |

## How to Explore

1. `gitnexus_context({name: "verifyAppleIdToken"})` — see callers and callees
2. `gitnexus_query({query: "secondary"})` — find related execution flows
3. Read key files listed above for implementation details
