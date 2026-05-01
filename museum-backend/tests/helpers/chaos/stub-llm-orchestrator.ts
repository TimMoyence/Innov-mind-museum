export type OrchestratorErrorKind = 'llm-provider-error' | 'timeout' | 'quota-exceeded';

export interface StubLLMOrchestratorOptions {
  /** Number of consecutive calls that throw before returning fallback. Default: never throws. */
  failuresBeforeFallback?: number;
  /** Throw type. Default: 'llm-provider-error'. */
  errorKind?: OrchestratorErrorKind;
  /** When set, every call returns this fallback text instead of attempting. */
  forceFallbackText?: string;
}

interface OrchestratorGenerateResult {
  text: string;
  metadata: Record<string, unknown>;
}

/**
 * Test-only ChatOrchestrator that injects failures.
 *
 * Matches the shape used by the existing e2e harness (inline orchestrator
 * with generate() + generateStream()). Used in Phase 6 chaos e2e tests to
 * exercise the LLM-provider-down + circuit-breaker contracts.
 */
export class StubLLMOrchestrator {
  private callCount = 0;

  constructor(private readonly opts: StubLLMOrchestratorOptions = {}) {}

  callsMade(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }

  async generate(_input: unknown): Promise<OrchestratorGenerateResult> {
    return this.next();
  }

  async generateStream(
    _input: unknown,
    onChunk: (t: string) => void,
  ): Promise<OrchestratorGenerateResult> {
    const result = await this.next();
    if (result.text) onChunk(result.text);
    return result;
  }

  private async next(): Promise<OrchestratorGenerateResult> {
    this.callCount += 1;
    if (this.opts.forceFallbackText) {
      return { text: this.opts.forceFallbackText, metadata: { stub: 'force-fallback' } };
    }
    const limit = this.opts.failuresBeforeFallback ?? Number.MAX_SAFE_INTEGER;
    if (this.callCount <= limit) {
      throw this.makeError();
    }
    return {
      text: 'Phase 6 stub fallback (after threshold)',
      metadata: { stub: 'after-threshold', callCount: this.callCount },
    };
  }

  private makeError(): Error {
    const kind = this.opts.errorKind ?? 'llm-provider-error';
    if (kind === 'timeout') {
      const err = new Error('LLM provider timeout');
      (err as Error & { code: string }).code = 'ETIMEDOUT';
      return err;
    }
    if (kind === 'quota-exceeded') {
      const err = new Error('LLM provider quota exceeded');
      (err as Error & { code: string; statusCode: number }).code = 'QUOTA_EXCEEDED';
      (err as Error & { code: string; statusCode: number }).statusCode = 429;
      return err;
    }
    const err = new Error('LLM provider 500');
    (err as Error & { statusCode: number }).statusCode = 500;
    return err;
  }
}
