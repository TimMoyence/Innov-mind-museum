---
name: infrastructure
description: "Skill for the Infrastructure area of InnovMind. 77 symbols across 27 files."
---

# Infrastructure

77 symbols | 27 files | Cohesion: 75%

## When to Use

- Working with code in `museum-frontend/`
- Understanding how HomeScreen, startConversation, ConversationsScreen work
- Modifying infrastructure-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-frontend/features/chat/infrastructure/chatApi.ts` | ensureContract, createSession, deleteSessionIfEmpty, listSessions, createSessionOrThrow (+10) |
| `museum-frontend/shared/infrastructure/apiConfig.ts` | normalizeApiEnvironment, readExtra, resolveBuildVariant, isLocalhostApiBaseUrl, getDefaultApiEnvironment (+10) |
| `museum-backend/src/modules/chat/infrastructure/chat.repository.typeorm.ts` | upsertMessageFeedback, deleteMessageFeedback, getMessageFeedback, listSessionMessages, fetchMessageCounts (+2) |
| `museum-backend/src/modules/chat/domain/chat.repository.interface.ts` | upsertMessageFeedback, deleteMessageFeedback, getMessageFeedback |
| `museum-backend/src/modules/chat/infrastructure/artKeyword.repository.typeorm.ts` | findByLocale, findByLocaleSince, bulkUpsert |
| `museum-backend/src/modules/chat/domain/artKeyword.repository.interface.ts` | findByLocale, findByLocaleSince, bulkUpsert |
| `museum-frontend/shared/infrastructure/storage.ts` | getItem, getJSON, removeItem |
| `museum-frontend/app/(tabs)/home.tsx` | HomeScreen, startConversation |
| `museum-backend/tests/helpers/chat/chatTestApp.ts` | upsertMessageFeedback, getMessageFeedback |
| `museum-backend/src/shared/pagination/cursor-codec.ts` | encode, decode |

## Entry Points

Start here when exploring this area:

- **`HomeScreen`** (Function) — `museum-frontend/app/(tabs)/home.tsx:29`
- **`startConversation`** (Function) — `museum-frontend/app/(tabs)/home.tsx:38`
- **`ConversationsScreen`** (Function) — `museum-frontend/app/(tabs)/conversations.tsx:27`
- **`useConversationsData`** (Function) — `museum-frontend/features/conversation/application/useConversationsData.ts:9`
- **`useConversationsBulkMode`** (Function) — `museum-frontend/features/conversation/application/useConversationsBulkMode.ts:6`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `HomeScreen` | Function | `museum-frontend/app/(tabs)/home.tsx` | 29 |
| `startConversation` | Function | `museum-frontend/app/(tabs)/home.tsx` | 38 |
| `ConversationsScreen` | Function | `museum-frontend/app/(tabs)/conversations.tsx` | 27 |
| `useConversationsData` | Function | `museum-frontend/features/conversation/application/useConversationsData.ts` | 9 |
| `useConversationsBulkMode` | Function | `museum-frontend/features/conversation/application/useConversationsBulkMode.ts` | 6 |
| `useConversationsActions` | Function | `museum-frontend/features/conversation/application/useConversationsActions.ts` | 8 |
| `createMessageRouter` | Function | `museum-backend/src/modules/chat/adapters/primary/http/chat-message.route.ts` | 193 |
| `isLocalhostApiBaseUrl` | Function | `museum-frontend/shared/infrastructure/apiConfig.ts` | 108 |
| `getDefaultApiEnvironment` | Function | `museum-frontend/shared/infrastructure/apiConfig.ts` | 121 |
| `assertApiBaseUrlAllowed` | Function | `museum-frontend/shared/infrastructure/apiConfig.ts` | 181 |
| `parseSseChunk` | Function | `museum-frontend/features/chat/infrastructure/sseParser.ts` | 13 |
| `processEvent` | Function | `museum-frontend/features/chat/infrastructure/chatApi.ts` | 422 |
| `resolveRuntimeApiBaseUrl` | Function | `museum-frontend/shared/infrastructure/apiConfig.ts` | 140 |
| `getApiConfigurationSnapshot` | Function | `museum-frontend/shared/infrastructure/apiConfig.ts` | 162 |
| `useSessionLoader` | Function | `museum-frontend/features/chat/application/useSessionLoader.ts` | 16 |
| `useChatSession` | Function | `museum-frontend/features/chat/application/useChatSession.ts` | 25 |
| `ChatMessageList` | Function | `museum-frontend/features/chat/ui/ChatMessageList.tsx` | 46 |
| `useTextToSpeech` | Function | `museum-frontend/features/chat/application/useTextToSpeech.ts` | 32 |
| `incrementCompletedSessions` | Function | `museum-frontend/shared/infrastructure/inAppReview.ts` | 15 |
| `loadRuntimeSettings` | Function | `museum-frontend/features/settings/runtimeSettings.ts` | 43 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CreateMessageRouter → GetSessionById` | cross_community | 7 |
| `CreateMessageRouter → EvaluateInput` | cross_community | 6 |
| `CreateMessageRouter → Wait` | cross_community | 6 |
| `CreateMessageRouter → IsWritable` | cross_community | 6 |
| `ListSessions → Delete` | cross_community | 6 |
| `ListSessions → StopSweep` | cross_community | 6 |
| `AuthProvider → GetItem` | cross_community | 5 |
| `CreateMessageRouter → Generate` | cross_community | 5 |
| `CreateMessageRouter → Generate` | cross_community | 5 |
| `CreateSessionRouter → Decode` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Http | 6 calls |
| Ui | 3 calls |
| Middleware | 3 calls |
| (stack) | 2 calls |
| UseCase | 2 calls |
| Chat | 2 calls |
| Settings | 1 calls |
| Application | 1 calls |

## How to Explore

1. `gitnexus_context({name: "HomeScreen"})` — see callers and callees
2. `gitnexus_query({query: "infrastructure"})` — find related execution flows
3. Read key files listed above for implementation details
