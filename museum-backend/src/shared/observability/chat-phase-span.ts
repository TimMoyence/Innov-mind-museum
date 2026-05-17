/**
 * A5 (R2-R6) — `chat.phase.<phase>` Langfuse trace for the 5 coarse pipeline phases.
 *
 * Distinct from `chat-phase-timer.ts` (which owns the Prom `chat_phase_duration_seconds`
 * dimension): `ChatPipelinePhase` is API-contract + Langfuse only — Prom cardinality
 * stays untouched (A5 §1.1 Open Q2 decision b).
 *
 * Fail-open via `safeTrace` (spec §1.1 R9). For terminal `'done'` marker pass
 * `Date.now()` — durationMs ~0, trace exists only as closing breadcrumb.
 */

import { getLangfuse } from '@shared/observability/langfuse.client';
import { safeTrace } from '@shared/observability/safeTrace';

import type { ChatPipelinePhase } from '@modules/chat/domain/chat.types';

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
