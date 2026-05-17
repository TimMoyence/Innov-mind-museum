import { logger } from '@shared/logger/logger';

import type {
  GuardrailBlockReason,
  GuardrailInput,
  GuardrailOutput,
  GuardrailProvider,
  GuardrailVerdict,
  ProviderHealth,
  ProviderMetricsSnapshot,
} from '@modules/chat/domain/ports/guardrail-provider.port';

/**
 * Llama-Prompt-Guard-2-86M binary classifier (BENIGN|MALICIOUS, score ∈ [0,1]).
 * v2 collapsed v1's 3-label scheme — sidecar may optionally split via
 * injection_score/jailbreak_score; absent → fallback `prompt_injection` reason.
 * Card: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
 */
interface PromptGuardResponse {
  label: 'BENIGN' | 'MALICIOUS';
  score: number;
  injection_score?: number;
  jailbreak_score?: number;
}

interface LlamaPromptGuardAdapterOptions {
  baseUrl: string;
  /** Hard request timeout in ms. Fail-CLOSED on elapsed. */
  timeoutMs: number;
  fetchFn?: typeof fetch;
  /** Default 0.8 (Meta-recommended for 86M at 1% FPR). */
  scoreThreshold?: number;
}

/**
 * Llama Prompt Guard 2 86M sidecar (OWASP LLM01 + LLM07).
 * mDeBERTa 86M, multilingual (8 incl. French), CPU 150-400ms.
 * Constructor-swap with LLMGuardAdapter. Not activated yet (ADR-051).
 *
 * Fail-CLOSED on every error (ADR-047/048) — never allow on error.
 */
export class LlamaPromptGuardAdapter implements GuardrailProvider {
  readonly name = 'llama-prompt-guard-2';

  /** Bump on model swap / threshold / sidecar template change (ADR-048). */
  readonly version = 'llama-prompt-guard-2-86m';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly scoreThreshold: number;

  private _metricsRequests = 0;
  private _metricsBlocks = 0;
  private _metricsErrors = 0;

  constructor(options: LlamaPromptGuardAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
    this.scoreThreshold = options.scoreThreshold ?? 0.8;
  }

  /** Fail-CLOSED on error. */
  async checkInput(input: GuardrailInput): Promise<GuardrailVerdict> {
    return await this.classify(input.text);
  }

  /** Symmetric — catches outputs echoing prior injection. Fail-CLOSED on error. */
  async checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict> {
    return await this.classify(output.text);
  }

  /** Deep probe; malformed_* → degraded (vs hard network = down). Never throws. */
  async health(): Promise<ProviderHealth> {
    const lastCheckedAt = new Date().toISOString();
    const start = process.hrtime.bigint();
    try {
      await this.callClassify('hello art');
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      return { status: 'up', latencyMs, lastCheckedAt };
    } catch (error) {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      const detail = error instanceof Error ? error.message : String(error);
      const status: ProviderHealth['status'] = detail.startsWith('malformed_')
        ? 'degraded'
        : 'down';
      return { status, latencyMs, lastCheckedAt, detail };
    }
  }

  metrics(): ProviderMetricsSnapshot {
    return {
      requests: this._metricsRequests,
      blocks: this._metricsBlocks,
      errors: this._metricsErrors,
    };
  }

  private async classify(text: string): Promise<GuardrailVerdict> {
    this._metricsRequests += 1;
    let raw: PromptGuardResponse;
    try {
      raw = await this.callClassify(text);
    } catch (error) {
      this._metricsErrors += 1;
      this._metricsBlocks += 1;
      const kind = this.classifyError(error);
      logger.warn('llama_prompt_guard_fail_closed', { kind });
      return this.failClosed('service_unavailable');
    }

    if (raw.label === 'BENIGN' || raw.score < this.scoreThreshold) {
      return {
        version: 'v1',
        allow: true,
        confidence: 1 - raw.score,
        providedBy: { name: this.name, version: this.version },
      };
    }

    // MALICIOUS — use split scores when present, else fall back to prompt_injection.
    const reason = this.mapReason(raw);
    this._metricsBlocks += 1;
    return {
      version: 'v1',
      allow: false,
      reason,
      confidence: raw.score,
      providedBy: { name: this.name, version: this.version },
    };
  }

  /** Default `prompt_injection` (jailbreak is a kind of injection at port level). */
  private mapReason(raw: PromptGuardResponse): GuardrailBlockReason {
    if (typeof raw.jailbreak_score === 'number' && typeof raw.injection_score === 'number') {
      return raw.jailbreak_score > raw.injection_score ? 'jailbreak' : 'prompt_injection';
    }
    return 'prompt_injection';
  }

  /** @throws on non-OK / network / abort / malformed. */
  private async callClassify(text: string): Promise<PromptGuardResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`non_ok_${response.status}`);
      }
      const raw = (await response.json()) as Partial<PromptGuardResponse>;
      if ((raw.label !== 'BENIGN' && raw.label !== 'MALICIOUS') || typeof raw.score !== 'number') {
        throw new Error('malformed_classify_response');
      }
      return raw as PromptGuardResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  private classifyError(error: unknown): 'timeout' | 'network' | 'malformed' {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('abort')) return 'timeout';
    if (message.startsWith('malformed_')) return 'malformed';
    return 'network';
  }

  private failClosed(reason: 'service_unavailable'): GuardrailVerdict {
    return {
      version: 'v1',
      allow: false,
      reason,
      providedBy: { name: this.name, version: this.version },
    };
  }
}
