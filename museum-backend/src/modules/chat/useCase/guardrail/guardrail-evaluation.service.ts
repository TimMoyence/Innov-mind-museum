import { withPolicyCitation } from '@modules/chat/useCase/image/chat-image.helpers';
import { AUDIT_SECURITY_GUARDRAIL_PASS } from '@shared/audit/audit.types';
import { logger } from '@shared/logger/logger';
import {
  guardrailCategoryBlocksTotal,
  guardrailDecisionsTotal,
} from '@shared/observability/prometheus-metrics';
import { env } from '@src/config/env';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
} from './art-topic-guardrail';
import { buildGuardrailBlockAuditEntry } from './guardrail-audit-payload';
import { logInputRedaction } from './guardrail-input-redaction';
import { judgeVerdictToReason, mapProviderReason } from './guardrail-reason-mapping';
import { buildBlockedOutputPayload } from './guardrail-refusal-builder';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { GuardrailAuditContext } from './guardrail-audit-payload';
import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
import type {
  ChatRepository,
  PersistMessageInput,
} from '@modules/chat/domain/session/chat.repository.interface';
import type { JudgeDecision } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { PostMessageResult } from '@modules/chat/useCase/orchestration/chat.service.types';
import type { AuditService } from '@shared/audit/audit.service';

export type { GuardrailAuditContext } from './guardrail-audit-payload';

/** Minimal interface for the art-topic classifier used by the guardrail service. */
export interface ArtTopicClassifierPort {
  isArtRelated(text: string): Promise<boolean>;
}

/** Result of an input guardrail evaluation. */
interface InputGuardrailResult {
  allow: boolean;
  reason?: GuardrailBlockReason;
  /**
   * Sanitized version of the user input when the provider scrubbed PII
   * (LLM02 — Anonymize / Presidio). Callers MUST pass this to the LLM
   * instead of the original text. Never persisted in clear, never logged.
   */
  redactedText?: string;
}

/**
 * F4 (2026-04-30) — callable shape for the LLM-judge second layer. Returns a
 * validated decision or `null` to signal fail-open (timeout / parse / budget).
 *
 * Wired in production by `chat-module.ts` to bind the orchestrator. Tests pass
 * a `jest.fn()` with the same signature.
 */
export type LlmJudgeFn = (message: string) => Promise<JudgeDecision | null>;

/** Dependencies for the guardrail evaluation service. */
interface GuardrailEvaluationServiceDeps {
  repository: ChatRepository;
  audit?: AuditService;
  artTopicClassifier?: ArtTopicClassifierPort;
  /**
   * Optional guardrail provider layer (ADR-048). Runs AFTER the deterministic
   * keyword guardrail and uses the hexagonal `GuardrailProvider` port. When
   * `observeOnly` is true the service logs decisions but never blocks —
   * useful for Phase A rollout of a new candidate.
   */
  guardrailProvider?: GuardrailProvider;
  guardrailProviderObserveOnly?: boolean;
  /**
   * F4 — LLM judge callable. Runs ONLY when `llmJudgeEnabled` is true AND the
   * keyword pre-filter returned allow AND the message length is above the
   * configured threshold. The judge cannot upgrade keyword blocks to allow.
   *
   * `null` from the judge = fail-open (caller falls back to keyword decision).
   */
  llmJudge?: LlmJudgeFn;
  /**
   * F4 — toggle that mirrors `env.guardrails.budgetCentsPerDay > 0`. Kept
   * as an explicit dep so tests can flip it without env mutation.
   */
  llmJudgeEnabled?: boolean;
}

/**
 * Evaluates input and output guardrails, logs audit events for blocked messages,
 * and builds localized refusal responses.
 */
export class GuardrailEvaluationService {
  private readonly repository: ChatRepository;
  private readonly audit?: AuditService;
  private readonly artTopicClassifier?: ArtTopicClassifierPort;
  private readonly guardrailProvider?: GuardrailProvider;
  private readonly guardrailProviderObserveOnly: boolean;
  private readonly llmJudge?: LlmJudgeFn;
  private readonly llmJudgeEnabled: boolean;

  constructor(deps: GuardrailEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.artTopicClassifier = deps.artTopicClassifier;
    this.guardrailProvider = deps.guardrailProvider;
    this.guardrailProviderObserveOnly = deps.guardrailProviderObserveOnly ?? true;
    this.llmJudge = deps.llmJudge;
    this.llmJudgeEnabled = deps.llmJudgeEnabled ?? false;
  }

