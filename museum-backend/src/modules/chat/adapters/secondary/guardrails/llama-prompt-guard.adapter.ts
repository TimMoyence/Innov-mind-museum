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
 * Wire-level response expected from the Llama Prompt Guard 2 86M sidecar.
 *
 * The sidecar wraps the HuggingFace `text-classification` pipeline around
 * `meta-llama/Llama-Prompt-Guard-2-86M`. Per the official HuggingFace model
 * card (verified 2026-05-12), the model is a **binary** classifier — it
 * emits `BENIGN` or `MALICIOUS` per input, with a single confidence score
 * in [0, 1]. The MALICIOUS label conflates direct injection and jailbreak
 * attacks (Meta intentionally collapsed the v1 three-label scheme in v2).
 *
 * The sidecar SHOULD also expose `injection_score` and `jailbreak_score`
 * when the upstream raw logits permit a finer breakdown — useful when
 * mapping to {@link GuardrailBlockReason}. Both are optional; the adapter
 * falls back to a generic `prompt_injection` reason if absent.
 *
 * Spec authoritative URL:
 *   https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
 */
interface PromptGuardResponse {
  /** Top-1 label predicted by the pipeline. */
  label: 'BENIGN' | 'MALICIOUS';
  /** Confidence in [0, 1] for the top-1 label. */
  score: number;
  /** Optional finer-grained injection score (if the sidecar exposes it). */
  injection_score?: number;
  /** Optional finer-grained jailbreak score (if the sidecar exposes it). */
  jailbreak_score?: number;
}

/** Options accepted by {@link LlamaPromptGuardAdapter}. */
interface LlamaPromptGuardAdapterOptions {
  /** Base URL of the Prompt Guard 2 sidecar (FastAPI wrapper). */
  baseUrl: string;
  /** Hard request timeout (ms). Fail-CLOSED on elapsed. Default ceiling 500 ms. */
  timeoutMs: number;
  /** Optional fetch override — enables unit testing without an HTTP server. */
  fetchFn?: typeof fetch;
  /**
   * Confidence threshold above which a MALICIOUS verdict triggers a block.
   * Defaults to 0.8 (Meta-recommended for the 86M model at 1% FPR target,
   * per the HuggingFace model card). Tunable via env so operators can
   * dial sensitivity per the Phase 1 shadow bake.
   */
  scoreThreshold?: number;
}

/**
 * Secondary adapter wrapping the Llama Prompt Guard 2 86M sidecar behind
 * the ADR-048 `GuardrailProvider` port.
 *
 * Coverage: prompt-injection + jailbreak detection (OWASP LLM01 + LLM07).
 * Benchmark: AUC 0.998 / recall 97.5 % @ 1 % FPR (Meta official, mDeBERTa
 * 86M backbone) — vs LLM-Guard incumbent's 0.22 recall on the comparable
 * arXiv 2502.15427 benchmark. The model is multilingual (8 languages
 * including French) and CPU-viable at 150-400 ms typical, matching the
 * VPS hardware envelope without GPU.
 *
 * Form factor: matches `LLMGuardAdapter` so wiring in the chat-module
 * composition root is a constructor swap. Not activated yet (ADR-050) —
 * the adapter is infra-ready, no shadow run, no production traffic.
 *
 * Fail-CLOSED contract (per ADR-047 + ADR-048): network error, non-OK HTTP,
 * malformed JSON, or timeout → `{ allow: false, reason: 'service_unavailable',
 * providedBy }`. Never returns `allow: true` on error.
 */
export class LlamaPromptGuardAdapter implements GuardrailProvider {
  /** Stable port-level identifier — used for telemetry, env-flag matching, logs. */
  readonly name = 'llama-prompt-guard-2';

  /**
   * Behavioural version stamp. Hardcoded to the upstream HF model card
   * revision pinned in the sidecar Dockerfile. Bump on any model swap,
   * threshold change, or sidecar prompt template change (ADR-048 contract).
   */
  readonly version = 'llama-prompt-guard-2-86m';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly scoreThreshold: number;

