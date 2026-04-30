# Chat UX Improvements — Design Spec

**Date:** 2026-04-08
**Status:** Validated
**Scope:** 5 fixes/features across museum-frontend + museum-backend

---

## 1. Keyboard Dismiss (Global + On Send)

### Problem
Tapping outside the keyboard does not dismiss it consistently across all screens. After sending a message, the keyboard stays open.

### Current State
- `[sessionId].tsx` wraps the chat screen in `TouchableWithoutFeedback onPress={Keyboard.dismiss}` but other screens lack this.
- `onSend` callback (line 136) clears text and media but never calls `Keyboard.dismiss()`.

### Design

**Global dismiss:** Add `Keyboard.dismiss()` on tap-outside behavior at the app level. Two approaches:
- Wrap root layout (`app/_layout.tsx`) or each tab/stack layout with a `TouchableWithoutFeedback` + `Keyboard.dismiss`.
- Alternatively, set `keyboardDismissMode="on-drag"` on ScrollViews/FlatLists globally.

Recommended: add `Keyboard.dismiss()` to the `onSend` callback in `[sessionId].tsx` **and** ensure each screen with text input has dismiss-on-tap-outside behavior. The chat screen already has it; audit other screens (auth, support, settings) for the same pattern.

**On send:** Add `Keyboard.dismiss()` at the top of the `onSend` callback in `[sessionId].tsx:136`.

### Files to Modify
- `museum-frontend/app/(stack)/chat/[sessionId].tsx` — add `Keyboard.dismiss()` in `onSend`
- `museum-frontend/app/_layout.tsx` or individual screen layouts — global dismiss wrapper
- Audit: `app/auth.tsx`, `app/(stack)/settings/`, `app/(stack)/support/` for consistency

---

## 2. Session Title = Museum Name (Remove Debug ID)

### Problem
Chat header shows "Session artistiq..." (fallback title) with the raw session UUID as subtitle. The dashboard shows preview text instead of the museum name. The UUID is a debug relic — users should never see it.

### Current State
- **Backend:** `createSession()` accepts `museumName` and stores it, but never sets `session.title`.
- **Frontend ChatHeader:** displays `sessionTitle ?? t('chat.fallback_title')` as title, and `museumName ?? sessionId.slice(0,12)...` as subtitle.
- **Frontend Dashboard:** `mapSessionToDashboardCard()` uses `session.title ?? preview.text ?? fallback`.

### Design

**Backend:** When `museumName` is provided in `CreateSessionInput`, set `session.title = input.museumName`. This makes the title available immediately without waiting for the first LLM exchange.

```
// chat.repository.typeorm.ts — createSession
const session = this.sessionRepo.create({
  ...existing fields,
  title: input.museumName ?? null,  // ← NEW: initialize title from museum name
});
```

