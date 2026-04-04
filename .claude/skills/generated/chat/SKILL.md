---
name: chat
description: "Skill for the Chat area of InnovMind. 131 symbols across 56 files."
---

# Chat

131 symbols | 56 files | Cohesion: 78%

## When to Use

- Working with code in `museum-backend/`
- Understanding how buildAiTestOrchestrator, middleware, recordFailedLogin work
- Modifying chat-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/tests/helpers/chat/chatTestApp.ts` | getMessageById, exportUserData, generate, hasMessageReport, persistMessageReport (+8) |
| `museum-backend/src/modules/chat/index.ts` | buildImageEnrichment, buildArtKeywordRefresh, refreshKeywords, build, buildKnowledgeBase (+6) |
| `museum-backend/tests/unit/chat/chat-message-service.test.ts` | makeSession, makeMessage, makeArtOutput, makeRepo, makeOrchestrator (+3) |
| `museum-backend/tests/integration/chat/chat-service-orchestrator-errors.test.ts` | ThrowingOrchestrator, EmptyResponseOrchestrator, InsultResponseOrchestrator, InjectionLeakOrchestrator, ArtResponseOrchestrator (+2) |
| `museum-backend/src/modules/chat/infrastructure/chat.repository.typeorm.ts` | exportUserData, hasMessageReport, persistMessageReport, createSession, TypeOrmChatRepository (+1) |
| `museum-backend/src/modules/chat/domain/chat.repository.interface.ts` | hasMessageReport, persistMessageReport, createSession, listSessions, ChatRepository (+1) |
| `museum-backend/tests/unit/chat/chat-service-stream.test.ts` | StreamingArtOrchestrator, GuardrailBlockOrchestrator, ErrorOrchestrator, generate, generateStream |
| `museum-backend/tests/unit/chat/chat-service.test.ts` | makeRepo, makeOrchestrator, makeImageStorage, makeDeps, buildService |
| `museum-backend/tests/unit/chat/chat-media.service.test.ts` | makeSession, makeMessage, makeMessageRow, makeRepo |
| `museum-web/src/middleware.ts` | getPreferredLocale, pathnameHasLocale, middleware |

## Entry Points

Start here when exploring this area:

- **`buildAiTestOrchestrator`** (Function) — `museum-backend/tests/ai/setup/ai-test-helpers.ts:13`
- **`middleware`** (Function) — `museum-web/src/middleware.ts:21`
- **`recordFailedLogin`** (Function) — `museum-backend/src/modules/auth/core/useCase/login-rate-limiter.ts:48`
- **`resolveRequestBaseUrl`** (Function) — `museum-backend/src/modules/chat/adapters/primary/http/chat-route.helpers.ts:149`
- **`makeSession`** (Function) — `museum-backend/tests/helpers/chat/message.fixtures.ts:8`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LangChainChatOrchestrator` | Class | `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts` | 184 |
| `FallbackChatOrchestrator` | Class | `museum-backend/src/modules/chat/adapters/secondary/fallback-orchestrator.ts` | 12 |
| `ImageEnrichmentService` | Class | `museum-backend/src/modules/chat/application/image-enrichment.service.ts` | 28 |
| `ArtTopicClassifier` | Class | `museum-backend/src/modules/chat/application/art-topic-classifier.ts` | 49 |
| `UnsplashClient` | Class | `museum-backend/src/modules/chat/adapters/secondary/unsplash.client.ts` | 13 |
| `OpenAiTextToSpeechService` | Class | `museum-backend/src/modules/chat/adapters/secondary/text-to-speech.openai.ts` | 70 |
| `DisabledTextToSpeechService` | Class | `museum-backend/src/modules/chat/adapters/secondary/text-to-speech.openai.ts` | 94 |
| `KnowledgeBaseService` | Class | `museum-backend/src/modules/chat/application/knowledge-base.service.ts` | 25 |
| `WikidataClient` | Class | `museum-backend/src/modules/chat/adapters/secondary/wikidata.client.ts` | 39 |
| `DisabledKnowledgeBaseProvider` | Class | `museum-backend/src/modules/chat/domain/ports/knowledge-base.port.ts` | 47 |
| `FakeTextToSpeechService` | Class | `museum-backend/tests/helpers/chat/fakeTextToSpeechService.ts` | 6 |
| `ChatSession` | Class | `museum-backend/src/modules/chat/domain/chatSession.entity.ts` | 19 |
| `ChatMessage` | Class | `museum-backend/src/modules/chat/domain/chatMessage.entity.ts` | 16 |
| `TypeOrmChatRepository` | Class | `museum-backend/src/modules/chat/infrastructure/chat.repository.typeorm.ts` | 29 |
| `TypeOrmUserMemoryRepository` | Class | `museum-backend/src/modules/chat/infrastructure/userMemory.repository.typeorm.ts` | 9 |
| `UserMemoryService` | Class | `museum-backend/src/modules/chat/application/user-memory.service.ts` | 86 |
| `UserMemory` | Class | `museum-backend/src/modules/chat/domain/userMemory.entity.ts` | 17 |
| `ChatService` | Class | `museum-backend/src/modules/chat/application/chat.service.ts` | 72 |
| `TypeOrmArtKeywordRepository` | Class | `museum-backend/src/modules/chat/infrastructure/artKeyword.repository.typeorm.ts` | 8 |
| `buildAiTestOrchestrator` | Function | `museum-backend/tests/ai/setup/ai-test-helpers.ts` | 13 |

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
| `CreateMediaRouter → GetSessionById` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Secondary | 6 calls |
| Middleware | 5 calls |
| Application | 4 calls |
| Http | 4 calls |
| Domain | 3 calls |
| Infrastructure | 1 calls |

## How to Explore

1. `gitnexus_context({name: "buildAiTestOrchestrator"})` — see callers and callees
2. `gitnexus_query({query: "chat"})` — find related execution flows
3. Read key files listed above for implementation details
