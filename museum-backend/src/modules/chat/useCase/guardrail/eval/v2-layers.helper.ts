import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { judgeVerdictToReason, mapProviderReason } from '../guardrail-reason-mapping';

import type { GuardrailBlockReason } from '../art-topic-guardrail';
import type { LlmJudgeFn } from '../guardrail-evaluation.types';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
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

export interface EvaluateGuardrailProviderDeps {
  guardrailProvider?: GuardrailProvider;
  guardrailProviderObserveOnly: boolean;
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

/**
 * ADR-048 — any throw → FAIL-CLOSED block. Observe-only mode downgrades blocks
 * to allow after logging (validates candidate on prod traffic without user
 * refusals).
 */
export async function evaluateGuardrailProvider(
  phase: 'input' | 'output',
  run: () => Promise<{ allow: boolean; reason?: string; redactedText?: string }>,
  deps: EvaluateGuardrailProviderDeps,
): Promise<{ allow: boolean; reason?: GuardrailBlockReason; redactedText?: string }> {
  if (!deps.guardrailProvider) return { allow: true };

  let raw: { allow: boolean; reason?: string; redactedText?: string };
  try {
    raw = await run();
  } catch (error) {
    logger.warn('guardrail_provider_throw_fail_closed', {
      adapter: deps.guardrailProvider.name,
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

  if (deps.guardrailProviderObserveOnly) {
    logger.info('guardrail_provider_observe_would_block', {
      adapter: deps.guardrailProvider.name,
      phase,
      rawReason: raw.reason,
      mappedReason,
    });
    // LLM02/ADR-048 Phase A — preserve sanitized payload so operators can
    // validate redaction E2E without flipping to enforce mode.
    return {
      allow: true,
      ...(raw.redactedText !== undefined ? { redactedText: raw.redactedText } : {}),
    };
  }

  logger.info('guardrail_provider_block', {
    adapter: deps.guardrailProvider.name,
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
