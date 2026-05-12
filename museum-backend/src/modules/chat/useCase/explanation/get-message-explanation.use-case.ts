import {
  AUDIT_GUARDRAIL_BLOCKED_INPUT,
  AUDIT_GUARDRAIL_BLOCKED_OUTPUT,
  AUDIT_SECURITY_LLM_GUARD_BREAKER_OPEN,
} from '@shared/audit/audit.types';
import { AuditLog } from '@shared/audit/auditLog.entity';
import {
  getExplanationStrings,
  mapToExplanationCategory,
  type ExplanationCategory,
  type RecourseType,
} from '@shared/i18n/explanation-reasons';
import { resolveLocale, type SupportedLocale } from '@shared/i18n/locale';
import { logger } from '@shared/logger/logger';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { DataSource } from 'typeorm';

/**
 * GDPR Article 22 + AI Act Art. 14 / Art. 50 — input payload for the
 * right-to-explanation use case.
 *
 * `userId` is mandatory: anonymous traffic cannot consume this endpoint.
 * Authorisation failures map to NotFoundError per privacy-by-design (we never
 * leak "this message exists but is not yours"; see `docs/GDPR_ART22_SCOPE.md`).
 */
export interface GetMessageExplanationInput {
  messageId: string;
  userId: number;
  /** Raw locale candidate (BCP47 or two-letter). Falls back to EN. */
  locale?: string;
}

/** Decision branch returned by the explanation endpoint. */
export type ExplanationDecision = 'allowed' | 'blocked';

/** Recourse payload — what the user can do next. */
export interface ExplanationRecourse {
  type: RecourseType;
  description: string;
  supportUrl: string | null;
}

/** Provider that emitted the decision (stamped by guardrail adapters per ADR-048). */
export interface ExplanationProvidedBy {
  name: string;
  version: string;
}

/**
 * Response shape — mirrors `ExplanationResponseSchema` in `chat.contracts.ts`.
 * Co-located here so the use-case has zero dependency on the HTTP layer.
 */
export interface MessageExplanation {
  decision: ExplanationDecision;
  category: ExplanationCategory | null;
  reasonSummary: string;
  recourse: ExplanationRecourse;
  auditRef: string | null;
  providedBy: ExplanationProvidedBy | null;
  decisionAt: string;
  policyVersion: string;
}

/**
 * Error raised when the message id is unknown OR not owned by the caller.
 * Mapped to a 404 response by the controller — `docs/GDPR_ART22_SCOPE.md`
 * mandates security-through-obscurity for cross-tenant probes.
 */
export class MessageNotFoundForExplanationError extends Error {
  constructor(messageId: string) {
    super(`Message ${messageId} not found or not owned by caller`);
    this.name = 'MessageNotFoundForExplanationError';
  }
}

const POLICY_VERSION_DEFAULT = 'default-v0';
const SUPPORT_URL_DEFAULT: string | null = null;
const AUDIT_CORRELATION_WINDOW_MS = 60_000;

/** Subset of {@link ChatRepository} consumed by the explanation use-case. */
export interface ExplanationChatRepository {
  getMessageById: ChatRepository['getMessageById'];
}

/**
 * Port for audit-log correlation. Returns the most recent guardrail-block (or
 * LLM-Guard breaker-open) row that matches the caller within
 * `AUDIT_CORRELATION_WINDOW_MS` of the decision time. Returns `null` when no
 * matching row exists — perfectly normal for `allowed` decisions and for
 * messages older than the audit rollout.
 */
export interface ExplanationAuditCorrelator {
  findCorrelatedAuditRef(params: {
    userId: number;
    sessionId: string;
    decisionAt: Date;
  }): Promise<string | null>;
}

/** Dependencies of {@link GetMessageExplanationUseCase}. */
export interface GetMessageExplanationDeps {
  repository: ExplanationChatRepository;
  /**
   * Optional support URL appended to the recourse payload when the recourse
   * type is `support`. Sourced from `env` at composition time; left optional
   * so unit tests do not need to mutate env state.
   */
  supportUrl?: string | null;
  /** Optional audit correlator. When absent, `auditRef` is always null. */
  auditCorrelator?: ExplanationAuditCorrelator;
}

