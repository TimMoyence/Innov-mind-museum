/**
 * module/chat scope — AI orchestrator (LangChain LLM pipeline + voice STT/TTS,
 * guardrails V1/V2, art-keyword extraction, image processing, visual-similarity
 * search, sessions, memory, retention jobs).
 *
 * Mutates `src/modules/chat/**` (~140-155 mutable files across domain,
 * useCase, primary/secondary adapters, jobs).
 *
 * First-pass expectations: largest module scope in the codebase by far —
 * estimated 5000+ mutants and 4-6h initial runtime. Survivors clustered in
 * llm-sections (section prompt templates), guardrails (keyword arrays + V2
 * sidecar wrappers), embeddings (numerical preprocessing), and persistence
 * (TypeORM repository SQL fragments).
 *
 * Usage: `pnpm stryker run stryker/module-chat.config.mjs`
 *
 * Carve-out candidates if the full scope is impractical to keep at 0
 * survivors:
 *   - chat/useCase/llm/llm-sections/* (prompt templates are dense StringLiteral
 *     targets that need fixture-driven assertions)
 *   - chat/adapters/secondary/embeddings/* (SigLIP / preprocessing — see
 *     ADR-037 note in CLAUDE.md about FP16 normalization gotchas)
 *   - chat/useCase/guardrail/* (V1 + V2 layered defense, ADR-015)
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
