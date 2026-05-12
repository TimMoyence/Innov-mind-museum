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
 * Default Presidio entity types covered for Musaium. Curated to align with
 * the OWASP LLM02 (Sensitive Information Disclosure) gap analysis in
 * `team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-owasp-llm-top10.md`:
 *
 *   - Email, phone, IP, IBAN, credit card, SSN, passport, crypto wallet —
 *     financial/contact PII the current `RegexPiiSanitizer` does not cover.
 *   - PERSON, LOCATION — soft PII flagged for redaction with a *lower*
 *     score threshold by default (artist names, museum cities are valid art
 *     content, NOT PII at high confidence). The composition root will tune
 *     thresholds per the Phase 1 shadow-mode bake.
 *   - NRP — nationality / religious / political group references, listed
 *     for OWASP LLM06 (Excessive Agency / discrimination signals) breadth.
 *
 * Conservative defaults; ADR-050 documents the criteria for adjusting this
 * list pre-promotion to active.
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

/**
 * Wire-level entity entry returned by `POST /analyze`. Mirrors the Presidio
 * `RecognizerResult.to_dict()` shape (see
 * https://microsoft.github.io/presidio/api/analyzer_python/ + the Flask
 * REST wrapper).
 */
interface PresidioAnalyzeEntity {
  entity_type: string;
  start: number;
  end: number;
  score: number;
}

/**
 * Wire-level response from `POST /anonymize`. The Flask wrapper returns a
 * JSON object with a `text` field carrying the redacted output, plus an
 * `items` array describing the operations applied. Only `text` is required
 * by this adapter — `items` is ignored at the port boundary.
 */
interface PresidioAnonymizeResponse {
  text: string;
  items?: unknown[];
}

/** Options accepted by {@link MicrosoftPresidioAdapter}. */
interface MicrosoftPresidioAdapterOptions {
  /** Base URL of the Presidio analyzer + anonymizer service(s). */
  baseUrl: string;
  /** Hard request timeout (ms). Fail-CLOSED on elapsed. */
  timeoutMs: number;
  /** Optional fetch override — enables unit testing without an HTTP server. */
  fetchFn?: typeof fetch;
  /**
   * Per-entity score threshold passed to Presidio's analyzer. Entities
   * whose `score` is below this are NOT returned (analyzer-side filter).
   * Defaults to 0.5 per Presidio's own documentation default; tunable via
   * env so operators can dial sensitivity per-tenant in Phase 2.
   */
  scoreThreshold?: number;
  /**
   * High-confidence block threshold applied locally to the analyzer
   * response. Any entity with `score >= blockThreshold` flips the verdict
   * to `{ allow: false, reason: 'pii' }`. Lower-confidence hits trigger
   * redaction via `/anonymize` and pass through as `{ allow: true,
   * redactedText }`.
   */
  blockThreshold?: number;
  /** Entity types Presidio is asked to detect. Defaults to {@link DEFAULT_ENTITY_TYPES}. */
  allowedEntityTypes?: readonly string[];
}

/**
 * Secondary adapter wrapping a Microsoft Presidio analyzer + anonymizer
 * sidecar pair behind the ADR-048 `GuardrailProvider` port.
 *
 * Coverage: PII NER detection (OWASP LLM02 gap — current `RegexPiiSanitizer`
 * is email + phone only; Presidio adds PERSON, LOCATION, CREDIT_CARD, IBAN,
 * IP, SSN, passport, crypto, NRP and is actively maintained by Microsoft).
 *
 * Form factor: matches the existing `LLMGuardAdapter` shape so wiring in the
 * chat-module composition root is a constructor swap; not activated yet
 * (ADR-050 — adapters ready, no shadow run, no production traffic).
 *
 * Fail-CLOSED contract (per ADR-047 + ADR-048): network error, non-OK HTTP,
 * malformed JSON, or timeout → `{ allow: false, reason: 'service_unavailable',
 * providedBy }`. Never returns `allow: true` on error.
 *
 * Local-only metrics counters (no Prometheus coupling — the port's
 * `metrics()` snapshot is consumed by `/api/health/deep` and the bias-
 * monitoring aggregator).
 */
