/**
 * Public API of the `chat` feature — single import surface for consumers
 * outside the feature.
 *
 * The conversation and museum features MUST import from this barrel instead of
 * reaching into `chat/domain/*` or `chat/infrastructure/*` directly. This is
 * the boundary that decouples the dashboard (conversation list) from chat
 * session internals (streaming, offline queue, cache, etc.).
 *
 * **Do not re-export UI components or application hooks here.** UI lives in
 * `app/(stack)/chat/[sessionId].tsx` and should be the only consumer of
 * `ChatMessageBubble`, `ChatInput`, etc. The barrel only exposes data-layer
 * primitives the dashboard genuinely needs.
 */

// ── Dashboard session view-model (read-only data type) ─────────────────────
export type { DashboardSessionCard } from './domain/dashboard-session';
export { mapSessionsToDashboardCards } from './domain/dashboard-session';

// ── Chat API: narrowly exposed public methods ─────────────────────────────
// Full chatApi is intentionally NOT re-exported — outside consumers should
// only use the session-list endpoints the dashboard needs. Streaming,
// messaging, media, and TTS stay private to the chat feature.
export { chatApi } from './infrastructure/chatApi';
