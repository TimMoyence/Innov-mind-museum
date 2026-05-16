/**
 * module/chat carve-out — LLM orchestration (LangChain wrapper + section
 * prompts + provider adapters).
 *
 * Includes:
 *   - useCase/llm/* + useCase/llm/llm-sections/* — section prompt builders
 *     (intro/art/museum/context), LangChain orchestrator wrapper.
 *   - adapters/secondary/llm/* — OpenAI/Deepseek/Google provider adapters,
 *     ChatOrchestrator implementations.
 *
 * Carve-out rationale: dense StringLiteral mutants on prompt templates that
 * need fixture-driven assertions. Mid-size scope (~25-30 files).
 *
 * Usage: `pnpm stryker run stryker/module-chat-llm.config.mjs`
 *
 * `setupFiles` pins `EXTRACTION_WORKER_ENABLED=false` for the sandbox to
 * avoid the BullMQ/ioredis TCP handle leak that masks real kills as Timeout
 * under Stryker's mandatory `forceExit:false`. Mirrors module-admin
 * (see tests/helpers/chat/jest-env.setup.ts header for the full story).
 * `extraTestPathIgnorePatterns` matches the admin scope exclusion list —
 * both files cover zero LLM-orchestration mutant (perTest coverage would
 * skip them anyway) but they boot infra clients that leak open ioredis
 * TCP handles into the shared worker process and break the
 * `forceExit:false` cleanup between mutants.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/useCase/llm/**/*.ts',
    'src/modules/chat/adapters/secondary/llm/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/routes/museum-enrichment.route.test.ts',
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
  ],
});
