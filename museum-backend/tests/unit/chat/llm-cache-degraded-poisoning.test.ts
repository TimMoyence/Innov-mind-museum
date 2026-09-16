/**
 * INC-2026-07-14 (second defect, found at verify) — THE CACHE MEMOISES THE FALLBACK.
 *
 * When every LLM section fails, `assembleResponse` serves the canned
 * `createSummaryFallback` template and flags the response `degraded: true`.
 * `ChatMessageService.tryLlmCacheStore` then stores that template in Redis under
 * `llm:v3:*` — for up to SEVEN DAYS (`TTL_GENERIC_S`). Consequence: once the
 * outage is fixed, every previously-asked question KEEPS returning the empty
 * template, served from cache. The fix alone does not restore the product.
 *
 * The code already reasons about what must never be cached
 * (`chat-message.service.ts` — "a refusal must never be cached", for the
 * off-topic cool-down). It simply never considered the degraded case.
 *
 * THE TRAP THIS FILE EXISTS TO CLOSE — the obvious guard is a silent no-op:
 *
 *   if (aiResult.metadata.diagnostics?.degraded) return;   // ← DEAD IN PROD
 *
 * `metadata.diagnostics` is attached ONLY when `env.llm.includeDiagnostics` is
 * true (`langchain-orchestrator-assembly.ts`), and that flag is HARD-CODED to
 * `false` outside development (`env.ts:194-195`, deliberately — it guards against
 * a NODE_ENV typo leaking prompt fragments). So in production the `degraded`
 * signal NEVER LEAVES the orchestrator, and a guard reading it would be green in
 * tests and inert in prod: a guard that guards nothing.
 *
 * Hence UC-C1: `degraded` must ride on `OrchestratorOutput` ITSELF,
 * unconditionally, independent of the debug flag.
 */
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import { InMemoryCacheService } from 'tests/helpers/cache/inMemoryCacheService';

import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

const USER_ID = 4242;
const LLM_CACHE_PREFIX = 'llm:v3:';

/** The exact shape the orchestrator returns when every section failed. */
class DegradedOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return {
      text: 'Quick summary: Who painted the Mona Lisa? Next step: compare composition details with a nearby work.',
      metadata: {},
      // UC-C1 — carried on the OUTPUT, not buried in `metadata.diagnostics`
      // (which production erases). This property does not exist on the port
      // today: that is the RED.
      degraded: true,
    };
  }
}

/** A healthy answer — MUST still be cached (a fix that caches nothing is also broken). */
class HealthyOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return {
      text: 'The Mona Lisa was painted by Leonardo da Vinci and is kept at the Louvre.',
      metadata: {},
      degraded: false,
    };
  }
}

const llmCacheWrites = (setSpy: jest.SpyInstance): string[] =>
  setSpy.mock.calls
    .map((call) => String(call[0]))
    .filter((key) => key.startsWith(LLM_CACHE_PREFIX));

describe('INC-2026-07-14 — a degraded LLM answer must never poison the cache', () => {
  it('UC-C1 — `degraded` rides on OrchestratorOutput itself, not on the prod-erased `metadata.diagnostics`', async () => {
    const output: OrchestratorOutput = await new DegradedOrchestrator().generate();

    // If this compiles and holds, the signal survives production, where
    // `metadata.diagnostics` is always undefined (env.ts:194-195).
    expect(output.degraded).toBe(true);
    expect(output.metadata.diagnostics).toBeUndefined();
  });

  it('UC-C2 — a degraded response is NOT written to the LLM cache', async () => {
    const cache = new InMemoryCacheService();
    const setSpy = jest.spyOn(cache, 'set');
    const service = buildChatTestService({ cache, orchestrator: new DegradedOrchestrator() });

    const session = await service.createSession({ userId: USER_ID });
    await service.postMessage(
      session.id,
      { text: 'Who painted the Mona Lisa?' },
      undefined,
      USER_ID,
    );

    expect(llmCacheWrites(setSpy)).toEqual([]);
  });

  it('UC-C3 — a HEALTHY response IS still written to the LLM cache (no over-blocking)', async () => {
    const cache = new InMemoryCacheService();
    const setSpy = jest.spyOn(cache, 'set');
    const service = buildChatTestService({ cache, orchestrator: new HealthyOrchestrator() });

    const session = await service.createSession({ userId: USER_ID });
    await service.postMessage(
      session.id,
      { text: 'Who painted the Mona Lisa?' },
      undefined,
      USER_ID,
    );

    expect(llmCacheWrites(setSpy).length).toBeGreaterThan(0);
  });

  it('UC-C4 — an orchestrator that omits `degraded` still caches (back-compat: the flag is opt-in on the port, mandatory on the real adapter — see UC-C5)', async () => {
    const cache = new InMemoryCacheService();
    const setSpy = jest.spyOn(cache, 'set');
    // Default FakeOrchestrator sets no `degraded` at all.
    const service = buildChatTestService({ cache });

    const session = await service.createSession({ userId: USER_ID });
    await service.postMessage(session.id, { text: 'Hello' }, undefined, USER_ID);

    expect(llmCacheWrites(setSpy).length).toBeGreaterThan(0);
  });
});
