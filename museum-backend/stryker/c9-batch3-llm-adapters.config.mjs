/**
 * C9 batch 3 — adapters/secondary/llm files touched by C9.5/C9.17.
 *
 * Mutates 4 files I touched in C9.5/C9.17 on the adapter side:
 *   - langchain.orchestrator.ts (C9.5 invokeSection + C9.17 fail-closed)
 *   - langchain-orchestrator-assembly.ts (C9.17 parseAssistantResponse → extractMetadata)
 *   - langchain-orchestrator-support.ts (C9.5 usageRef + C9.17 ChatModel types)
 *   - langchain-orchestrator-tracing.ts (C9.5 usageRef in generation.end())
 *
 * Same sandbox setup as module-chat-llm.config.mjs.
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts',
    'src/modules/chat/adapters/secondary/llm/langchain-orchestrator-assembly.ts',
    'src/modules/chat/adapters/secondary/llm/langchain-orchestrator-support.ts',
    'src/modules/chat/adapters/secondary/llm/langchain-orchestrator-tracing.ts',
  ],
  setupFiles: ['<rootDir>/tests/helpers/chat/jest-env.setup.ts'],
  extraTestPathIgnorePatterns: [
    '<rootDir>/tests/unit/shared/redis-cache-service.test.ts',
    // 2026-05-18 corrective loop 2 — bulk exclude tests/unit/routes/** :
    // socket hang up flake is systemic across all route tests in stryker
    // sandbox (BullMQ/ioredis open handles per CLAUDE.md piège). Loop 1
    // excluded chat.route, loop 2 hit museum.route — exclude the whole
    // family. The 4 adapter files mutate here are covered by direct unit
    // tests in tests/unit/modules/chat/adapters/secondary/llm/, route
    // tests mostly contribute integration coverage which Stryker
    // attributes per-mutant via coveredBy.
    '<rootDir>/tests/unit/routes/',
  ],
});
