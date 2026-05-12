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
 * Maps a `GuardrailProvider` reason (ADR-048) to our canonical
 * `GuardrailBlockReason`, used downstream by the refusal message builder and
 * audit log.
 *
 * `error` (raw from the adapter) → `service_unavailable` (ADR-047). The
 * sidecar could not produce a verdict — the user-facing copy should say
 * "service temporarily unavailable" rather than the misleading
 * `unsafe_output` framing that suggests the message itself was flagged.
 * Genuine content categories (pii, bias, toxicity, data_exfiltration,
 * schema_violation) keep mapping to `unsafe_output`.
 */
export function mapProviderReason(reason: string | undefined): GuardrailBlockReason {
  switch (reason) {
    case 'pii':
    case 'bias':
    case 'toxicity':
    case 'data_exfiltration':
    case 'schema_violation':
      return 'unsafe_output';
    case 'error':
    case 'service_unavailable':
      return 'service_unavailable';
    case 'off_topic':
      return 'off_topic';
    case 'jailbreak':
    case 'prompt_injection':
    default:
      return 'prompt_injection';
  }
}
