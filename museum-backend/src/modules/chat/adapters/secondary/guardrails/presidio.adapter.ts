import { logger } from '@shared/logger/logger';

import type {
  GuardrailInput,
  GuardrailOutput,
  GuardrailProvider,
  GuardrailVerdict,
  ProviderHealth,
  ProviderMetricsSnapshot,
} from '@modules/chat/domain/ports/guardrail-provider.port';

/**
 * OWASP LLM02 (Sensitive Information Disclosure) coverage. PERSON/LOCATION
 * are soft PII (artist names / museum cities are valid art content) → tune
 * threshold lower. NRP covers OWASP LLM06 discrimination signals.
 * Conservative defaults — ADR-051 governs pre-promotion adjustments.
 */
const DEFAULT_ENTITY_TYPES: readonly string[] = [
  'EMAIL_ADDRESS',
  'PHONE_NUMBER',
  'PERSON',
  'LOCATION',
  'CREDIT_CARD',
  'IBAN_CODE',
  'IP_ADDRESS',
  'US_SSN',
  'US_PASSPORT',
  'CRYPTO',
  'NRP',
];

/** Presidio `RecognizerResult.to_dict()` shape. */
interface PresidioAnalyzeEntity {
  entity_type: string;
  start: number;
  end: number;
  score: number;
}

/** Flask wrapper response — only `text` is used at this boundary. */
interface PresidioAnonymizeResponse {
  text: string;
  items?: unknown[];
}

interface MicrosoftPresidioAdapterOptions {
  baseUrl: string;
  /** Hard request timeout in ms. Fail-CLOSED on elapsed. */
  timeoutMs: number;
  fetchFn?: typeof fetch;
  /** Analyzer-side filter (Presidio default 0.5). */
  scoreThreshold?: number;
  /**
   * Local block cutoff. score >= blockThreshold → block (reason='pii');
   * else → /anonymize redact + allow + redactedText.
   */
  blockThreshold?: number;
  allowedEntityTypes?: readonly string[];
}

/**
 * Microsoft Presidio analyzer + anonymizer behind GuardrailProvider port
 * (ADR-048). Coverage extends OWASP LLM02 beyond regex (email/phone only) to
 * PERSON, LOCATION, CREDIT_CARD, IBAN, IP, SSN, passport, crypto, NRP.
 *
 * Fail-CLOSED on every error (ADR-047) — network, non-OK, malformed, timeout
 * → `{ allow: false, reason: 'service_unavailable' }`. Never allow on error.
 *
 * Constructor-swap compatible with LLMGuardAdapter. Not activated yet
 * (ADR-051 — adapters ready, no shadow run).
 *
 * Local metrics only (no Prometheus); consumed by /api/health/deep + bias aggregator.
 */
export class MicrosoftPresidioAdapter implements GuardrailProvider {
  readonly name = 'microsoft-presidio';

  /** Bump on docker-compose pin / recognizer-set change (ADR-048). */
  readonly version = 'presidio-2.2';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly scoreThreshold: number;
  private readonly blockThreshold: number;
  private readonly entityTypes: readonly string[];

  // Local cumulative-since-process-start counters.
  private _metricsRequests = 0;
  private _metricsBlocks = 0;
  private _metricsErrors = 0;

  constructor(options: MicrosoftPresidioAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
    this.scoreThreshold = options.scoreThreshold ?? 0.5;
    this.blockThreshold = options.blockThreshold ?? 0.85;
    this.entityTypes = options.allowedEntityTypes ?? DEFAULT_ENTITY_TYPES;
  }

  /**
   * Decision ladder (shared with checkOutput — symmetric threat model):
   *   1. score >= blockThreshold → block, reason='pii'
   *   2. score >= scoreThreshold → allow + redactedText
   *   3. no entities              → allow
   * Fail-CLOSED on any error.
   */
  async checkInput(input: GuardrailInput): Promise<GuardrailVerdict> {
    return await this.analyzeAndDecide(input.text, input.locale);
  }

  async checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict> {
    return await this.analyzeAndDecide(output.text, output.locale);
  }

