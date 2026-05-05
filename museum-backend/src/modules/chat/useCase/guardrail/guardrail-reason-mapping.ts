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

/**
 * Maps an AdvancedGuardrail reason to our canonical GuardrailBlockReason, used
 * downstream by the refusal message builder and audit log.
 */
export function mapAdvancedReason(reason: string | undefined): GuardrailBlockReason {
  switch (reason) {
    case 'pii':
    case 'bias':
    case 'toxicity':
    case 'data_exfiltration':
    case 'schema_violation':
    case 'error':
      return 'unsafe_output';
    case 'off_topic':
      return 'off_topic';
    case 'jailbreak':
    case 'prompt_injection':
    default:
      return 'prompt_injection';
  }
}
