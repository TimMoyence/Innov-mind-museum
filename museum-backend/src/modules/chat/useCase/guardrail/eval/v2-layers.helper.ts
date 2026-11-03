import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { judgeVerdictToReason } from '../guardrail-reason-mapping';

import type { GuardrailBlockReason } from '../art-topic-guardrail';
import type { LlmJudgeFn } from '../guardrail-evaluation.types';
import type { LlmJudgeScope } from '@shared/observability/derive-tier';

/**
 * ADR-015 dual-V2 doctrine — two V2 layers as stand-alone functions, each with
 * own deps. Structurally independent: disabling/replacing the judge cannot
 * affect provider sidecar (CLAUDE.md AI Safety §4-5, post 2026-05-14 amendment
 * retiring mutually-exclusive `GUARDRAILS_V2_CANDIDATE` flag).
 */

export interface RunLlmJudgeDeps {
  llmJudge?: LlmJudgeFn;
  llmJudgeEnabled: boolean;
}

/**
 * F4 — runs after keyword pre-filter returned allow. Judge can ONLY downgrade
 * allow → block (caller never invokes on block). Confidence floor 0.6 — below
 * is too weak to override deterministic keyword pass.
 */
export async function runLlmJudge(
  text: string,
  deps: RunLlmJudgeDeps,
  scope?: LlmJudgeScope,
): Promise<{ allow: true } | { allow: false; reason: GuardrailBlockReason }> {
  if (!deps.llmJudgeEnabled || !deps.llmJudge) return { allow: true };
  if (text.length <= env.guardrails.judgeMinMessageLength) return { allow: true };

  // TD-20 (R13c) — forward optional per-tenant scope into the judge generation.
  const decision = await deps.llmJudge(text, scope);
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

