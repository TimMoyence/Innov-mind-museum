import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { JudgeDecision } from '@modules/chat/useCase/llm/llm-judge-guardrail';

export function judgeVerdictToReason(verdict: JudgeDecision['decision']): GuardrailBlockReason {
  if (verdict === 'block:abuse') return 'insult';
  if (verdict === 'block:injection') return 'prompt_injection';
  return 'off_topic';
}
