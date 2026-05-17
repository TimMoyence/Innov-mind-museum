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
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox to
 * avoid the BullMQ/ioredis TCP handle leak that masks real kills as Timeout
 * under Stryker's mandatory `forceExit:false`. Mirrors module-admin
 * (see tests/helpers/chat/jest-env.setup.ts header for the full story).
 * `extraTestPathIgnorePatterns` matches the admin scope exclusion list —
 * both files cover zero guardrail mutant (perTest coverage would skip
 * them anyway) but they boot infra clients that leak open ioredis TCP
 * handles into the shared worker process and break the `forceExit:false`
 * cleanup between mutants.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/useCase/guardrail/**/*.ts',
    'src/modules/chat/adapters/secondary/guardrails/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
