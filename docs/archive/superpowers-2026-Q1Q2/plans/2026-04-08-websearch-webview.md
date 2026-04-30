# Websearch + InApp WebView — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tavily web search as an enrichment block in the chat pipeline so the LLM can answer real-time questions (exhibitions, hours, events), and add an in-app browser so users don't leave the app when tapping links.

**Architecture:** Follows the existing knowledge-base enrichment pattern: search results are injected as a `[WEB SEARCH]` system message block before the user's message. No LangChain tool — prompt injection only. Frontend adds an InAppBrowser modal using existing `react-native-webview`.

**Tech Stack:** Node.js fetch (Tavily REST API), React Native WebView, Redis cache (optional)

---

## Task 1: Backend — Web Search Port + Tavily Client + Service

Create the web search domain port, Tavily adapter, prompt builder, and service with cache/timeout.

**Files:**
- Create: `museum-backend/src/modules/chat/domain/ports/web-search.port.ts`
- Create: `museum-backend/src/modules/chat/adapters/secondary/tavily.client.ts`
- Create: `museum-backend/src/modules/chat/useCase/web-search.prompt.ts`
- Create: `museum-backend/src/modules/chat/useCase/web-search.service.ts`

## Task 2: Backend — Config + Feature Flag

Add `FEATURE_FLAG_WEB_SEARCH`, `TAVILY_API_KEY`, and web search config to env.ts.

**Files:**
- Modify: `museum-backend/src/config/env.ts`

## Task 3: Backend — Wire Into Enrichment Pipeline

Integrate web search into enrichment-fetcher, chat-message.service, orchestrator port, prompt builder, and DI.

**Files:**
- Modify: `museum-backend/src/modules/chat/useCase/enrichment-fetcher.ts`
- Modify: `museum-backend/src/modules/chat/useCase/chat-message.service.ts`
- Modify: `museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts`
- Modify: `museum-backend/src/modules/chat/useCase/llm-prompt-builder.ts`
- Modify: `museum-backend/src/modules/chat/index.ts`

## Task 4: Backend — Tests

Write unit tests for Tavily client, web search prompt builder, and web search service.

**Files:**
- Create: `museum-backend/tests/unit/chat/tavily-client.test.ts`
- Create: `museum-backend/tests/unit/chat/web-search-prompt.test.ts`
- Create: `museum-backend/tests/unit/chat/web-search-service.test.ts`

## Task 5: Frontend — InAppBrowser Component

Create a modal WebView browser with navigation bar (back, forward, close, URL display).

**Files:**
- Create: `museum-frontend/shared/ui/InAppBrowser.tsx`

## Task 6: Frontend — Link Interception in Chat

Intercept link taps in chat bubbles to open InAppBrowser instead of system browser.

**Files:**
- Modify: `museum-frontend/features/chat/ui/ChatMessageBubble.tsx` or MarkdownBubble
- Modify: `museum-frontend/app/(stack)/chat/[sessionId].tsx`

## Task 7: Final Verification

Run all tests + typecheck on both backend and frontend.
