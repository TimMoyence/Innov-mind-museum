/**
 * A5 (R2-R6) — Emits a Langfuse `chat.phase.<phase>` trace for one of the
 * five coarse pipeline phases (analyzing-image, searching-collection,
 * composing, synthesizing-voice, done).
 *
 * Distinct from `chat-phase-timer.ts` (which owns the Prometheus
 * `chat_phase_duration_seconds{phase=stt|llm|tts}` dimension) per A5 §1.1
 * Open Q2 decision (b) — `ChatPipelinePhase` is API-contract + Langfuse
 * only ; the Prom histogram cardinality stays untouched.
 *
 * Fail-open via `safeTrace` : a Langfuse SDK outage NEVER propagates into
 * the chat path. Spec §1.1 R9.
 */

import { getLangfuse } from '@shared/observability/langfuse.client';
import { safeTrace } from '@shared/observability/safeTrace';

import type { ChatPipelinePhase } from '@modules/chat/domain/chat.types';

/**
 * Emit a `chat.phase.<phase>` Langfuse trace with the given duration and
 * arbitrary metadata. Caller measures `startedAtMs` *before* the work and
 * passes it in ; the helper records the elapsed ms in the span metadata.
 *
 * The trace name follows the spec convention (`chat.phase.<phase>`) so a
 * downstream `grep` or Langfuse filter aggregates all phases uniformly.
 *
 * For the terminal `'done'` marker, pass `Date.now()` as `startedAtMs` — the
 * resulting `durationMs` will be ~0 and is informationally meaningless ; the
 * trace exists only as a closing breadcrumb on the timeline (spec §1.1 R1 /
 * R9).
 *
 * @param phase       One of the five `ChatPipelinePhase` values.
 * @param startedAtMs Wall-clock ms at which the work started (Date.now()).
 * @param metadata    Optional extra metadata (sessionId, model, etc.).
 */
export function emitChatPhaseSpan(
  phase: ChatPipelinePhase,
  startedAtMs: number,
  metadata: Record<string, unknown> = {},
): void {
  safeTrace(`chat.phase.${phase}`, () => {
    const lf = getLangfuse();
    lf?.trace({
      name: `chat.phase.${phase}`,
      metadata: {
        phase,
        durationMs: Date.now() - startedAtMs,
        ...metadata,
      },
    });
  });
}