  /**
   * F4 — runs the LLM judge after the keyword pre-filter has already returned
   * allow. The judge can ONLY downgrade allow → block; never upgrade block →
   * allow (the caller never invokes this when keyword decision is already
   * blocking).
   *
   * Confidence floor of 0.6 — below that, the judge's verdict is too weak to
   * justify overriding the deterministic keyword pass.
   */
  private async runLlmJudge(
    text: string,
  ): Promise<{ allow: true } | { allow: false; reason: GuardrailBlockReason }> {
    if (!this.llmJudgeEnabled || !this.llmJudge) return { allow: true };
    if (text.length <= env.guardrails.judgeMinMessageLength) return { allow: true };

    const decision = await this.llmJudge(text);
    if (!decision) return { allow: true }; // fail-open

    if (decision.decision === 'allow' || decision.confidence < 0.6) {
      return { allow: true };
    }

    const reason = judgeVerdictToReason(decision.decision);

    logger.info('guardrail_judge_block', {
      verdict: decision.decision,
      confidence: decision.confidence,
      mappedReason: reason,
    });

    return { allow: false, reason };
  }

  /**
   * Routes a guardrail block to the audit chain (V13 / STRIDE R3). Single
   * forensic entry per block; never throws — `auditService.log()` swallows
   * pipeline errors so a hiccup in audit insert can't break the chat hot path.
   */
  private async logBlock(params: {
    phase: 'input' | 'output';
    reason: GuardrailBlockReason | undefined;
    fullText: string;
    classifierRan: boolean;
    providerRan: boolean;
    context?: GuardrailAuditContext;
  }): Promise<void> {
    if (!this.audit) return;
    await this.audit.log(buildGuardrailBlockAuditEntry(params));
  }

  /**
   * Runs the configured guardrail provider check (ADR-048) with a safety net:
   * any throw is translated to a fail-CLOSED blocking decision. In
   * observe-only mode, blocking decisions are downgraded to `allow: true`
   * after logging — letting operators validate a new candidate on production
   * traffic without user-visible refusals.
   */
  private async evaluateGuardrailProvider(
    phase: 'input' | 'output',
    run: () => Promise<{ allow: boolean; reason?: string; redactedText?: string }>,
  ): Promise<{ allow: boolean; reason?: GuardrailBlockReason; redactedText?: string }> {
    if (!this.guardrailProvider) return { allow: true };

    let raw: { allow: boolean; reason?: string; redactedText?: string };
    try {
      raw = await run();
    } catch (error) {
      logger.warn('guardrail_provider_throw_fail_closed', {
        adapter: this.guardrailProvider.name,
        phase,
        error: error instanceof Error ? error.message : String(error),
      });
      raw = { allow: false, reason: 'error' };
    }

    if (raw.allow) {
      return {
        allow: true,
        ...(raw.redactedText !== undefined ? { redactedText: raw.redactedText } : {}),
      };
    }

    const mappedReason = mapProviderReason(raw.reason);

    if (this.guardrailProviderObserveOnly) {
      logger.info('guardrail_provider_observe_would_block', {
        adapter: this.guardrailProvider.name,
        phase,
        rawReason: raw.reason,
        mappedReason,
      });
      // Observe-only mode preserves any sanitized payload — operators can
      // still validate the redaction pipeline end-to-end without flipping
      // the candidate to enforce mode (LLM02 + ADR-048 Phase A).
      return {
        allow: true,
        ...(raw.redactedText !== undefined ? { redactedText: raw.redactedText } : {}),
      };
    }

    logger.info('guardrail_provider_block', {
      adapter: this.guardrailProvider.name,
      phase,
      rawReason: raw.reason,
      mappedReason,
    });
    return {
      allow: false,
      reason: mappedReason,
      ...(raw.redactedText !== undefined ? { redactedText: raw.redactedText } : {}),
    };
  }

