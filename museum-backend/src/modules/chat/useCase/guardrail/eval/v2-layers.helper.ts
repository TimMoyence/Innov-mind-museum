import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { judgeVerdictToReason } from '../guardrail-reason-mapping';

import type { GuardrailBlockReason } from '../art-topic-guardrail';
import type { LlmJudgeFn } from '../guardrail-evaluation.types';
import type { LlmJudgeScope } from '@shared/observability/derive-tier';

export interface RunLlmJudgeDeps {
  llmJudge?: LlmJudgeFn;
  llmJudgeEnabled: boolean;
}

export async function runLlmJudge(
  text: string,
  deps: RunLlmJudgeDeps,
  scope?: LlmJudgeScope,
): Promise<{ allow: true } | { allow: false; reason: GuardrailBlockReason }> {
  if (!deps.llmJudgeEnabled || !deps.llmJudge) return { allow: true };
  if (text.length <= env.guardrails.judgeMinMessageLength) return { allow: true };

  const decision = await deps.llmJudge(text, scope);
  if (!decision) return { allow: true };

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
