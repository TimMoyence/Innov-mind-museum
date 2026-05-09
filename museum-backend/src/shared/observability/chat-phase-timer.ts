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
 * On `start()` it captures a high-resolution start time and opens a Langfuse
 * span carrying `{ phase, provider, requestId, model? }` metadata. On `end()`
 * it observes the Prometheus histogram `chat_phase_duration_seconds{phase,
 * provider}` and closes the Langfuse span with the elapsed duration. Errors
 * also bump the `chat_phase_errors_total{phase, provider, error_type}`
 * counter.
 *
 * Fail-open everywhere: a Langfuse SDK throw, a Prom client throw, or a
 * logger throw cannot propagate into the chat path. The chat request always
 * wins.
 *
 * Spans are emitted as standalone traces in V1 — there is no thread-local
 * "current trace" in Node.js without `async_hooks`, and propagating a parent
 * trace through every adapter port would expand the public port surface.
 * Spans are correlated across phases via the shared `requestId` metadata
 * field. Parent-child consolidation is tracked as a follow-up if Langfuse
 * UX makes the standalone form noisy in practice.
 *
 * NO PII is captured in span metadata. Per `team-state/2026-05-08-c1-chat-fast/
 * design.md` §7 + §10: only `textLength` / `audioBytes` / `voiceId` /
 * `transcriptLength` are admissible — never raw transcripts, never raw audio
 * bytes, never user-provided text content.
 */

/** Phase identifier in the chat pipeline. Values match the Prom `phase` label set. */
export type ChatPhase = 'stt' | 'llm' | 'tts';

/** Terminal outcome of a phase. Mapped onto the Prom `outcome` label set. */
export type ChatPhaseOutcome = 'success' | 'error' | 'timeout';

/**
 * Stable taxonomy for the `error_type` Prom label. Keep small to bound
 * cardinality. Add a new variant only when a new operationally meaningful
 * class of error needs distinct alerting.
 */
export type ChatPhaseErrorType = 'timeout' | 'upstream_5xx' | 'abort' | 'unknown';

interface ChatPhaseTimerOptions {
  /**
   * Optional model name surfaced in Langfuse span metadata. Bound is per-phase
   * configuration (e.g. STT model `gpt-4o-mini-transcribe`); deliberately not
   * a Prom label — that would explode cardinality.
   */
  readonly model?: string;
  /**
   * Optional extra metadata for the Langfuse span. MUST NOT include any PII
   * (raw transcripts, raw audio, user-typed text). Only structural fields
   * (lengths, byte counts, ids).
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Subset of the Langfuse trace API the timer consumes. Kept narrow on purpose — the SDK exposes more. */
interface LangfuseTraceLike {
  update?(args: { output?: unknown; metadata?: Record<string, unknown> }): void;
}

/**
 * Internal frozen state captured at `start()` and closed at `end()`. Held in
 * a single object so the constructor stays under the codebase's max-params
 * bar (5).
 */
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

/**
 * Records the outcome of a single chat-pipeline phase. Construct via
 * {@link ChatPhaseTimer.start}; close exactly once via {@link end}.
 */
export class ChatPhaseTimer {
  private ended = false;

  private constructor(private readonly state: ChatPhaseTimerState) {}

  /**
   * Opens a phase timer. Returns a closed-on-end instance. Calling this is
   * cheap when Langfuse is disabled (one nullable read inside `safeTrace`).
   */
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
      trace: trace as LangfuseTraceLike | undefined,
      options,
    });
  }

  /**
   * Closes the timer. Records the histogram observation, updates + flushes
   * the Langfuse span, and emits a `chat_phase_complete` log line. On
   * `outcome='error'`, also bumps `chat_phase_errors_total`. Calling `end()`
   * twice is a no-op (defensive).
   */
  end(
    outcome: ChatPhaseOutcome = 'success',
    errorType: ChatPhaseErrorType = 'unknown',
  ): void {
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