  /**
   * Evaluates user input against the guardrail rules.
   * When preClassified is 'art', the soft off-topic check is skipped (classifier bypass)
   * but hard blocks (insults, prompt injection) always run.
   *
   * Every block decision is routed through the audit chain (V13 / STRIDE R3) so
   * attack patterns, frequency, locale, and offending users can be retro-analysed.
   *
   * @param text - User message text.
   * @param preClassified - Optional frontend pre-classification hint.
   * @param context - Optional request-scoped context for the audit row.
   * @returns Guardrail decision.
   */
  async evaluateInput(
    text: string | undefined,
    preClassified?: 'art',
    context?: GuardrailAuditContext,
  ): Promise<InputGuardrailResult> {
    const providerRan = Boolean(this.guardrailProvider);
    const locale = resolveLocaleLabel(context);

    // Hard blocks (insults, injection) always run regardless of preClassified
    const decision = evaluateUserInputGuardrail({ text });
    if (!decision.allow) {
      recordBiasMetrics({ locale, layer: 'keyword', decision });
      await this.logBlock({
        phase: 'input',
        reason: decision.reason,
        fullText: text ?? '',
        classifierRan: false,
        providerRan: false,
        context,
      });
      return decision;
    }

    // Guardrail provider layer (LLM-Guard sidecar, future Llama Prompt Guard 2,
    // Lakera, etc. — ADR-048) when configured. Runs in addition to the
    // deterministic guardrail above, never replacing it.
    const providerVerdict = await this.evaluateGuardrailProvider('input', async () => {
      if (!this.guardrailProvider) return { allow: true };
      return await this.guardrailProvider.checkInput({ text: text ?? '' });
    });
    if (!providerVerdict.allow) {
      recordBiasMetrics({ locale, layer: 'provider', decision: providerVerdict });
      await this.logBlock({
        phase: 'input',
        reason: providerVerdict.reason,
        fullText: text ?? '',
        classifierRan: false,
        providerRan,
        context,
      });
      return providerVerdict;
    }

    // LLM02 — when the provider returned a sanitized variant that differs
    // from the input, audit + meter the redaction (the substitution itself
    // happens at the call site that consumes `redactedText`).
    const redactedText = providerVerdict.redactedText;
    if (redactedText !== undefined && redactedText !== (text ?? '') && this.guardrailProvider) {
      await logInputRedaction({
        redactedText,
        locale,
        provider: this.guardrailProvider,
        audit: this.audit,
        context,
      });
    }

    // F4 (2026-04-30) — LLM judge second layer. Selective invocation: only on
    // long inputs where the keyword pre-filter said allow. Cannot upgrade
    // keyword blocks (those returned earlier above). Hard-block channels —
    // insult / prompt_injection — always trump the preClassified='art' hint.
    const judgeDecision = await this.runLlmJudge(text ?? '');
    if (!judgeDecision.allow) {
      recordBiasMetrics({ locale, layer: 'judge', decision: judgeDecision });
      await this.logBlock({
        phase: 'input',
        reason: judgeDecision.reason,
        fullText: text ?? '',
        classifierRan: false,
        providerRan: false,
        context,
      });
      return judgeDecision;
    }

    // When preClassified === 'art', skip the soft off-topic classifier — trust frontend hint
    if (preClassified === 'art') {
      recordBiasMetrics({ locale, layer: 'classifier', decision: { allow: true } });
      logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'input', preClassified: true });
      return {
        allow: true,
        ...(redactedText !== undefined ? { redactedText } : {}),
      };
    }

    // Default: no soft check in the synchronous guardrail (LLM classifier runs on output side)
    recordBiasMetrics({ locale, layer: 'keyword', decision: { allow: true } });
    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'input', preClassified: false });
    return {
      ...decision,
      ...(redactedText !== undefined ? { redactedText } : {}),
    };
  }

  /**
   * Handles a blocked input: logs the audit event and persists both the attempted
   * user message and the assistant refusal in a single atomic transaction.
   *
   * @param params - Session context, guardrail reason, locale, and the user message to persist atomically.
   * @param params.sessionId - Chat session identifier.
   * @param params.reason - Guardrail block reason category.
   * @param params.requestedLocale - Locale for localised refusal text.
   * @param params.userId - Owner id for audit trail.
   * @param params.userMessage - The user's blocked message to persist atomically with the refusal.
   * @returns The refusal message result ready to return to the caller.
   */
  async handleInputBlock(params: {
    sessionId: string;
    reason?: GuardrailBlockReason;
    requestedLocale?: string;
    userId?: number;
    userMessage: PersistMessageInput;
  }): Promise<PostMessageResult> {
    const { sessionId, reason, requestedLocale, userMessage } = params;

    // NB: the audit row for this block is written upstream in `evaluateInput`
    // via `logBlock` — that is the single source of truth (V13 / STRIDE R3).
    // Logging again here would double-write to the hash chain.
    const refusalText = buildGuardrailRefusal(requestedLocale, reason);
    const refusalMetadata = withPolicyCitation({}, reason);
    // A5 (Q1 decision 2026-05-14) — refusals follow the standard
    // `composing → done` path. The terminal phase is `done` regardless of
    // whether the pipeline returned a real answer or a refusal — uniformity
    // simplifies FE handling (StatusIndicator unmounts on response in both
    // cases). Spec §1.1 R1 + dispatcher Q1.
    refusalMetadata.phase = 'done';
    const { refusal } = await this.repository.persistBlockedExchange({
      userMessage,
      refusal: {
        sessionId,
        role: 'assistant',
        text: refusalText,
        metadata: refusalMetadata as Record<string, unknown>,
      },
    });

    return {
      sessionId,
      message: {
        id: refusal.id,
        role: 'assistant',
        text: refusalText,
        createdAt: refusal.createdAt.toISOString(),
      },
      metadata: refusalMetadata,
    };
  }

  /**
   * Runs the optional art-topic classifier as the last layer of the output
   * guardrail. Fail-CLOSED on error: if the classifier throws, suppress the
   * LLM output and return a generic `unsafe_output` refusal (OWASP LLM 2026
   * guidance — never pass unverified model output when a safety check fails
   * to execute). Returns `undefined` when allowed, the refusal payload when
   * blocked. Audit rows are emitted on every block branch.
   */
  private async runArtTopicClassifier(args: {
    text: string;
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
    providerRan: boolean;
    context?: GuardrailAuditContext;
  }): Promise<{ text: string; metadata: ChatAssistantMetadata; allowed: boolean } | undefined> {
    const { text, metadata, requestedLocale, providerRan, context } = args;
    if (!this.artTopicClassifier) return undefined;

    let isArt: boolean;
    try {
      isArt = await this.artTopicClassifier.isArtRelated(text);
    } catch {
      await this.logBlock({
        phase: 'output',
        reason: 'unsafe_output',
        fullText: text,
        classifierRan: true,
        providerRan,
        context,
      });
      return buildBlockedOutputPayload({
        reason: 'unsafe_output',
        requestedLocale,
        metadata,
      });
    }
    if (!isArt) {
      await this.logBlock({
        phase: 'output',
        reason: 'off_topic',
        fullText: text,
        classifierRan: true,
        providerRan,
        context,
      });
      return buildBlockedOutputPayload({
        reason: 'off_topic',
        requestedLocale,
        metadata,
      });
    }
    return undefined;
  }

  /**
   * Evaluates the assistant output guardrail. If the output is blocked, returns
   * the sanitized refusal text and metadata; otherwise returns the original.
   *
   * Runs safety keyword checks (insults, injections, empty) first, then an
   * optional art-topic classifier check. SECURITY: the classifier is now
   * fail-CLOSED — if it throws, the LLM output is suppressed and a generic
   * safe refusal is returned (OWASP LLM 2026 guidance: never pass unverified
   * model output when a safety check fails to execute).
   *
   * @param params - The LLM output text, metadata, and locale.
   * @param params.text - Raw LLM output text to evaluate.
   * @param params.metadata - Assistant metadata from the orchestrator.
   * @param params.requestedLocale - Locale for localised refusal text.
   * @param params.context - Optional request-scoped context threaded into audit rows on block.
   * @returns The final text/metadata pair and whether the output was allowed.
   */
  async evaluateOutput(params: {
    text: string;
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
    context?: GuardrailAuditContext;
  }): Promise<{ text: string; metadata: ChatAssistantMetadata; allowed: boolean }> {
    const { text, metadata, requestedLocale, context } = params;
    const providerRan = Boolean(this.guardrailProvider);
    const classifierRan = Boolean(this.artTopicClassifier);

    // Safety keyword checks (insults, injections, empty).
    // C2 v2 (D3 — 2026-05): the LLM-authored `caption` + `rationale` on each
    // EnrichedImage flow back to the FE bubble inside <Text>; they are not
    // markdown-rendered, but they are user-visible content authored by the LLM
    // and may carry leaks. Aggregate them with the answer text so the keyword
    // guardrail catches injections / PII leaks in either surface — single
    // source of truth (CLAUDE.md AI Safety §4) preserved by routing through
    // the same evaluator.
    const guardrailText = aggregateOutputText(text, metadata);
    const safetyDecision = evaluateAssistantOutputGuardrail({ text: guardrailText });
    if (!safetyDecision.allow) {
      await this.logBlock({
        phase: 'output',
        reason: safetyDecision.reason,
        fullText: text,
        classifierRan: false,
        providerRan: false,
        context,
      });
      return buildBlockedOutputPayload({
        reason: safetyDecision.reason,
        requestedLocale,
        metadata,
      });
    }

    // Guardrail provider output check when configured (ADR-048;
    // defense-in-depth after keywords).
    const providerVerdict = await this.evaluateGuardrailProvider('output', async () => {
      if (!this.guardrailProvider) return { allow: true };
      return await this.guardrailProvider.checkOutput({
        text,
        metadata: metadata as unknown as Record<string, unknown>,
        locale: requestedLocale,
      });
    });
    if (!providerVerdict.allow) {
      await this.logBlock({
        phase: 'output',
        reason: providerVerdict.reason,
        fullText: text,
        classifierRan: false,
        providerRan,
        context,
      });
      return buildBlockedOutputPayload({
        reason: providerVerdict.reason,
        requestedLocale,
        metadata,
      });
    }

    const classifierBlock = await this.runArtTopicClassifier({
      text,
      metadata,
      requestedLocale,
      providerRan,
      context,
    });
    if (classifierBlock) return classifierBlock;

    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, {
      phase: 'output',
      classifierRan,
      providerRan,
    });
    return { text, metadata, allowed: true };
  }
}

