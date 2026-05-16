/**
 * A5 (R22) — FE-side telemetry consumer for `metadata.phase`.
 *
 * The backend returns a terminal `ChatPipelinePhase` value on
 * `metadata.phase` (spec §1.1 R1). The FE consumes it for telemetry ONLY —
 * the visible status string is driven by the client-side `useStatusPhase`
 * simulation (R10-R17, see `application/useStatusPhase.ts`).
 *
 * R23 contract : when the field is absent (legacy persisted messages,
 * refusal paths, NFR8 backward-compat) the helper SHALL NOT throw and
 * SHALL NOT log. Silence-is-not-an-error.
 *
 * Sentry breadcrumb is deferred until the chat path's Sentry context is
 * confirmed wired (V1.1). For V1 we emit a dev-only `console.debug` line
 * that lands in Metro / web devtools so the phase can be observed during
 * QA without polluting prod logs.
 */

interface PhaseTelemetryContext {
  readonly sessionId: string;
  readonly messageId: string;
}

/**
 * Logs the terminal pipeline phase carried by an assistant response payload.
 * No-op when `metadata` is `null`, `undefined`, or has no `phase` field
 * (R23). The phase value itself is logged verbatim — typing is enforced by
 * the BE side ; the FE treats it as opaque telemetry.
 *
 * The `metadata` parameter is intentionally widened to `unknown` so callers
 * can pass any response-metadata shape (typed or raw `Record<string, unknown>`
 * from the OpenAPI client) without needing a structural narrow at the call
 * site. The helper itself guards against non-object inputs.
 *
 * @param metadata The response `metadata` field — may be `null` / `undefined`
 *   on legacy code paths, or an object without `phase` (NFR8 backward-compat).
 * @param ctx      Correlation identifiers (`sessionId`, `messageId`) for the
 *   log entry.
 */
export function logPhaseTelemetry(metadata: unknown, ctx: PhaseTelemetryContext): void {
  if (!metadata || typeof metadata !== 'object') return;
  const phase = (metadata as { phase?: unknown }).phase;
  if (typeof phase !== 'string' || phase.length === 0) return;
  // Dev-only signal — never paged on, never persisted server-side. `console.debug`
  // is permitted by the FE ESLint config for intentional observability.
  console.debug('[chat.phase]', phase, {
    sessionId: ctx.sessionId,
    messageId: ctx.messageId,
  });
}
