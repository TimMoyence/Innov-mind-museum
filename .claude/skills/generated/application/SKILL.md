---
name: application
description: "Skill for the Application area of InnovMind. 204 symbols across 59 files."
---

# Application

204 symbols | 59 files | Cohesion: 77%

## When to Use

- Working with code in `museum-backend/`
- Understanding how useOfflineSync, flush, useOfflineQueue work
- Modifying application-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-frontend/features/chat/application/offlineQueue.ts` | getItem, setItem, OfflineQueue, hydrate, enqueue (+9) |
| `museum-backend/src/modules/chat/application/stream-buffer.ts` | StreamBuffer, onRelease, awaitPhase1, awaitDone, constructor (+8) |
| `museum-backend/src/modules/chat/application/chat-message.service.ts` | postMessageStream, extractSearchTerm, fetchEnrichmentData, constructor, postCommitSideEffects (+5) |
| `museum-backend/src/modules/chat/application/user-memory.service.ts` | mergeExpertise, mergeMuseums, mergeArtworks, mergeArtists, updateAfterSession (+4) |
| `museum-backend/src/modules/chat/application/assistant-response.ts` | isObject, toCitations, toRecommendations, toFollowUpQuestions, toSuggestedImages (+4) |
| `museum-backend/src/modules/chat/application/art-topic-guardrail.ts` | buildGuardrailRefusal, escapeRegExp, isCjk, containsKeyword, includesAny (+3) |
| `museum-backend/src/modules/chat/application/image-enrichment.service.ts` | mergeWikidataImage, buildWikidataCandidate, enrich, getFromCache, sortAndDedup (+3) |
| `museum-backend/src/modules/chat/application/llm-section-runner.ts` | toErrorMessage, isTimeoutError, jitteredDelay, buildFailureResult, createTimeoutRace (+2) |
| `museum-backend/tests/helpers/chat/chatTestApp.ts` | generateStream, persistMessage, getSessionById, getMessageById, listSessionHistory (+1) |
| `museum-backend/src/modules/chat/application/image-scoring.ts` | resolutionScore, sourceScore, positionScore, scoreImage, normalizeForScoring (+1) |

## Entry Points

Start here when exploring this area:

- **`useOfflineSync`** (Function) — `museum-frontend/features/chat/application/useOfflineSync.ts:25`
- **`flush`** (Function) — `museum-frontend/features/chat/application/useOfflineSync.ts:38`
- **`useOfflineQueue`** (Function) — `museum-frontend/features/chat/application/useOfflineQueue.ts:20`
- **`createApp`** (Function) — `museum-backend/src/app.ts:137`
- **`buildChatService`** (Function) — `museum-backend/src/modules/chat/index.ts:235`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `OfflineQueue` | Class | `museum-frontend/features/chat/application/offlineQueue.ts` | 27 |
| `StaticFeatureFlagService` | Class | `museum-backend/src/shared/feature-flags/feature-flags.port.ts` | 9 |
| `SemaphoreQueueFullError` | Class | `museum-backend/src/modules/chat/application/semaphore.ts` | 3 |
| `SemaphoreTimeoutError` | Class | `museum-backend/src/modules/chat/application/semaphore.ts` | 13 |
| `StreamBuffer` | Class | `museum-backend/src/modules/chat/application/stream-buffer.ts` | 35 |
| `ImageProcessingService` | Class | `museum-backend/src/modules/chat/application/image-processing.service.ts` | 34 |
| `GuardrailEvaluationService` | Class | `museum-backend/src/modules/chat/application/guardrail-evaluation.service.ts` | 37 |
| `DisabledAudioTranscriber` | Class | `museum-backend/src/modules/chat/domain/ports/audio-transcriber.port.ts` | 36 |
| `OpenAiAudioTranscriber` | Class | `museum-backend/src/modules/chat/adapters/secondary/audio-transcriber.openai.ts` | 152 |
| `ChatSessionService` | Class | `museum-backend/src/modules/chat/application/chat-session.service.ts` | 29 |
| `ChatMessageService` | Class | `museum-backend/src/modules/chat/application/chat-message.service.ts` | 94 |
| `ChatMediaService` | Class | `museum-backend/src/modules/chat/application/chat-media.service.ts` | 23 |
| `useOfflineSync` | Function | `museum-frontend/features/chat/application/useOfflineSync.ts` | 25 |
| `flush` | Function | `museum-frontend/features/chat/application/useOfflineSync.ts` | 38 |
| `useOfflineQueue` | Function | `museum-frontend/features/chat/application/useOfflineQueue.ts` | 20 |
| `createApp` | Function | `museum-backend/src/app.ts` | 137 |
| `buildChatService` | Function | `museum-backend/src/modules/chat/index.ts` | 235 |
| `extractMetadata` | Function | `museum-backend/src/modules/chat/application/assistant-response.ts` | 77 |
| `parseAssistantResponse` | Function | `museum-backend/src/modules/chat/application/assistant-response.ts` | 134 |
| `buildKnowledgeBasePromptBlock` | Function | `museum-backend/src/modules/chat/application/knowledge-base.prompt.ts` | 13 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateMessageRouter → GetSessionById` | cross_community | 7 |
| `Enrich → Normalize` | cross_community | 7 |
| `CreatePostMessageHandler → AppError` | cross_community | 7 |
| `CreatePostMessageHandler → Get` | cross_community | 7 |
| `CreatePostMessageHandler → Save` | cross_community | 7 |
| `CreatePostMessageHandler → Save` | cross_community | 7 |
| `CreatePostMessageHandler → ExtractText` | cross_community | 7 |
| `CreateMessageRouter → EvaluateInput` | cross_community | 6 |
| `PostMessageStream → AppError` | cross_community | 6 |
| `PostMessageStream → GetScheduler` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Middleware | 13 calls |
| Secondary | 10 calls |
| Http | 7 calls |
| Chat | 6 calls |
| Domain | 4 calls |
| I18n | 4 calls |
| Infrastructure | 3 calls |
| Settings | 2 calls |

## How to Explore

1. `gitnexus_context({name: "useOfflineSync"})` — see callers and callees
2. `gitnexus_query({query: "application"})` — find related execution flows
3. Read key files listed above for implementation details
