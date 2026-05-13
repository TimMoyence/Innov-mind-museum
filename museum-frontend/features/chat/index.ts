/**
 * Chat feature surface — re-exports for callers that want a stable entry point.
 *
 * Deep imports into `chat/application/`, `chat/domain/`, `chat/infrastructure/`,
 * `chat/ui/` are allowed (and currently the dominant pattern — see
 * `features/README.md`). Add a re-export here only when a symbol becomes
 * part of a stable cross-feature API and you want to insulate consumers
 * from internal layout changes.
 *
 * What's exposed today is intentionally narrow (dashboard view-model + a
 * couple of API methods); it is not an exhaustive public API.
 *
 * History: the previous docblock claimed conversation/museum "MUST" import
 * from this barrel. Audit 2026-05-12 (P1-6) measured 265 cross-feature
 * deep imports vs 8 barrel imports (~33:1) — chat itself was the top
 * deep-import target. The doctrine was untruthful per UFR-013 and was
 * retired — barrels are now opt-in, not mandatory.
 */

// ── Dashboard session view-model (read-only data type) ─────────────────────
export type { DashboardSessionCard } from './domain/dashboard-session';
export { mapSessionsToDashboardCards } from './domain/dashboard-session';

// ── Chat API: narrowly exposed public methods ─────────────────────────────
// Full chatApi is intentionally NOT re-exported — outside consumers should
// only use the session-list endpoints the dashboard needs. Streaming,
// messaging, media, and TTS stay private to the chat feature.
export { chatApi } from './infrastructure/chatApi';
