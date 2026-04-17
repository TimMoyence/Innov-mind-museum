import { logger } from '@shared/logger/logger';

import type {
  AdvancedGuardrail,
  AdvancedGuardrailBlockReason,
  AdvancedGuardrailDecision,
  AdvancedGuardrailInput,
  AdvancedGuardrailOutput,
} from '../../../domain/ports/advanced-guardrail.port';

/**
 * Wire-level response expected from the LLM Guard sidecar.
 *
 * The POC sidecar (python-llm-guard FastAPI wrapper) exposes:
 *   POST {baseUrl}/scan/prompt  → ScanResponse
 *   POST {baseUrl}/scan/output  → ScanResponse
 *
 * The field names mirror LLM Guard's own naming so the adapter stays a thin
 * translator — any shape drift in the sidecar is isolated to this file.
 */
interface ScanResponse {
  is_valid: boolean;
  sanitized?: string;
  risk_score?: number;
  reason?: string;
}

interface LLMGuardAdapterOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Optional fetch override — enables unit testing without an HTTP server. */
  fetchFn?: typeof fetch;
}

/**
 * Lookup table: substring in the sidecar reason → canonical block reason.
 * Order matters — first match wins, so narrower/higher-priority patterns
 * (jailbreak, PII) come before broader ones (inject).
 */
const REASON_PATTERNS: readonly [substring: string, mapped: AdvancedGuardrailBlockReason][] = [
  ['jailbreak', 'jailbreak'],
  ['dan', 'jailbreak'],
  ['pii', 'pii'],
  ['anonymiz', 'pii'],
  ['toxic', 'toxicity'],
  ['ban', 'off_topic'],
  ['topic', 'off_topic'],
  ['bias', 'bias'],
  ['exfil', 'data_exfiltration'],
  ['secret', 'data_exfiltration'],
  ['schema', 'schema_violation'],
  ['json', 'schema_violation'],
  ['inject', 'prompt_injection'],
];

/**
 * Maps LLM Guard's free-form reason string to our finite block reason union.
 *
 * Unknown reasons collapse to 'prompt_injection' (safest default) rather than
 * 'error' — the sidecar did respond, it just flagged a category we don't track
 * explicitly. 'error' is reserved for fail-CLOSED cases where we could NOT
 * determine safety.
 */
const mapReason = (raw: string | undefined): AdvancedGuardrailBlockReason => {
  if (!raw) return 'prompt_injection';
  const normalized = raw.toLowerCase();
  for (const [substring, mapped] of REASON_PATTERNS) {
    if (normalized.includes(substring)) return mapped;
  }
  return 'prompt_injection';
};

/**
 * Secondary adapter: wraps the LLM Guard Python sidecar behind our hexagonal
 * AdvancedGuardrail port. Every network operation honours the configured
 * timeout and fails CLOSED on any error (network, HTTP ≥ 400, malformed JSON).
 *
 * Activation: `env.guardrails.candidate === 'llm-guard'` in chat-module.ts.
 */
export class LLMGuardAdapter implements AdvancedGuardrail {
  readonly name = 'llm-guard';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: LLMGuardAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /** Scans user input against the sidecar's prompt endpoint. Fail-CLOSED on error. */
  async checkInput(input: AdvancedGuardrailInput): Promise<AdvancedGuardrailDecision> {
    return await this.scan('/scan/prompt', { prompt: input.text, locale: input.locale });
  }

  /** Scans LLM output against the sidecar's output endpoint. Fail-CLOSED on error. */
  async checkOutput(output: AdvancedGuardrailOutput): Promise<AdvancedGuardrailDecision> {
    return await this.scan('/scan/output', {
      prompt: output.userInput ?? '',
      output: output.text,
      locale: output.locale,
    });
  }

  private async scan(
    path: string,
    body: Record<string, unknown>,
  ): Promise<AdvancedGuardrailDecision> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn('llm_guard_non_ok_fail_closed', { status: response.status, path });
        return { allow: false, reason: 'error' };
      }

      const raw = (await response.json()) as Partial<ScanResponse>;
      if (typeof raw.is_valid !== 'boolean') {
        logger.warn('llm_guard_malformed_fail_closed', { path });
        return { allow: false, reason: 'error' };
      }

      if (raw.is_valid) {
        return {
          allow: true,
          confidence: typeof raw.risk_score === 'number' ? 1 - raw.risk_score : undefined,
          redactedText: raw.sanitized,
        };
      }

      return {
        allow: false,
        reason: mapReason(raw.reason),
        confidence: typeof raw.risk_score === 'number' ? raw.risk_score : undefined,
        redactedText: raw.sanitized,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const kind = message.toLowerCase().includes('abort') ? 'timeout' : 'network';
      logger.warn('llm_guard_fail_closed', { kind, path, error: message });
      return { allow: false, reason: 'error' };
    } finally {
      clearTimeout(timer);
    }
  }
}