export class MicrosoftPresidioAdapter implements GuardrailProvider {
  /** Stable port-level identifier — used for telemetry, env-flag matching, logs. */
  readonly name = 'microsoft-presidio';

  /**
   * Behavioural version stamp. `presidio-2.2` reflects the docker-compose-
   * pinned analyzer/anonymizer image major.minor. Bump on any pin change or
   * recognizer set change that may shift decisions (ADR-048 contract).
   */
  readonly version = 'presidio-2.2';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly scoreThreshold: number;
  private readonly blockThreshold: number;
  private readonly entityTypes: readonly string[];

  // ── Local cumulative-since-process-start counters (mirror LLMGuardAdapter).
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
   * Scans user input for PII. Fail-CLOSED on any error.
   *
   * Decision ladder:
   *   1. Any entity with `score >= blockThreshold`  → block, reason='pii'.
   *   2. Any entity with `score >= scoreThreshold`  → allow + redactedText.
   *   3. No entities returned                       → allow.
   */
  async checkInput(input: GuardrailInput): Promise<GuardrailVerdict> {
    return await this.analyzeAndDecide(input.text, input.locale);
  }

  /**
   * Scans assistant output for PII leakage. Same decision ladder as
   * {@link checkInput} — the threat model (leaking a user-supplied PII back
   * into the conversation, or fabricating one) is symmetric.
   */
  async checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict> {
    return await this.analyzeAndDecide(output.text, output.locale);
  }

  /**
   * Deep health probe — exercises `/analyze` with a known-benign payload
   * and reports observed latency. Distinct from a TCP-up check: a service
   * that returns 200 with an unexpected shape registers as `degraded`, not
   * `up`. Never throws.
   */
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

  /** Local cumulative-since-process-start metrics snapshot. */
  metrics(): ProviderMetricsSnapshot {
    return {
      requests: this._metricsRequests,
      blocks: this._metricsBlocks,
      errors: this._metricsErrors,
    };
  }

  /**
   * Core decision pipeline shared by `checkInput` / `checkOutput`. Centralised
   * so the fail-CLOSED contract and metrics bookkeeping stay consistent.
   */
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

    // Lower-confidence hits: ask the anonymizer for a sanitized variant and
    // pass it downstream. If anonymization itself fails, fail-CLOSED — we
    // refuse to leak the original text just because the redactor is sick.
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

  /** POST /analyze with timeout. Throws on non-OK / network / abort / malformed. */
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
    // Defensive shape narrowing — Presidio occasionally returns rows missing
    // optional fields. Anything that does not match `{entity_type, start,
    // end, score}` is dropped silently rather than throw, matching the
    // wider "be liberal in what you accept" REST contract.
    return raw.filter(this.isAnalyzeEntity);
  }

  /** POST /anonymize with timeout. Returns redacted text. */
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

  /** Shared `fetch` wrapper applying the configured timeout + base URL. */
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

  /** Type guard for `PresidioAnalyzeEntity` — defensive on REST responses. */
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

  /** Map locale hint to Presidio language code, defaulting to English. */
  private normalizeLocale(locale: string | undefined): string {
    if (!locale) return 'en';
    // Presidio expects 2-letter codes ('en', 'fr', 'es'...) and ships
    // predefined French recognizers. Strip region tags (`fr-FR` → `fr`).
    return locale.toLowerCase().split('-')[0] ?? 'en';
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

  /** Allow-no-redaction verdict stamp. */
  private allow(): GuardrailVerdict {
    return {
      version: 'v1',
      allow: true,
      providedBy: { name: this.name, version: this.version },
    };
  }
}
