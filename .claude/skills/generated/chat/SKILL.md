---
name: chat
description: "Skill for the Chat area of InnovMind. 116 symbols across 51 files."
---

# Chat

116 symbols | 51 files | Cohesion: 82%

## When to Use

- Working with code in `museum-backend/`
- Understanding how buildAiTestOrchestrator, createE2EHarness, buildChatTestService work
- Modifying chat-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/src/modules/chat/index.ts` | buildImageEnrichment, buildArtKeywordRefresh, refreshKeywords, build, buildKnowledgeBase (+6) |
| `museum-backend/tests/helpers/chat/chatTestApp.ts` | generate, InMemoryChatRepository, FakeOrchestrator, buildChatTestService, createSession (+5) |
| `museum-backend/tests/unit/chat/chat-message-service.test.ts` | makeSession, makeMessage, makeArtOutput, makeRepo, makeOrchestrator (+3) |
| `museum-backend/tests/integration/chat/chat-service-orchestrator-errors.test.ts` | ThrowingOrchestrator, EmptyResponseOrchestrator, InsultResponseOrchestrator, InjectionLeakOrchestrator, ArtResponseOrchestrator (+2) |
| `museum-backend/tests/unit/chat/chat-service-stream.test.ts` | StreamingArtOrchestrator, GuardrailBlockOrchestrator, ErrorOrchestrator, generate, generateStream |
| `museum-backend/tests/unit/chat/chat-service.test.ts` | buildService, makeRepo, makeOrchestrator, makeImageStorage, makeDeps |
| `museum-backend/src/modules/chat/domain/chat.repository.interface.ts` | ChatRepository, createSession, listSessions, deleteSessionIfEmpty |
| `museum-backend/tests/unit/chat/chat-media.service.test.ts` | makeSession, makeMessage, makeMessageRow, makeRepo |
| `museum-backend/tests/perf/chat-load.mocked.ts` | wait, generate, generateStream |
| `museum-backend/src/modules/chat/infrastructure/chat.repository.typeorm.ts` | TypeOrmChatRepository, createSession, deleteSessionIfEmpty |

## Entry Points

Start here when exploring this area:

- **`buildAiTestOrchestrator`** (Function) — `museum-backend/tests/ai/setup/ai-test-helpers.ts:13`
- **`createE2EHarness`** (Function) — `museum-backend/tests/helpers/e2e/e2e-app-harness.ts:38`
- **`buildChatTestService`** (Function) — `museum-backend/tests/helpers/chat/chatTestApp.ts:349`
- **`makeSession`** (Function) — `museum-backend/tests/helpers/chat/message.fixtures.ts:8`
- **`makeMessage`** (Function) — `museum-backend/tests/helpers/chat/message.fixtures.ts:33`

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
| `TypeOrmChatRepository` | Class | `museum-backend/src/modules/chat/infrastructure/chat.repository.typeorm.ts` | 29 |
| `ChatService` | Class | `museum-backend/src/modules/chat/application/chat.service.ts` | 72 |
| `KnowledgeBaseService` | Class | `museum-backend/src/modules/chat/application/knowledge-base.service.ts` | 25 |
| `DisabledKnowledgeBaseProvider` | Class | `museum-backend/src/modules/chat/domain/ports/knowledge-base.port.ts` | 47 |
| `WikidataClient` | Class | `museum-backend/src/modules/chat/adapters/secondary/wikidata.client.ts` | 39 |
| `FakeTextToSpeechService` | Class | `museum-backend/tests/helpers/chat/fakeTextToSpeechService.ts` | 6 |
| `ChatSession` | Class | `museum-backend/src/modules/chat/domain/chatSession.entity.ts` | 19 |
| `ChatMessage` | Class | `museum-backend/src/modules/chat/domain/chatMessage.entity.ts` | 16 |
| `UserMemory` | Class | `museum-backend/src/modules/chat/domain/userMemory.entity.ts` | 17 |
| `TypeOrmArtKeywordRepository` | Class | `museum-backend/src/modules/chat/infrastructure/artKeyword.repository.typeorm.ts` | 8 |
| `TypeOrmUserMemoryRepository` | Class | `museum-backend/src/modules/chat/infrastructure/userMemory.repository.typeorm.ts` | 9 |
| `UserMemoryService` | Class | `museum-backend/src/modules/chat/application/user-memory.service.ts` | 86 |
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
| `CreateRateLimitMiddleware → Delete` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Application | 5 calls |
| Secondary | 5 calls |
| Middleware | 5 calls |
| Http | 2 calls |

## How to Explore

1. `gitnexus_context({name: "buildAiTestOrchestrator"})` — see callers and callees
2. `gitnexus_query({query: "chat"})` — find related execution flows
3. Read key files listed above for implementation details
