import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { JudgeDecision } from '@modules/chat/useCase/llm/llm-judge-guardrail';

/**
 * F4 — maps a JudgeVerdict to the canonical GuardrailBlockReason. The judge
 * cannot return `block:offtopic` for hard-block channels — those map to
 * `off_topic` (soft channel) and the keyword pre-filter still wins for
 * insult / prompt_injection blocks.
 */
export function judgeVerdictToReason(verdict: JudgeDecision['decision']): GuardrailBlockReason {
  if (verdict === 'block:abuse') return 'insult';
  if (verdict === 'block:injection') return 'prompt_injection';
  return 'off_topic';
}

