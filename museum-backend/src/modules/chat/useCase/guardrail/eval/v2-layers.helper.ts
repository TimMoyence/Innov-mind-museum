import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { judgeVerdictToReason, mapProviderReason } from '../guardrail-reason-mapping';

import type { GuardrailBlockReason } from '../art-topic-guardrail';
import type { LlmJudgeFn } from '../guardrail-evaluation.types';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';

/**
 * ADR-015 dual-V2 doctrine — this module hosts the two V2 layers as
 * stand-alone async functions. Each receives ONLY its own deps via the second
 * argument so they remain structurally independent: disabling / replacing the
 * judge cannot accidentally affect the provider sidecar and vice versa.
 * (CLAUDE.md § AI Safety §4 + §5, post 2026-05-14 amendment that retired the
 * mutually-exclusive `GUARDRAILS_V2_CANDIDATE` flag.)
 */

/** Dependencies required by {@link runLlmJudge} — V2 LLM judge only. */
export interface RunLlmJudgeDeps {
  llmJudge?: LlmJudgeFn;
  llmJudgeEnabled: boolean;
}

/** Dependencies required by {@link evaluateGuardrailProvider} — V2 sidecar only. */
export interface EvaluateGuardrailProviderDeps {
  guardrailProvider?: GuardrailProvider;
  guardrailProviderObserveOnly: boolean;
}

/**
 * F4 — runs the LLM judge after the keyword pre-filter has already returned
 * allow. The judge can ONLY downgrade allow → block; never upgrade block →
 * allow (the caller never invokes this when keyword decision is already
 * blocking).
 *
 * Confidence floor of 0.6 — below that, the judge's verdict is too weak to
 * justify overriding the deterministic keyword pass.
 */
export async function runLlmJudge(
  text: string,
  deps: RunLlmJudgeDeps,
): Promise<{ allow: true } | { allow: false; reason: GuardrailBlockReason }> {
  if (!deps.llmJudgeEnabled || !deps.llmJudge) return { allow: true };
  if (text.length <= env.guardrails.judgeMinMessageLength) return { allow: true };

  const decision = await deps.llmJudge(text);
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
 * Runs the configured guardrail provider check (ADR-048) with a safety net:
 * any throw is translated to a fail-CLOSED blocking decision. In
 * observe-only mode, blocking decisions are downgraded to `allow: true`
 * after logging — letting operators validate a new candidate on production
 * traffic without user-visible refusals.
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
    // Observe-only mode preserves any sanitized payload — operators can
    // still validate the redaction pipeline end-to-end without flipping
    // the candidate to enforce mode (LLM02 + ADR-048 Phase A).
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
