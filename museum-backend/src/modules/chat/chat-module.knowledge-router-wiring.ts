/**
 * C4.1 (2026-05-11) — `KnowledgeRouterService` composition root helper.
 *
 * Extracted from `chat-module.ts` to keep that file under the project-wide
 * `max-lines: 400` (effective) budget — same precedent as T5.5
 * `chat-module.compare-wiring.ts`. Re-imported by {@link ChatModule.build}
 * which invokes {@link buildKnowledgeRouter} once per build cycle.
 *
 * Wiring graph (single file, single seam) :
 *
 *   `KnowledgeBaseProvider` (Wikidata, shared with `KnowledgeBaseService`)
 *     → `LlmJudgeGuardrail` (T3.1.5 port-shaped adapter, binds live
 *       `ChatOrchestrator` so circuit-breaker / budget counters stay coherent
 *       with the F4 input judge layer)
 *     → `WebSearchProvider` (`FallbackSearchProvider`, shared with
 *       `WebSearchService` cache wrapper)
 *
 * Each leg's per-leg budget is sourced from `env.knowledgeRouter.*` —
 * **TUNING-ONLY** by doctrine (D11 / pré-launch V1, see
 * `feedback_no_feature_flags_prelaunch`). NO `*_ENABLED` switch exists or
 * may be added. Rollback strategy = `git revert <merge-sha>`.
 */
import { KnowledgeRouterService } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import { LlmJudgeGuardrail } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import { env } from '@src/config/env';

import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { KnowledgeBaseProvider } from '@modules/chat/domain/ports/knowledge-base.port';
import type { WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';

/**
 * Build a fully-wired {@link KnowledgeRouterService} ready to be exposed on
 * `BuiltChatModule.knowledgeRouter` and injected into `ChatService` (T3.3).
 *
 * @param kbProvider raw Wikidata client (shared with the cached
 *   `KnowledgeBaseService` wrapper so we instantiate one HTTP client).
 * @param wsProvider raw web-search fallback chain (shared with the cached
 *   `WebSearchService` wrapper for the same reason).
 * @param orchestrator the live `ChatOrchestrator` — the LLM judge leg binds
 *   to it so circuit-breaker state + judge cost budget counters stay
 *   coherent with the F4 input guardrail (`judgeWithLlm`).
 */
export function buildKnowledgeRouter(
  kbProvider: KnowledgeBaseProvider,
  wsProvider: WebSearchProvider,
  orchestrator: ChatOrchestrator,
): KnowledgeRouterService {
  return new KnowledgeRouterService({
    kb: kbProvider,
    ws: wsProvider,
    judge: new LlmJudgeGuardrail({ orchestrator }),
    config: {
      threshold: env.knowledgeRouter.threshold,
      kbTimeoutMs: env.knowledgeRouter.kbTimeoutMs,
      judgeTimeoutMs: env.knowledgeRouter.judgeTimeoutMs,
      wsTimeoutMs: env.knowledgeRouter.wsTimeoutMs,
    },
  });
}