  // ── Local cumulative-since-process-start counters.
  private _metricsRequests = 0;
  private _metricsBlocks = 0;
  private _metricsErrors = 0;

  constructor(options: LlamaPromptGuardAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
    this.scoreThreshold = options.scoreThreshold ?? 0.8;
  }

  /** Classifies user input as benign vs malicious. Fail-CLOSED on error. */
  async checkInput(input: GuardrailInput): Promise<GuardrailVerdict> {
    return await this.classify(input.text);
  }

  /**
   * Classifies assistant output for prompt-injection echoes / jailbreak
   * leakage. Symmetric with `checkInput` — Prompt Guard 2 treats the input
   * as a generic text classification task, so feeding LLM output to it
   * catches outputs that echo a prior injection ("Sure, here are the
   * instructions you asked me to ignore: …").
   */
  async checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict> {
    return await this.classify(output.text);
  }

  /**
   * Deep health probe — exercises `/classify` with a known-benign payload
   * and reports observed latency. Distinct from a TCP-up check: a sidecar
   * that 200s with a malformed shape registers as `degraded`, not `up`.
   * Never throws.
   */
  async health(): Promise<ProviderHealth> {
    const lastCheckedAt = new Date().toISOString();
    const start = process.hrtime.bigint();
    try {
      // `callClassify` throws on malformed shapes (caught below as `down`),
      // so a successful return implies the wire contract held. The schema
      // guard (BENIGN | MALICIOUS) is enforced inside callClassify; reaching
      // this line means the probe genuinely succeeded.
      await this.callClassify('hello art');
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      return { status: 'up', latencyMs, lastCheckedAt };
    } catch (error) {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      const detail = error instanceof Error ? error.message : String(error);
      // A `malformed_classify_response` raised by callClassify is a
      // partially-working sidecar — distinct from a hard network failure.
      // Map it to `degraded` so the /api/health/deep operator gets a softer
      // signal than `down`.
      const status: ProviderHealth['status'] = detail.startsWith('malformed_')
        ? 'degraded'
        : 'down';
      return { status, latencyMs, lastCheckedAt, detail };
    }
  }

  /** Local cumulative-since-process-start metrics snapshot. */
  metrics(): ProviderMetricsSnapshot {
    return {
      requests: this._metricsRequests,
      blocks: this._metricsBlocks,
      errors: this._metricsErrors,
    };
  }

  /**
   * Core classification path. Centralised so the fail-CLOSED contract and
   * metrics bookkeeping stay consistent across `checkInput` / `checkOutput`.
   */
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

    // MALICIOUS verdict — map to the finer block reason if the sidecar
    // exposed split scores; otherwise default to `prompt_injection` (the
    // safer/broader bucket of the two ADR-048 reasons applicable here).
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

  /**
   * Resolves the block reason from optional split scores. Falls back to
   * `prompt_injection` when no split is provided (the conservative bucket
   * of the two — jailbreak is a *kind* of injection at the port level).
   */
  private mapReason(raw: PromptGuardResponse): GuardrailBlockReason {
    if (typeof raw.jailbreak_score === 'number' && typeof raw.injection_score === 'number') {
      return raw.jailbreak_score > raw.injection_score ? 'jailbreak' : 'prompt_injection';
    }
    return 'prompt_injection';
  }

  /** POST /classify with timeout. Throws on non-OK / network / abort / malformed. */
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

  /** Distinguish AbortError (timeout) from other failure kinds for logging. */
  private classifyError(error: unknown): 'timeout' | 'network' | 'malformed' {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('abort')) return 'timeout';
    if (message.startsWith('malformed_')) return 'malformed';
    return 'network';
  }

  /** Builds the fail-CLOSED verdict stamp once, used across error sites. */
  private failClosed(reason: 'service_unavailable'): GuardrailVerdict {
    return {
      version: 'v1',
      allow: false,
      reason,
      providedBy: { name: this.name, version: this.version },
    };
  }
}
