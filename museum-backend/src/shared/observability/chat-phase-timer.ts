import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import {
  chatPhaseDurationSeconds,
  chatPhaseErrorsTotal,
} from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';

/**
 * RAII timer for chat pipeline phases (stt, llm, tts).
 *
 * Fail-open everywhere: Langfuse/Prom/logger throws cannot propagate into the chat path.
 *
 * Spans are standalone traces in V1 (no `async_hooks`-based current trace) — correlated
 * across phases via shared `requestId` metadata.
 *
 * SEC/GDPR: NO PII in span metadata. Admissible only: `textLength`, `audioBytes`,
 * `voiceId`, `transcriptLength`. NEVER raw transcripts/audio/user text.
 */

export type ChatPhase = 'stt' | 'llm' | 'tts';

export type ChatPhaseOutcome = 'success' | 'error' | 'timeout';

/** Stable taxonomy for the `error_type` Prom label — bounded cardinality. */
export type ChatPhaseErrorType = 'timeout' | 'upstream_5xx' | 'abort' | 'unknown';

interface ChatPhaseTimerOptions {
  readonly model?: string;
  /** MUST NOT include PII — structural fields only (lengths, byte counts, ids). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface LangfuseTraceLike {
  update?(args: { output?: unknown; metadata?: Record<string, unknown> }): void;
}

interface ChatPhaseTimerState {
  readonly phase: ChatPhase;
  readonly provider: string;
  readonly requestId: string;
  readonly startedAtMs: number;
  readonly trace: LangfuseTraceLike | undefined;
  readonly options: ChatPhaseTimerOptions;
}

const SPAN_NAMES: Readonly<Record<ChatPhase, string>> = {
  stt: 'audio.stt.transcribe',
  llm: 'llm.orchestrate',
  tts: 'audio.tts.synthesize',
} as const;

/** Construct via {@link ChatPhaseTimer.start}; close exactly once via {@link end}. */
export class ChatPhaseTimer {
  private ended = false;

  private constructor(private readonly state: ChatPhaseTimerState) {}

  static start(
    phase: ChatPhase,
    provider: string,
    requestId: string,
    options: ChatPhaseTimerOptions = {},
  ): ChatPhaseTimer {
    const startedAtMs = Date.now();
    const lf = getLangfuse();
    const trace = safeTrace('chatPhaseTimer.trace.create', () =>
      lf?.trace({
        name: SPAN_NAMES[phase],
        metadata: {
          phase,
          provider,
          requestId,
          ...(options.model !== undefined ? { model: options.model } : {}),
          ...(options.metadata ?? {}),
        },
      }),
    );
    return new ChatPhaseTimer({
      phase,
      provider,
      requestId,
      startedAtMs,
      trace: trace,
      options,
    });
  }

  /** Idempotent. Records histogram, updates Langfuse span, logs `chat_phase_complete`. */
  end(outcome: ChatPhaseOutcome = 'success', errorType: ChatPhaseErrorType = 'unknown'): void {
    if (this.ended) return;
    this.ended = true;
    const { phase, provider, requestId, startedAtMs, trace, options } = this.state;
    const latencyMs = Date.now() - startedAtMs;
    const latencySec = latencyMs / 1000;

    try {
      chatPhaseDurationSeconds.observe({ phase, provider }, latencySec);
    } catch (err) {
      logger.warn('chat_phase_metric_drop', {
        phase,
        provider,
        requestId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (outcome === 'error') {
      try {
        chatPhaseErrorsTotal.inc({ phase, provider, error_type: errorType });
      } catch {
        // swallow — metric drop is fail-open per UFR-013
      }
    }

    safeTrace('chatPhaseTimer.trace.update', () => {
      trace?.update?.({
        output: { latencyMs, outcome },
        metadata: {
          phase,
          provider,
          requestId,
          latencyMs,
          outcome,
          ...(outcome === 'error' ? { errorType } : {}),
          ...(options.model !== undefined ? { model: options.model } : {}),
          ...(options.metadata ?? {}),
        },
      });
    });

    try {
      logger.info('chat_phase_complete', {
        phase,
        provider,
        requestId,
        latencyMs,
        outcome,
        ...(outcome === 'error' ? { errorType } : {}),
      });
    } catch {
      // swallow — logger throw is fatal-class but never blocks chat path
    }
  }
}
