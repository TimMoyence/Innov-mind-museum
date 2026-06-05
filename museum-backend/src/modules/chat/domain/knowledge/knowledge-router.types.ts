/**
 * Domain home for the knowledge-router source discriminant. Relocated from
 * `useCase/knowledge/knowledge-router.service.ts` so the domain port
 * `chat-orchestrator.port.ts` (which threads `KnowledgeRouterResult.source`
 * through `OrchestratorInput.factsSource`) depends on a DOMAIN type rather than
 * reaching up into the application layer (ARCH-02 / Cat A close, run
 * 2026-06-04-hexagonal-boundaries-enforcement). The application service
 * re-exports this type so its public identity is preserved (spec R5).
 */
export type KnowledgeRouterSource = 'wikidata' | 'web' | 'none';
