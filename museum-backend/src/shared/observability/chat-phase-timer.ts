import { logger } from '@shared/logger/logger';

export type ChatPhase = 'stt' | 'llm' | 'tts';

export type ChatPhaseOutcome = 'success' | 'error' | 'timeout';

export type ChatPhaseErrorType = 'timeout' | 'upstream_5xx' | 'abort' | 'unknown';

interface ChatPhaseTimerState {
  readonly phase: ChatPhase;
  readonly provider: string;
  readonly requestId: string;
  readonly startedAtMs: number;
}

export class ChatPhaseTimer {
  private ended = false;

  private constructor(private readonly state: ChatPhaseTimerState) {}

  static start(phase: ChatPhase, provider: string, requestId: string): ChatPhaseTimer {
    return new ChatPhaseTimer({ phase, provider, requestId, startedAtMs: Date.now() });
  }

  end(outcome: ChatPhaseOutcome = 'success', errorType: ChatPhaseErrorType = 'unknown'): void {
    if (this.ended) return;
    this.ended = true;
    const { phase, provider, requestId, startedAtMs } = this.state;
    logger.info('chat_phase_complete', {
      phase,
      provider,
      requestId,
      latencyMs: Date.now() - startedAtMs,
      outcome,
      ...(outcome === 'error' ? { errorType } : {}),
    });
  }
}