/**
 * GDPR Article 22 right-to-explanation use case.
 *
 * Pure read-only orchestration:
 *   1. Load the message by id (TypeORM, including session+owner relations).
 *   2. Verify the caller owns the message — leak nothing on mismatch.
 *   3. If the message is a user message, return a stub (no audit-relevant
 *      content — the user is the author).
 *   4. Otherwise, derive the decision (`allowed` | `blocked`) + category from
 *      `message.metadata`, build the localised explanation, and best-effort
 *      correlate with `audit_logs` for the forensic `auditRef`.
 *
 * Never mutates state. Never throws on audit-correlation failures — those
 * degrade gracefully to `auditRef: null` so a hiccup in the audit pipeline
 * cannot break the explanation endpoint (UFR-013 honesty: we return an honest
 * "no correlation row found" rather than a 5xx).
 */
export class GetMessageExplanationUseCase {
  private readonly repository: ExplanationChatRepository;
  private readonly supportUrl: string | null;
  private readonly auditCorrelator: ExplanationAuditCorrelator | undefined;

  constructor(deps: GetMessageExplanationDeps) {
    this.repository = deps.repository;
    this.supportUrl = deps.supportUrl ?? SUPPORT_URL_DEFAULT;
    this.auditCorrelator = deps.auditCorrelator;
  }

  /** Resolves the explanation for a single chat message. */
  async execute(input: GetMessageExplanationInput): Promise<MessageExplanation> {
    const locale = resolveLocale([input.locale]);
    const loaded = await this.repository.getMessageById(input.messageId);
    if (!loaded) {
      throw new MessageNotFoundForExplanationError(input.messageId);
    }

    const ownerId = loaded.session.user?.id;
    if (ownerId !== input.userId) {
      // Privacy-by-design: never differentiate "not found" from "not yours".
      // See `docs/GDPR_ART22_SCOPE.md` § "Current implementation".
      throw new MessageNotFoundForExplanationError(input.messageId);
    }

    const { message } = loaded;
    const decisionAt = message.createdAt.toISOString();

    if (message.role === 'user') {
      // The user authored this message — there is no automated decision to
      // explain. Return a stub that points to self-retry as the obvious
      // recourse (the user can simply rephrase). No audit lookup, no
      // providedBy stamping.
      const strings = getExplanationStrings(locale, 'allowed');
      return {
        decision: 'allowed',
        category: null,
        reasonSummary: strings.summary,
        recourse: this.buildRecourse(strings.recourse.type, strings.recourse.description),
        auditRef: null,
        providedBy: null,
        decisionAt,
        policyVersion: POLICY_VERSION_DEFAULT,
      };
    }

    const metadata = message.metadata ?? {};
    const decision = extractDecision(metadata);
    const category = decision === 'blocked' ? extractCategory(metadata) : null;
    const providedBy = extractProvidedBy(metadata);
    const policyVersion = extractPolicyVersion(metadata);

    const explanationKey = decision === 'blocked' ? (category ?? 'unknown') : 'allowed';
    const strings = getExplanationStrings(locale, explanationKey);

    let auditRef: string | null = null;
    if (decision === 'blocked' && this.auditCorrelator) {
      auditRef = await this.safeCorrelate({
        userId: input.userId,
        sessionId: loaded.session.id,
        decisionAt: message.createdAt,
      });
    }

    return {
      decision,
      category,
      reasonSummary: strings.summary,
      recourse: this.buildRecourse(strings.recourse.type, strings.recourse.description),
      auditRef,
      providedBy,
      decisionAt,
      policyVersion,
    };
  }

  /** Wraps the recourse strings + the optional support URL into the wire shape. */
  private buildRecourse(type: RecourseType, description: string): ExplanationRecourse {
    const supportUrl = type === 'support' ? this.supportUrl : null;
    return { type, description, supportUrl };
  }

