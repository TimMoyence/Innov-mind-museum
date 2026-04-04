---
name: http
description: "Skill for the Http area of InnovMind. 86 symbols across 34 files."
---

# Http

86 symbols | 34 files | Cohesion: 70%

## When to Use

- Working with code in `museum-backend/`
- Understanding how badRequest, assertImageSize, assertMimeType work
- Modifying http-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | optionalString, optionalBoolean, optionalNumber, parseCreateSessionRequest, parsePostMessageRequest (+13) |
| `museum-backend/src/modules/chat/adapters/primary/http/chat-route.helpers.ts` | enforceContextSizeLimit, parseRawContextObject, parseLocation, parseMuseumMode, parseGuideLevel (+3) |
| `museum-backend/src/modules/chat/adapters/primary/http/sse.helpers.ts` | initSseResponse, isWritable, sendSseEvent, sendSseToken, sendSseDone (+2) |
| `museum-backend/src/modules/museum/adapters/primary/http/museum.route.ts` | handleGetDirectory, handleCreateMuseum, handleListMuseums, handleGetMuseum, handleUpdateMuseum |
| `museum-backend/src/modules/chat/application/image-input.ts` | assertImageSize, assertMimeType, detectImageMimeFromBytes, assertMagicBytes |
| `museum-backend/src/modules/chat/adapters/primary/http/chat.image-url.ts` | toBase64Url, signPayload, buildSignedChatImageReadUrl, verifySignedChatImageReadUrl |
| `museum-backend/src/modules/chat/adapters/primary/http/chat-message.route.ts` | createPostMessageHandler, initSseTimers, createStreamHandler |
| `museum-backend/src/modules/chat/adapters/primary/http/chat-media.route.ts` | createAudioHandler, createImageServeHandler, createMediaRouter |
| `museum-backend/src/modules/support/domain/support.repository.interface.ts` | createTicket, listTickets |
| `museum-backend/src/modules/review/domain/review.repository.interface.ts` | createReview, listReviews |

## Entry Points

Start here when exploring this area:

- **`badRequest`** (Function) — `museum-backend/src/shared/errors/app.error.ts:22`
- **`assertImageSize`** (Function) — `museum-backend/src/modules/chat/application/image-input.ts:86`
- **`assertMimeType`** (Function) — `museum-backend/src/modules/chat/application/image-input.ts:99`
- **`detectImageMimeFromBytes`** (Function) — `museum-backend/src/modules/chat/application/image-input.ts:119`
- **`assertMagicBytes`** (Function) — `museum-backend/src/modules/chat/application/image-input.ts:140`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `badRequest` | Function | `museum-backend/src/shared/errors/app.error.ts` | 22 |
| `assertImageSize` | Function | `museum-backend/src/modules/chat/application/image-input.ts` | 86 |
| `assertMimeType` | Function | `museum-backend/src/modules/chat/application/image-input.ts` | 99 |
| `detectImageMimeFromBytes` | Function | `museum-backend/src/modules/chat/application/image-input.ts` | 119 |
| `assertMagicBytes` | Function | `museum-backend/src/modules/chat/application/image-input.ts` | 140 |
| `parseCreateSessionRequest` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 192 |
| `parsePostMessageRequest` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 211 |
| `parseListSessionsQuery` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 252 |
| `parseReportMessageRequest` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 386 |
| `parseContext` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat-route.helpers.ts` | 115 |
| `createUploadAdmissionMiddleware` | Function | `museum-backend/src/helpers/middleware/upload-admission.middleware.ts` | 9 |
| `createChatRouter` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.route.ts` | 18 |
| `createSessionRouter` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat-session.route.ts` | 15 |
| `getRequestUser` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat-route.helpers.ts` | 172 |
| `createMediaRouter` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat-media.route.ts` | 134 |
| `isCreateSessionResponse` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 282 |
| `isPostMessageResponse` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 293 |
| `isPostAudioMessageResponse` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 310 |
| `isGetSessionResponse` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 330 |
| `isDeleteSessionResponse` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat.contracts.ts` | 377 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateMessageRouter → GetSessionById` | cross_community | 7 |
| `CreateSessionRouter → Delete` | cross_community | 7 |
| `CreatePostMessageHandler → AppError` | cross_community | 7 |
| `CreatePostMessageHandler → Get` | cross_community | 7 |
| `CreatePostMessageHandler → Save` | cross_community | 7 |
| `CreatePostMessageHandler → Save` | cross_community | 7 |
| `CreatePostMessageHandler → ExtractText` | cross_community | 7 |
| `CreateMessageRouter → EvaluateInput` | cross_community | 6 |
| `CreateMessageRouter → Wait` | cross_community | 6 |
| `CreateMessageRouter → IsWritable` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Application | 5 calls |
| Middleware | 4 calls |
| Infrastructure | 3 calls |
| Chat | 2 calls |
| Perf | 2 calls |
| Secondary | 1 calls |
| UseCase | 1 calls |

## How to Explore

1. `gitnexus_context({name: "badRequest"})` — see callers and callees
2. `gitnexus_query({query: "http"})` — find related execution flows
3. Read key files listed above for implementation details
