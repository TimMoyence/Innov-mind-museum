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
 * GDPR Art 22 + AI Act Art 14/50 input. `userId` mandatory (no anon). Authz
 * failures → NotFoundError (privacy-by-design, never leak "exists but not yours";
 * see `docs/GDPR_ART22_SCOPE.md`).
 */
export interface GetMessageExplanationInput {
  messageId: string;
  userId: number;
  /** BCP47 or two-letter; falls back to EN. */
  locale?: string;
}

export type ExplanationDecision = 'allowed' | 'blocked';

export interface ExplanationRecourse {
  type: RecourseType;
  description: string;
  supportUrl: string | null;
}

/** Stamped by guardrail adapters per ADR-048. */
export interface ExplanationProvidedBy {
  name: string;
  version: string;
}

/** Mirrors `ExplanationResponseSchema` in chat.contracts.ts. */
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

/** 404 — never differentiates "not found" from "not yours" (GDPR_ART22_SCOPE). */
export class MessageNotFoundForExplanationError extends Error {
  constructor(messageId: string) {
    super(`Message ${messageId} not found or not owned by caller`);
    this.name = 'MessageNotFoundForExplanationError';
  }
}

const POLICY_VERSION_DEFAULT = 'default-v0';
const SUPPORT_URL_DEFAULT: string | null = null;
const AUDIT_CORRELATION_WINDOW_MS = 60_000;

export interface ExplanationChatRepository {
  getMessageById: ChatRepository['getMessageById'];
}

/** Returns most recent block row within `AUDIT_CORRELATION_WINDOW_MS`; null normal. */
export interface ExplanationAuditCorrelator {
  findCorrelatedAuditRef(params: {
    userId: number;
    sessionId: string;
    decisionAt: Date;
  }): Promise<string | null>;
}

export interface GetMessageExplanationDeps {
  repository: ExplanationChatRepository;
  supportUrl?: string | null;
  /** When absent, `auditRef` is always null. */
  auditCorrelator?: ExplanationAuditCorrelator;
}

/**
 * GDPR Art 22 right-to-explanation. Pure read; never mutates. Audit
 * correlation degrades to `auditRef: null` on failure (UFR-013 honest
 * "no correlation row" rather than 5xx).
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

  async execute(input: GetMessageExplanationInput): Promise<MessageExplanation> {
    const locale = resolveLocale([input.locale]);
    const loaded = await this.repository.getMessageById(input.messageId);
    if (!loaded) {
      throw new MessageNotFoundForExplanationError(input.messageId);
    }

    const ownerId = loaded.session.user?.id;
    if (ownerId !== input.userId) {
      // Privacy-by-design: never differentiate "not found" from "not yours".
      throw new MessageNotFoundForExplanationError(input.messageId);
    }

    const { message } = loaded;
    const decisionAt = message.createdAt.toISOString();

    if (message.role === 'user') {
      // User-authored → no automated decision; stub points to self-retry.
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

  private buildRecourse(type: RecourseType, description: string): ExplanationRecourse {
    const supportUrl = type === 'support' ? this.supportUrl : null;
    return { type, description, supportUrl };
  }

  /** Best-effort; never throws. */
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

/** Defaults to `allowed`. */
function extractDecision(metadata: Record<string, unknown>): ExplanationDecision {
  // Guardrail pipeline stamps `metadata.guardrailReason` on blocked assistant
  // messages; we also accept explicit `metadata.blocked` for future-proofing.
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

function extractCategory(metadata: Record<string, unknown>): ExplanationCategory | null {
  const candidate =
    extractStringField(metadata, 'category') ??
    extractStringField(metadata, 'blockedReason') ??
    extractStringField(metadata, 'guardrailReason') ??
    extractStringField(metadata, 'reason');
  return mapToExplanationCategory(candidate);
}

function extractProvidedBy(metadata: Record<string, unknown>): ExplanationProvidedBy | null {
  const raw = metadata.providedBy;
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const name = extractStringField(record, 'name');
  const version = extractStringField(record, 'version');
  if (!name || !version) return null;
  return { name, version };
}

/** ADR-048 Phase 0 anchor. */
function extractPolicyVersion(metadata: Record<string, unknown>): string {
  return extractStringField(metadata, 'policyVersion') ?? POLICY_VERSION_DEFAULT;
}

function extractStringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Looks up most recent block row within ±AUDIT_CORRELATION_WINDOW_MS where
 * `actor_id = userId` AND (`target_id = sessionId` OR `target_id IS NULL`
 * for breaker-open rows). Returns `null` on any error or no match — endpoint
 * MUST degrade gracefully.
 */
export class TypeOrmAuditCorrelator implements ExplanationAuditCorrelator {
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

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

export function createGetMessageExplanationUseCase(
  deps: GetMessageExplanationDeps,
): GetMessageExplanationUseCase {
  return new GetMessageExplanationUseCase(deps);
}

export type { SupportedLocale };