  /** Best-effort audit correlation; never throws into the use-case flow. */
  private async safeCorrelate(params: {
    userId: number;
    sessionId: string;
    decisionAt: Date;
  }): Promise<string | null> {
    if (!this.auditCorrelator) return null;
    try {
      return await this.auditCorrelator.findCorrelatedAuditRef(params);
    } catch (error) {
      logger.warn('explanation_audit_correlation_failed', {
        userId: params.userId,
        sessionId: params.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/** Extracts the decision from message metadata. Defaults to `allowed`. */
function extractDecision(metadata: Record<string, unknown>): ExplanationDecision {
  // The guardrail pipeline stamps `metadata.guardrailReason` (via
  // `withPolicyCitation` → `buildGuardrailCitation`) on blocked assistant
  // messages. We also accept the explicit `metadata.blocked` boolean for
  // future-proofing.
  if (typeof metadata.blocked === 'boolean') {
    return metadata.blocked ? 'blocked' : 'allowed';
  }
  if (typeof metadata.decision === 'string') {
    return metadata.decision === 'blocked' ? 'blocked' : 'allowed';
  }
  if (typeof metadata.guardrailReason === 'string' && metadata.guardrailReason.length > 0) {
    return 'blocked';
  }
  if (typeof metadata.blockedReason === 'string' && metadata.blockedReason.length > 0) {
    return 'blocked';
  }
  return 'allowed';
}

/** Extracts the explanation category from message metadata, mapped through the public taxonomy. */
function extractCategory(metadata: Record<string, unknown>): ExplanationCategory | null {
  const candidate =
    extractStringField(metadata, 'category') ??
    extractStringField(metadata, 'blockedReason') ??
    extractStringField(metadata, 'guardrailReason') ??
    extractStringField(metadata, 'reason');
  return mapToExplanationCategory(candidate);
}

/** Extracts the `providedBy` provider stamp, if any. */
function extractProvidedBy(metadata: Record<string, unknown>): ExplanationProvidedBy | null {
  const raw = metadata.providedBy;
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const name = extractStringField(record, 'name');
  const version = extractStringField(record, 'version');
  if (!name || !version) return null;
  return { name, version };
}

/** Extracts the policy version, defaulting to `default-v0` (the ADR-048 Phase 0 anchor). */
function extractPolicyVersion(metadata: Record<string, unknown>): string {
  return extractStringField(metadata, 'policyVersion') ?? POLICY_VERSION_DEFAULT;
}

/** Safe string extraction from a JSONB-loaded record. */
function extractStringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit correlator implementation (TypeORM-backed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TypeORM-backed audit correlator. Looks up the most recent
 * `AUDIT_GUARDRAIL_BLOCKED_INPUT` / `AUDIT_GUARDRAIL_BLOCKED_OUTPUT` /
 * `AUDIT_SECURITY_LLM_GUARD_BREAKER_OPEN` row whose `actor_id` matches the
 * caller within ±`AUDIT_CORRELATION_WINDOW_MS` of the decision time.
 *
 * Scope:
 *   - `actor_id = userId`
 *   - `target_id = sessionId` when present (guardrail rows stamp the session
 *     id as `target_id`; breaker-open rows do not, so we widen via `OR`)
 *   - `created_at BETWEEN decisionAt - window AND decisionAt + window`
 *
 * Ordered by `created_at DESC` to surface the most recent forensic anchor.
 * Returns `null` on any error or when no row matches — the explanation
 * endpoint MUST degrade gracefully.
 */
export class TypeOrmAuditCorrelator implements ExplanationAuditCorrelator {
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Issues the correlation query. Pure read; returns `null` if no row matches
   * or if the underlying query throws.
   */
  async findCorrelatedAuditRef(params: {
    userId: number;
    sessionId: string;
    decisionAt: Date;
  }): Promise<string | null> {
    const repo = this.dataSource.getRepository(AuditLog);
    const lowerBound = new Date(params.decisionAt.getTime() - AUDIT_CORRELATION_WINDOW_MS);
    const upperBound = new Date(params.decisionAt.getTime() + AUDIT_CORRELATION_WINDOW_MS);
    try {
      const row = await repo
        .createQueryBuilder('audit')
        .where('audit.actorId = :userId', { userId: params.userId })
        .andWhere('audit.action IN (:...actions)', {
          actions: [
            AUDIT_GUARDRAIL_BLOCKED_INPUT,
            AUDIT_GUARDRAIL_BLOCKED_OUTPUT,
            AUDIT_SECURITY_LLM_GUARD_BREAKER_OPEN,
          ],
        })
        .andWhere('audit.createdAt BETWEEN :lower AND :upper', {
          lower: lowerBound,
          upper: upperBound,
        })
        .andWhere('(audit.targetId = :sessionId OR audit.targetId IS NULL)', {
          sessionId: params.sessionId,
        })
        .orderBy('audit.createdAt', 'DESC')
        .limit(1)
        .getOne();
      return row?.id ?? null;
    } catch (error) {
      logger.warn('explanation_audit_correlator_query_failed', {
        userId: params.userId,
        sessionId: params.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/** Convenience factory used by the chat-module composition root. */
export function createGetMessageExplanationUseCase(
  deps: GetMessageExplanationDeps,
): GetMessageExplanationUseCase {
  return new GetMessageExplanationUseCase(deps);
}

/** Re-exports for the controller / contracts layer. */
export type { SupportedLocale };
