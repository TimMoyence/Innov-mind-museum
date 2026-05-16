/**
 * module/chat carve-out — guardrails (V1 keyword + V2 LLM Guard + LLM judge).
 *
 * Mutates the safety layer that gates every chat message (ADR-015,
 * ADR-047):
 *   - useCase/guardrail/*  — art-topic classifier, V1 keyword guardrail,
 *     LLM judge guardrail, budget tracker, evaluation service.
 *   - adapters/secondary/guardrails/* — V2 LLM Guard sidecar adapter,
 *     Llama PromptGuard adapter, Presidio PII adapter, circuit-breaker,
 *     tenant rate-limiter, in-flight semaphore.
 *
 * Carve-out rationale: security-critical pre-launch V1 (2026-06-01), small
 * enough scope to keep at 0 surv (15 files).
 *
 * Usage: `pnpm stryker run stryker/module-chat-guardrails.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/useCase/guardrail/**/*.ts',
    'src/modules/chat/adapters/secondary/guardrails/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