/**
 * Aggregates the answer text with LLM-authored caption + rationale strings
 * from `metadata.images[]` and `metadata.suggestedImages[]`.
 *
 * D3 (2026-05) — those fields flow back to the user as visible text via
 * `ImageCarousel.<Text>`; they must pass through the same keyword guardrail
 * as the answer body so injection / PII leaks in either surface are caught.
 */
function aggregateOutputText(text: string, metadata: ChatAssistantMetadata): string {
  const parts: string[] = [text];
  for (const img of metadata.images ?? []) {
    if (img.caption) parts.push(img.caption);
    if (img.rationale) parts.push(img.rationale);
  }
  for (const sugg of metadata.suggestedImages ?? []) {
    if (sugg.caption) parts.push(sugg.caption);
    if (sugg.rationale) parts.push(sugg.rationale);
  }
  return parts.join(' ');
}

/** Closed set of layers exposed as a Prometheus label (bounded cardinality). */
type GuardrailLayer = 'keyword' | 'provider' | 'judge' | 'classifier';

/** Closed set of locale labels (8 supported + `unknown`). */
const KNOWN_LOCALES: ReadonlySet<string> = new Set([
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'zh',
]);

/**
 * Resolves a Prometheus-safe locale label from the audit context. Clips to
 * the closed 8-locale set + `unknown` to keep cardinality bounded — a hostile
 * client cannot inflate label cardinality by sending arbitrary locale strings.
 */
function resolveLocaleLabel(context: GuardrailAuditContext | undefined): string {
  const raw = context?.locale?.toLowerCase();
  if (raw && KNOWN_LOCALES.has(raw)) return raw;
  return 'unknown';
}

/**
 * Increments the bias-monitoring counters at decision time. Foundation for
 * `docs/compliance/FAIRNESS_METRICS_PLAN.md` Phase 1 — per-locale block-rate
 * derivation in Prometheus uses these as the base series. Methodology note:
 * baseline for alerts is `avg(block_rate per locale)`, NOT global
 * `total_blocks / total_requests` (a single locale dominating blocks would
 * contaminate the global mean, hiding per-locale anomalies).
 */
function recordBiasMetrics(params: {
  locale: string;
  layer: GuardrailLayer;
  decision: { allow: boolean; reason?: GuardrailBlockReason };
}): void {
  const decisionLabel = params.decision.allow ? 'allowed' : 'blocked';
  guardrailDecisionsTotal.inc({
    locale: params.locale,
    layer: params.layer,
    decision: decisionLabel,
  });
  if (!params.decision.allow && params.decision.reason) {
    guardrailCategoryBlocksTotal.inc({
      locale: params.locale,
      category: params.decision.reason,
    });
  }
}
