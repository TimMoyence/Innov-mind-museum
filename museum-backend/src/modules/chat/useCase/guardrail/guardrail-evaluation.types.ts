import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { JudgeDecision } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { AuditService } from '@shared/audit/audit.service';

export type { GuardrailAuditContext } from './guardrail-audit-payload';

export interface ArtTopicClassifierPort {
  isArtRelated(text: string): Promise<boolean>;
}

export interface InputGuardrailResult {
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

export interface GuardrailEvaluationServiceDeps {
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