  /** Deep probe — never throws. */
  async health(): Promise<ProviderHealth> {
    const lastCheckedAt = new Date().toISOString();
    const start = process.hrtime.bigint();
    try {
      const entities = await this.callAnalyze('hello world', 'en');
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      if (!Array.isArray(entities)) {
        return { status: 'degraded', latencyMs, lastCheckedAt, detail: 'malformed_probe_response' };
      }
      return { status: 'up', latencyMs, lastCheckedAt };
    } catch (error) {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      const detail = error instanceof Error ? error.message : String(error);
      return { status: 'down', latencyMs, lastCheckedAt, detail };
    }
  }

  metrics(): ProviderMetricsSnapshot {
    return {
      requests: this._metricsRequests,
      blocks: this._metricsBlocks,
      errors: this._metricsErrors,
    };
  }

  private async analyzeAndDecide(
    text: string,
    locale: string | undefined,
  ): Promise<GuardrailVerdict> {
    this._metricsRequests += 1;
    const language = this.normalizeLocale(locale);
    let entities: PresidioAnalyzeEntity[];
    try {
      entities = await this.callAnalyze(text, language);
    } catch (error) {
      this._metricsErrors += 1;
      this._metricsBlocks += 1;
      const kind = this.classifyError(error);
      logger.warn('presidio_fail_closed', { kind, op: 'analyze' });
      return this.failClosed('service_unavailable');
    }

    if (entities.length === 0) {
      return this.allow();
    }

    const maxScore = entities.reduce((acc, e) => (e.score > acc ? e.score : acc), 0);
    if (maxScore >= this.blockThreshold) {
      this._metricsBlocks += 1;
      return {
        version: 'v1',
        allow: false,
        reason: 'pii',
        confidence: maxScore,
        providedBy: { name: this.name, version: this.version },
      };
    }

    // Anonymizer failure → fail-CLOSED (don't leak original on redactor crash).
    try {
      const redactedText = await this.callAnonymize(text, language, entities);
      return {
        version: 'v1',
        allow: true,
        redactedText,
        confidence: maxScore,
        providedBy: { name: this.name, version: this.version },
      };
    } catch (error) {
      this._metricsErrors += 1;
      this._metricsBlocks += 1;
      const kind = this.classifyError(error);
      logger.warn('presidio_fail_closed', { kind, op: 'anonymize' });
      return this.failClosed('service_unavailable');
    }
  }

  /** @throws {Error} on non-OK / network / abort / malformed. */
  private async callAnalyze(text: string, language: string): Promise<PresidioAnalyzeEntity[]> {
    const payload = {
      text,
      language,
      score_threshold: this.scoreThreshold,
      entities: this.entityTypes,
    };
    const response = await this.requestWithTimeout('/analyze', payload);
    const raw = await response.json();
    if (!Array.isArray(raw)) {
      throw new Error('malformed_analyze_response');
    }
    // Drop incomplete rows silently (Presidio occasionally omits optionals).
    return raw.filter(this.isAnalyzeEntity);
  }

  private async callAnonymize(
    text: string,
    language: string,
    entities: readonly PresidioAnalyzeEntity[],
  ): Promise<string> {
    const payload = {
      text,
      anonymizers: {
        DEFAULT: { type: 'replace', new_value: '<REDACTED>' },
      },
      analyzer_results: entities,
      language,
    };
    const response = await this.requestWithTimeout('/anonymize', payload);
    const raw = (await response.json()) as Partial<PresidioAnonymizeResponse>;
    if (typeof raw.text !== 'string') {
      throw new Error('malformed_anonymize_response');
    }
    return raw.text;
  }

  private async requestWithTimeout(path: string, body: Record<string, unknown>): Promise<Response> {
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
        throw new Error(`non_ok_${response.status}`);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  private readonly isAnalyzeEntity = (e: unknown): e is PresidioAnalyzeEntity => {
    if (typeof e !== 'object' || e === null) return false;
    const candidate = e as Record<string, unknown>;
    return (
      typeof candidate.entity_type === 'string' &&
      typeof candidate.start === 'number' &&
      typeof candidate.end === 'number' &&
      typeof candidate.score === 'number'
    );
  };

  /** Presidio expects 2-letter codes; strip region (`fr-FR` → `fr`). */
  private normalizeLocale(locale: string | undefined): string {
    if (!locale) return 'en';
    return locale.toLowerCase().split('-')[0] ?? 'en';
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

  private allow(): GuardrailVerdict {
    return {
      version: 'v1',
      allow: true,
      providedBy: { name: this.name, version: this.version },
    };
  }
}