**Frontend ChatHeader:** 
- Title: `sessionTitle ?? museumName ?? t('chat.fallback_title')` (unchanged logic, but now `sessionTitle` will be set from backend).
- Subtitle: **remove entirely**. No more session ID, no more `museumName` in subtitle (it's already the title). Remove the `<View style={styles.headerSubRow}>` block that shows the UUID.

**Frontend Dashboard:**
- No code change needed — `mapSessionToDashboardCard` already uses `session.title` as first choice, which will now be the museum name.

### Files to Modify
- `museum-backend/src/modules/chat/adapters/secondary/chat.repository.typeorm.ts` — set `title` from `museumName`
- `museum-frontend/features/chat/ui/ChatHeader.tsx` — remove subtitle row (UUID + museumName)

---

## 3. TTS Production Fix + Frontend Error Handling

### Problem
TTS returns 501 in production because `TTS_ENABLED` was not set. The frontend catches the error silently but the user taps "Ecouter" repeatedly, generating multiple failed requests.

### Current State
- **Backend:** `TTS_ENABLED=true` and `FEATURE_FLAG_VOICE_MODE=true` now set on VPS (user confirmed). Requires container restart.
- **Frontend:** `useTextToSpeech.ts` catches errors silently in a bare `catch` block — no user feedback, no disable-on-error.

### Design

**Frontend error handling:** When `synthesizeSpeech()` throws (any error — 501, 500, network), show a brief toast/alert to the user ("Audio indisponible") and disable the "Ecouter" button for that message. Do not retry automatically.

```
// useTextToSpeech.ts — catch block
catch {
  showToast(t('chat.tts_unavailable'));  // or inline error state
  cleanup();
}
```

Add an `errorMessageId` state to track which message failed TTS. The "Ecouter" button checks this to show a disabled/error state instead of allowing repeated taps.

### Files to Modify
- `museum-frontend/features/chat/application/useTextToSpeech.ts` — add error feedback + disable on failure
- `museum-frontend/features/chat/ui/ChatBubble.tsx` (or wherever "Ecouter" is rendered) — respect error state

---

## 4. Photo Upload — Inline Preview (Remove Modal)

### Problem
Sending a photo requires 4 clicks: Galerie → select → modal "Envoyer" → ChatInput "Envoyer". The `ImagePreviewModal` (rotate/crop/confirm) and `MediaAttachmentPanel` preview with "Remplacer/Supprimer" context menu add unnecessary friction.

### Current State
- `useImagePicker.ts` manages two states: `pendingImage` (pre-confirmation) and `selectedImage` (confirmed).
- `ImagePreviewModal` shows a full-screen preview with rotate/crop/confirm/cancel.
- `MediaAttachmentPanel` shows the confirmed image with a `FloatingContextMenu` (replace/remove).

### Design

**New flow (2 clicks):**
1. Tap Galerie/Caméra → select photo (system picker)
2. Photo appears as **inline thumbnail** in the input area (next to the text field) with a small `×` dismiss button
3. User can optionally type text alongside the photo
4. Tap send button → sends photo + text

**Changes:**
- **Remove `ImagePreviewModal`** — no more full-screen preview/rotate/crop step. The photo goes directly from picker to inline preview.
- **Remove `pendingImage` state** — `useImagePicker.ts` only needs `selectedImage`. After picking, set `selectedImage` directly (skip the pending → confirm flow).
- **Simplify `MediaAttachmentPanel`** — replace the current large preview + FloatingContextMenu with a small inline thumbnail (48-56px) with an `×` overlay button to remove. No "Remplacer" option — user can remove and pick again.
- **Keep `optimizeImageForUpload()`** — still compress before setting as selected.

**Inline thumbnail design:**
```
┌─────────────────────────────────────────────┐
│ [×]                                          │
│ [thumb]  Posez une question...    [▶ send]  │
└─────────────────────────────────────────────┘
```

The thumbnail sits to the left of the text input. The `×` button is a small circle overlay on the top-right of the thumbnail.

### Files to Modify
- `museum-frontend/features/chat/application/useImagePicker.ts` — remove `pendingImage`, set `selectedImage` directly after pick
- `museum-frontend/features/chat/ui/ImagePreviewModal.tsx` — **delete file** (no longer used)
- `museum-frontend/features/chat/ui/MediaAttachmentPanel.tsx` — replace preview section with inline thumbnail
- `museum-frontend/features/chat/ui/ChatInput.tsx` — integrate thumbnail display next to text input
- `museum-frontend/app/(stack)/chat/[sessionId].tsx` — remove `ImagePreviewModal` usage and `pendingImage`/`confirmPendingImage`/`cancelPendingImage` props

---

## 5. Websearch + WebView In-App Browser

### Problem
When users ask about current exhibitions or real-time info (e.g., "quelles expos au CAPC en ce moment"), the LLM cannot answer because it has no web access. It tells users to check the museum website, which means leaving the app.

### Current State
- LangChain orchestrator uses section-based execution with ChatOpenAI/ChatGoogleGenerativeAI. No tools are configured.
- `react-native-webview` is already installed (used for Leaflet maps in `MuseumMapView`).
- No in-app browser component exists yet.

### Design

**Backend — LangChain Web Search Tool:**

Add a web search tool to the LangChain orchestrator. When the LLM detects a question requiring real-time information (current exhibitions, opening hours, events, ticket prices), it invokes the search tool.

- **Provider:** Tavily (`@tavily/core`) — purpose-built for LLM search, returns structured results with source URLs. Alternative: SerpAPI.
- **Integration:** Add as a LangChain tool via `TavilySearchResults` from `@langchain/community/tools/tavily`.
- **Orchestrator change:** The current section-based orchestrator uses direct `model.invoke()` / `model.stream()`. To support tools, use LangChain's `AgentExecutor` or manual tool-calling loop for the main response section only (not for parallel sections like artwork analysis).
- **Env vars:** `TAVILY_API_KEY` (required), `FEATURE_FLAG_WEB_SEARCH=true` (feature flag).
- **Guardrail:** The web search tool should only be invoked for real-time queries. The system prompt instructs the LLM when to use it. The existing art-topic guardrail runs before the LLM, so off-topic queries are still blocked.
- **Response format:** The LLM integrates search results into its natural response and includes source URLs as markdown links.

**Frontend — In-App WebView Browser:**

Create a reusable in-app browser component that opens URLs from chat messages without leaving the app.

- **Component:** `InAppBrowser` — a modal/screen with a WebView, navigation bar (back, forward, close), and URL display.
- **Link handling:** When a chat message contains a URL (markdown link), tapping it opens the `InAppBrowser` instead of the system browser.
- **Existing dependency:** `react-native-webview` already installed.
- **Fallback:** If WebView fails to load, offer to open in system browser via `Linking.openURL()`.

### Files to Create
- `museum-backend/src/modules/chat/adapters/secondary/web-search.tool.ts` — Tavily web search tool wrapper
- `museum-frontend/shared/ui/InAppBrowser.tsx` — reusable in-app browser modal

### Files to Modify
- `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts` — integrate web search tool for real-time queries
- `museum-backend/src/modules/chat/useCase/llm-sections.ts` — update system prompt to instruct LLM on web search usage
- `museum-backend/src/config/env.ts` — add `TAVILY_API_KEY` and `FEATURE_FLAG_WEB_SEARCH`
- `museum-backend/package.json` — add `@tavily/core` or `@langchain/community` dependency
- `museum-frontend/features/chat/ui/ChatBubble.tsx` — intercept link taps to open InAppBrowser
- `museum-frontend/app/(stack)/chat/[sessionId].tsx` — mount InAppBrowser modal

---

## Implementation Order

1. **Keyboard dismiss** — smallest change, immediate UX win
2. **Session title + remove UUID** — backend + frontend, small scope
3. **TTS error handling** — frontend only (backend already fixed via env vars)
4. **Photo upload inline** — frontend refactor, medium scope
5. **Websearch + WebView** — largest scope, backend + frontend, new dependency

Items 1-4 can ship as one PR. Item 5 is a separate PR due to new backend dependency and LLM behavior change.
