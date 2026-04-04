---
name: ui
description: "Skill for the Ui area of InnovMind. 40 symbols across 30 files."
---

# Ui

40 symbols | 30 files | Cohesion: 83%

## When to Use

- Working with code in `museum-frontend/`
- Understanding how getErrorMessage, shareDashboard, PrivacyScreen work
- Modifying ui-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-frontend/shared/ui/BrandMark.tsx` | clamp, resolveResponsiveSize, BrandMark |
| `museum-frontend/shared/lib/errors.ts` | t, getErrorMessage |
| `museum-frontend/app/(stack)/preferences.tsx` | PreferencesScreen, onSave |
| `museum-frontend/app/(stack)/museum-detail.tsx` | MuseumDetailScreen, handleStartChat |
| `museum-backend/src/index.ts` | initCacheAndRateLimit, start |
| `museum-frontend/shared/ui/FloatingContextMenu.tsx` | FloatingContextMenu, handleAction |
| `museum-frontend/app/(stack)/chat/[sessionId].tsx` | ChatSessionScreen, onClose |
| `museum-frontend/shared/ui/LiquidScreen.tsx` | isResponsiveBackground, LiquidScreen |
| `museum-frontend/features/chat/ui/ArtworkCard.tsx` | confidenceKey, ArtworkCard |
| `museum-frontend/shared/ui/ErrorBoundary.tsx` | render |

## Entry Points

Start here when exploring this area:

- **`getErrorMessage`** (Function) — `museum-frontend/shared/lib/errors.ts:43`
- **`shareDashboard`** (Function) — `museum-frontend/features/conversation/application/useConversationsActions.ts:40`
- **`PrivacyScreen`** (Function) — `museum-frontend/app/(stack)/privacy.tsx:58`
- **`PreferencesScreen`** (Function) — `museum-frontend/app/(stack)/preferences.tsx:31`
- **`onSave`** (Function) — `museum-frontend/app/(stack)/preferences.tsx:55`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `RedisRateLimitStore` | Class | `museum-backend/src/helpers/middleware/redis-rate-limit-store.ts` | 14 |
| `TokenCleanupService` | Class | `museum-backend/src/modules/auth/core/useCase/tokenCleanup.service.ts` | 11 |
| `RefreshTokenRepositoryPg` | Class | `museum-backend/src/modules/auth/adapters/secondary/refresh-token.repository.pg.ts` | 41 |
| `getErrorMessage` | Function | `museum-frontend/shared/lib/errors.ts` | 43 |
| `shareDashboard` | Function | `museum-frontend/features/conversation/application/useConversationsActions.ts` | 40 |
| `PrivacyScreen` | Function | `museum-frontend/app/(stack)/privacy.tsx` | 58 |
| `PreferencesScreen` | Function | `museum-frontend/app/(stack)/preferences.tsx` | 31 |
| `onSave` | Function | `museum-frontend/app/(stack)/preferences.tsx` | 55 |
| `MuseumDetailScreen` | Function | `museum-frontend/app/(stack)/museum-detail.tsx` | 25 |
| `handleStartChat` | Function | `museum-frontend/app/(stack)/museum-detail.tsx` | 59 |
| `SettingsThemeCard` | Function | `museum-frontend/features/settings/ui/SettingsThemeCard.tsx` | 21 |
| `MuseumCard` | Function | `museum-frontend/features/museum/ui/MuseumCard.tsx` | 13 |
| `ConversationsHeader` | Function | `museum-frontend/features/conversation/ui/ConversationsHeader.tsx` | 19 |
| `ConversationsBulkBar` | Function | `museum-frontend/features/conversation/ui/ConversationsBulkBar.tsx` | 14 |
| `OfflineBanner` | Function | `museum-frontend/features/chat/ui/OfflineBanner.tsx` | 10 |
| `MessageActions` | Function | `museum-frontend/features/chat/ui/MessageActions.tsx` | 26 |
| `DailyArtCard` | Function | `museum-frontend/features/daily-art/ui/DailyArtCard.tsx` | 17 |
| `goTo` | Function | `museum-frontend/features/chat/ui/ImageFullscreenModal.tsx` | 58 |
| `useAudioRecorder` | Function | `museum-frontend/features/chat/application/useAudioRecorder.ts` | 9 |
| `initOpenTelemetry` | Function | `museum-backend/src/shared/observability/opentelemetry.ts` | 12 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UseAudioRecorder → DeleteExpiredTokens` | cross_community | 5 |
| `DailyArtCard → DeleteExpiredTokens` | cross_community | 5 |
| `ChatSessionScreen → EnsureContract` | cross_community | 4 |
| `MuseumDetailScreen → EnsureContract` | cross_community | 4 |
| `MessageContextMenu → EnsureContract` | cross_community | 4 |
| `UseAudioRecorder → RedisRateLimitStore` | intra_community | 4 |
| `UseAudioRecorder → SetRedisRateLimitStore` | intra_community | 4 |
| `DailyArtCard → RedisRateLimitStore` | intra_community | 4 |
| `DailyArtCard → SetRedisRateLimitStore` | intra_community | 4 |
| `ConversationsScreen → T` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| (stack) | 4 calls |
| Infrastructure | 3 calls |
| UseCase | 1 calls |
| Observability | 1 calls |
| Chat | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getErrorMessage"})` — see callers and callees
2. `gitnexus_query({query: "ui"})` — find related execution flows
3. Read key files listed above for implementation details
